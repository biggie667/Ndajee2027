const { withTx } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');
const { err, str } = require('../lib/store');
const { sendMail, baseUrl } = require('../lib/mail');
const { newToken, linkFor, inviteMail } = require('../lib/invites');

// Crée des invitations (une par e-mail) ou régénère le lien d'une invitation existante.
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
      out.push({ ...r.rows[0], link: linkFor(base, t.token) });
    } else {
      const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map(e => str(e, 120).toLowerCase()).filter(Boolean))], org = str(b.org, 120);
      if (!emails.length || emails.length > 50) throw err(400, 'Indiquez entre 1 et 50 adresses e-mail.');
      const bad = emails.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad) throw err(400, `Adresse e-mail invalide : ${bad}`);
      const cat = (await c.query('SELECT code, label FROM categories WHERE code=$1', [str(b.cat, 8)])).rows[0];
      if (!cat || !org) throw err(400, 'Catégorie et organisation sont obligatoires.');
      for (const email of emails) {
        const t = newToken();
        await c.query('INSERT INTO invitations (token_hash,email,category_code,organisation,created_by,last_sent_at) VALUES ($1,$2,$3,$4,$5,now())', [t.hash, email, cat.code, org, user.name]);
        out.push({ email, org, label: cat.label, link: linkFor(base, t.token) });
      }
      await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', [user.name, 'Invitations', `${emails.length} invitation(s) créée(s) — ${cat.label}, ${org}`]);
    }
    return { out, event };
  });
  const results = [];
  for (const i of made.out) {
    const m = inviteMail(i.link, made.event, i.label, i.org), r = await sendMail({ to: i.email, ...m });
    results.push({ email: i.email, link: i.link, sent: r.sent, reason: r.reason || '', subject: m.subject, text: m.text });
  }
  res.status(200).json({ ok: true, results });
});
