const { withDb } = require('../lib/boot');
const { handler, requireUser } = require('../lib/auth');
const { loadState } = require('../lib/store');

module.exports = handler('GET', async (req, res) => {
  const state = await withDb(async c => {
    const user = await requireUser(c, req);
    if (!user.perms.includes('view')) return { client: true, name: user.name, email: user.email };
    return loadState(c, user);
  });
  res.status(200).json(state);
});
