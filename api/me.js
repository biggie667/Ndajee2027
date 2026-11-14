const { withDb } = require('../lib/boot');
const { route, requireUser, hashPassword, checkPassword, makeCookie } = require('../lib/auth');
const { err } = require('../lib/store');
const F = require('../lib/selfform');

// Espace personnel : le dossier d'un compte Client, et le changement de mot de passe de tout utilisateur.
module.exports = route({
  GET: async (req, res) => {
    res.status(200).json(await withDb(async c => { const u = await requireUser(c, req); return F.view(c, await F.byEmail(c, u.email)); }));
  },
  POST: async (req, res) => {
    const b = req.body;
    if (b.newPassword !== undefined) {
      const np = String(b.newPassword);
      if (np.length < 8 || np.length > 200) throw err(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
      const r = await withDb(async c => {
        const u = await requireUser(c, req), h = (await c.query('SELECT pass_hash FROM users WHERE id=$1 FOR UPDATE', [u.id])).rows[0].pass_hash;
        if (!checkPassword(String(b.oldPassword || ''), h)) throw err(400, 'Le mot de passe actuel est incorrect.');
        if (checkPassword(np, h)) throw err(400, 'Le nouveau mot de passe doit être différent de l\'actuel.');
        const nh = hashPassword(np);
        await c.query('UPDATE users SET pass_hash=$2 WHERE id=$1', [u.id, nh]);
        await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', [u.name, 'Utilisateurs', 'Mot de passe modifié par son titulaire']);
        return { id: u.id, nh };
      });
      res.setHeader('Set-Cookie', makeCookie(r.id, r.nh)); // la session en cours continue, les autres sont fermées
      return res.status(200).json({ ok: true });
    }
    const d = F.clean(b);
    await withDb(async c => { const u = await requireUser(c, req); if (u.perms.includes('view')) throw err(403, 'Réservé aux comptes Client.'); await F.submit(c, await F.byEmail(c, u.email, true), d, u.name); });
    res.status(200).json({ ok: true });
  }
});
