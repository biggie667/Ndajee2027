const { withDb } = require('../lib/boot');
const { handler, requireUser } = require('../lib/auth');
const { applySync } = require('../lib/store');

// Applique un lot de modifications dans une seule transaction (tout ou rien).
module.exports = handler('POST', async (req, res) => {
  const r = await withDb(async c => {
    const user = await requireUser(c, req);
    return applySync(c, user, req.body);
  });
  res.status(200).json({ ok: true, remap: r.remap }); // remap : numéros réattribués côté serveur (collision évitée)
});
