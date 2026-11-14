// Point d'entrée base de données des fonctions API : garantit, une fois par instance, que la base existe et est à jour.
const { withTx } = require('./db');
const { ensureDb } = require('./store');
let ready = null;
async function withDb(fn) {
  if (!ready) ready = withTx(c => ensureDb(c)).catch(e => { ready = null; throw e; });
  await ready;
  return withTx(fn);
}
module.exports = { withDb };
