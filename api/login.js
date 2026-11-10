const { withTx } = require('../lib/db');
const { handler, checkPassword, makeCookie } = require('../lib/auth');
const { ensureDb } = require('../lib/store');

module.exports = handler('POST', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase(), password = String((req.body && req.body.password) || '');
  const user = await withTx(async c => {
    await ensureDb(c);
    return (await c.query('SELECT id, pass_hash FROM users WHERE lower(email)=$1 AND active', [email])).rows[0];
  });
  if (!user || !checkPassword(password, user.pass_hash)) {
    await new Promise(r => setTimeout(r, 600)); // ralentit les essais répétés
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  }
  res.setHeader('Set-Cookie', makeCookie(user.id));
  res.status(200).json({ ok: true });
});
