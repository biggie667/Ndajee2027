const { withDb } = require('../lib/boot');
const { handler, requireUser } = require('../lib/auth');
const { err } = require('../lib/store');
const { integrity } = require('../lib/integrity');

// Rapport d'intégrité détaillé de la base, réservé aux administrateurs.
module.exports = handler('GET', async (req, res) => {
  res.status(200).json(await withDb(async c => {
    const u = await requireUser(c, req);
    if (!u.perms.includes('admin')) throw err(403, 'Réservé aux administrateurs.');
    return integrity(c, true);
  }));
});
