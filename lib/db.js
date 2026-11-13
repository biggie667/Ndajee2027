const { Pool } = require('pg');
let pool;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) { const e = new Error('Base de données non configurée (variable DATABASE_URL absente).'); e.status = 503; throw e; }
    // sslmode=require équivaut aujourd'hui à verify-full dans pg : on le demande explicitement (supprime l'avertissement de sécurité).
    pool = new Pool({ connectionString: url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full'), max: 3, idleTimeoutMillis: 10000 });
  }
  return pool;
}
// Exécute fn dans une transaction ; annule tout en cas d'erreur.
async function withTx(fn) {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { c.release(); }
}
module.exports = { getPool, withTx };
