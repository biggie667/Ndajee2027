const { withTx } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');
const { loadState } = require('../lib/store');

module.exports = handler('GET', async (req, res) => {
  const state = await withTx(async c => {
    const t = await c.query("SELECT to_regclass('public.users') AS t");
    if (!t.rows[0].t) { const e = new Error('Session expirée, reconnectez-vous.'); e.status = 401; throw e; }
    const user = await requireUser(c, req);
    if (!user.perms.includes('view')) return { client: true, name: user.name, email: user.email };
    return loadState(c, user.id);
  });
  res.status(200).json(state);
});
