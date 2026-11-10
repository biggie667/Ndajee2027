const { withTx } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');
const { applySync } = require('../lib/store');

// Applique un lot de modifications dans une seule transaction (tout ou rien).
module.exports = handler('POST', async (req, res) => {
  await withTx(async c => {
    const user = await requireUser(c, req);
    await applySync(c, user, req.body);
  });
  res.status(200).json({ ok: true });
});
