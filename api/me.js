const { withTx } = require('../lib/db');
const { requireUser, hashPassword, checkPassword } = require('../lib/auth');
const { err } = require('../lib/store');
const F = require('../lib/selfform');

// Espace personnel (compte Client) : son propre dossier, et le changement de mot de passe de tout utilisateur.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await withTx(async c => { const u = await requireUser(c, req); return F.view(c, await F.byEmail(c, u.email)); }));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const b = req.body || {};
    if (b.newPassword !== undefined) {
      const np = String(b.newPassword);
      if (np.length < 8) throw err(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
      await withTx(async c => {
        const u = await requireUser(c, req), h = (await c.query('SELECT pass_hash FROM users WHERE id=$1', [u.id])).rows[0].pass_hash;
        if (!checkPassword(String(b.oldPassword || ''), h)) throw err(400, 'Le mot de passe actuel est incorrect.');
        await c.query('UPDATE users SET pass_hash=$2 WHERE id=$1', [u.id, hashPassword(np)]);
      });
      return res.status(200).json({ ok: true });
    }
    const d = F.clean(b);
    await withTx(async c => { const u = await requireUser(c, req); await F.submit(c, await F.byEmail(c, u.email, true), d, u.name); });
    res.status(200).json({ ok: true });
  } catch (e) {
    if (/^(22|23)/.test(e.code || '')) { e.status = 400; e.message = 'Données invalides.'; }
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
  }
};
