const { withTx } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');
const { err, issuesOf, PERSON_SQL } = require('../lib/store');
const { sendMail, baseUrl } = require('../lib/mail');
const { newToken, linkFor } = require('../lib/invites');

// Signale un dossier incomplet à la personne concernée ou au(x) représentant(s) de son organisation.
module.exports = handler('POST', async (req, res) => {
  const b = req.body || {}, base = baseUrl(req), target = b.target === 'org' ? 'org' : 'person';
  const m = await withTx(async c => {
    const user = await requireUser(c, req);
    if (!user.perms.includes('review')) throw err(403, `Votre rôle (${user.role}) ne permet pas de notifier un dossier.`);
    const p = (await c.query(PERSON_SQL + ' WHERE p.id=$1', [String(b.pid || '')])).rows[0];
    if (!p) throw err(404, 'Dossier introuvable.');
    const event = (await c.query("SELECT value->>'ev' ev FROM settings WHERE key='template'")).rows[0].ev;
    const points = issuesOf(p).map(i => '- ' + i[0]);
    if (p.note) points.push('- Commentaire du service accréditation : ' + p.note);
    if (!points.length) throw err(400, 'Ce dossier ne présente aucune anomalie à signaler.');
    const name = `${p.fn} ${p.ln.toUpperCase()}`;
    let to, text;
    if (target === 'person') {
      if (!p.email) throw err(400, "Aucune adresse e-mail n'est enregistrée pour cette personne. Ajoutez-la au dossier ou notifiez le représentant d'organisation.");
      to = [p.email];
      const t = newToken(), inv = await c.query('UPDATE invitations SET token_hash=$2, last_sent_at=now() WHERE person_id=$1 RETURNING id', [p.id, t.hash]);
      if (!inv.rowCount) await c.query('INSERT INTO invitations (token_hash,email,category_code,organisation,person_id,created_by,last_sent_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [t.hash, p.email, p.cat, p.org, p.id, user.name]);
      const editable = ['DRAFT', 'SUB', 'RET'].includes(p.st);
      text = `Bonjour ${p.fn},\n\nVotre dossier d'accréditation ${event} (n° ${p.id}) est incomplet. Points à régulariser :\n${points.join('\n')}\n\n` +
        (editable ? `Vous pouvez mettre à jour vos informations et votre photo en vous connectant à votre compte sur ${base}/ ou avec ce lien personnel :\n${linkFor(base, t.token)}\n\nPour une pièce d'identité ou tout autre élément, répondez à ce message ou contactez votre organisation.` : `Merci de contacter votre organisation ou le service accréditation pour régulariser.`) +
        `\n\nL'équipe accréditation`;
    } else {
      to = (await c.query(`SELECT email FROM users WHERE active AND org=$1 AND role='Représentant d''organisation'`, [p.org])).rows.map(r => r.email);
      if (!to.length) throw err(400, `Aucun représentant actif n'est enregistré pour l'organisation « ${p.org} ». Créez son compte dans « Utilisateurs & rôles ».`);
      text = `Bonjour,\n\nLe dossier d'accréditation ${event} de ${name} (n° ${p.id}, ${p.org}) est incomplet. Points à régulariser :\n${points.join('\n')}\n\nVous pouvez le compléter depuis la plateforme :\n${base}/\n\nL'équipe accréditation`;
    }
    await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [user.name, 'Notification', `Dossier incomplet signalé ${target === 'person' ? 'à la personne' : "au représentant d'organisation"} (${to.join(', ')})`, p.id]);
    return { to, subject: `${event} — dossier d'accréditation incomplet (${name})`, text };
  });
  const r = await sendMail(m);
  res.status(200).json({ ok: true, sent: r.sent, reason: r.reason || '', ...m });
});
