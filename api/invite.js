const crypto = require('crypto');
const { withTx } = require('../lib/db');
const { handler, requireUser, hashPassword } = require('../lib/auth');
const { err, str } = require('../lib/store');
const { sendMail, baseUrl } = require('../lib/mail');
const { newToken, newPassword, linkFor, inviteMail } = require('../lib/invites');

// Crée (ou réinitialise) le compte Client associé à une adresse. Retourne le mot de passe à communiquer, ou '' si le compte existant est conservé.
async function clientAccount(c, email, org, reset) {
  const u = (await c.query('SELECT id, role FROM users WHERE lower(email)=$1', [email])).rows[0];
  if (u && u.role !== 'Client') throw err(400, `${email} possède déjà un compte interne (${u.role}) : il ne peut pas recevoir d'invitation.`);
  if (u && !reset) return '';
  const pw = newPassword();
  if (u) await c.query('UPDATE users SET pass_hash=$2, active=true WHERE id=$1', [u.id, hashPassword(pw)]);
  else await c.query("INSERT INTO users (id,name,email,pass_hash,role,org,active) VALUES ($1,$2,$3,$4,'Client',$5,true)", ['c' + crypto.randomBytes(6).toString('hex'), email.split('@')[0].slice(0, 80), email, hashPassword(pw), org]);
  return pw;
}

// Crée des invitations (une par e-mail, avec compte Client) ou régénère les accès d'une invitation existante.
module.exports = handler('POST', async (req, res) => {
  const b = req.body || {}, base = baseUrl(req);
  const made = await withTx(async c => {
    const user = await requireUser(c, req);
    if (!user.perms.includes('edit')) throw err(403, `Votre rôle (${user.role}) ne permet pas d'envoyer des invitations.`);
    const event = (await c.query("SELECT value->>'ev' ev FROM settings WHERE key='template'")).rows[0].ev;
    const out = [];
    if (b.resend) {
      const t = newToken();
      const r = await c.query('UPDATE invitations i SET token_hash=$2, last_sent_at=now() FROM categories k WHERE i.id=$1 AND k.code=i.category_code RETURNING i.email, i.organisation org, k.label', [Number(b.resend) || 0, t.hash]);
      if (!r.rows[0]) throw err(404, 'Invitation introuvable.');
      const i = r.rows[0];
      out.push({ ...i, link: linkFor(base, t.token), password: await clientAccount(c, i.email.toLowerCase(), i.org, true) });
      await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', [user.name, 'Invitations', `Accès régénérés pour ${i.email}`]);
    } else {
      const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map(e => str(e, 120).toLowerCase()).filter(Boolean))], org = str(b.org, 120);
      if (!emails.length || emails.length > 50) throw err(400, 'Indiquez entre 1 et 50 adresses e-mail.');
      const bad = emails.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad) throw err(400, `Adresse e-mail invalide : ${bad}`);
      const cat = (await c.query('SELECT code, label FROM categories WHERE code=$1', [str(b.cat, 8)])).rows[0];
      if (!cat || !org) throw err(400, 'Catégorie et organisation sont obligatoires.');
      for (const email of emails) {
        const t = newToken(), password = await clientAccount(c, email, org, false);
        await c.query('INSERT INTO invitations (token_hash,email,category_code,organisation,created_by,last_sent_at) VALUES ($1,$2,$3,$4,$5,now())', [t.hash, email, cat.code, org, user.name]);
        out.push({ email, org, label: cat.label, link: linkFor(base, t.token), password });
      }
      await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', [user.name, 'Invitations', `${emails.length} invitation(s) et compte(s) Client créés — ${cat.label}, ${org}`]);
    }
    return { out, event };
  });
  const results = [];
  for (const i of made.out) {
    const m = inviteMail({ base, link: i.link, event: made.event, label: i.label, org: i.org, email: i.email, password: i.password }), r = await sendMail({ to: i.email, ...m });
    results.push({ email: i.email, link: i.link, password: i.password, sent: r.sent, reason: r.reason || '', subject: m.subject, text: m.text });
  }
  res.status(200).json({ ok: true, results });
});
