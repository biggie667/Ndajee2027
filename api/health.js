const { withTx } = require('../lib/db');
const { handler } = require('../lib/auth');
const { ensureDb } = require('../lib/store');
// État du service. Crée et alimente la base si elle est encore vide.
module.exports = handler('GET', async (req, res) => {
  const r = await withTx(async c => {
    await ensureDb(c);
    return (await c.query('SELECT (SELECT count(*) FROM persons)::int AS dossiers, (SELECT count(*) FROM users WHERE active)::int AS comptes, (SELECT count(*) FROM zones)::int AS zones, (SELECT count(*) FROM audit_log)::int AS audit')).rows[0];
  });
  res.status(200).json({ ok: true, database: 'connectée', session: !!process.env.SESSION_SECRET, ...r });
});
