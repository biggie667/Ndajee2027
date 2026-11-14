const { withDb } = require('../lib/boot');
const { handler, checkPassword, makeCookie } = require('../lib/auth');

const MAX = 8, WINDOW = '15 minutes';
module.exports = handler('POST', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120), password = String(req.body.password || '').slice(0, 200);
  const r = await withDb(async c => {
    // Au-delà de 8 échecs en 15 minutes pour une même adresse, les essais sont refusés sans vérifier le mot de passe.
    const n = (await c.query(`SELECT count(*)::int n FROM login_attempts WHERE email=$1 AND at > now() - interval '${WINDOW}'`, [email])).rows[0].n;
    if (n >= MAX) return { locked: true };
    const u = (await c.query('SELECT id, pass_hash FROM users WHERE lower(email)=$1 AND active', [email])).rows[0];
    if (u && checkPassword(password, u.pass_hash)) { await c.query('DELETE FROM login_attempts WHERE email=$1', [email]); return { u }; }
    await c.query('INSERT INTO login_attempts (email) VALUES ($1)', [email]);
    await c.query("DELETE FROM login_attempts WHERE at < now() - interval '1 day'");
    return {};
  });
  if (r.locked) return res.status(429).json({ error: 'Trop de tentatives pour cette adresse. Réessayez dans 15 minutes.' });
  if (!r.u) {
    await new Promise(x => setTimeout(x, 500)); // ralentit les essais répétés
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  }
  res.setHeader('Set-Cookie', makeCookie(r.u.id, r.u.pass_hash));
  res.status(200).json({ ok: true });
});
