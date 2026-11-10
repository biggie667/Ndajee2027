const { getPool } = require('../lib/db');
const { handler } = require('../lib/auth');
module.exports = handler('GET', async (req, res) => {
  const r = await getPool().query("SELECT to_regclass('public.persons') IS NOT NULL AS ready");
  res.status(200).json({ ok: true, database: 'connectée', initialisee: r.rows[0].ready });
});
