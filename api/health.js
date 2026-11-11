const { withTx } = require('../lib/db');
const { handler } = require('../lib/auth');
const { ensureDb } = require('../lib/store');

// Vérifie la clé du service d'envoi sans envoyer de message.
async function mailStatus() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { cle: false, etat: 'clé RESEND_API_KEY absente' };
  const o = { cle: true, expediteur: process.env.MAIL_FROM ? 'personnalisé (MAIL_FROM)' : 'par défaut (onboarding@resend.dev)' };
  try {
    const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: 'Bearer ' + key } }), j = await r.json().catch(() => ({}));
    if (r.ok) { const d = j.data || []; return { ...o, etat: 'clé valide', domaines: d.length, domaines_verifies: d.filter(x => x.status === 'verified').length }; }
    if (j.name === 'restricted_api_key') return { ...o, etat: "clé valide (limitée à l'envoi)" };
    return { ...o, etat: 'clé refusée par Resend : ' + (j.message || r.status) };
  } catch (e) { return { ...o, etat: 'Resend injoignable' }; }
}
// État du service. Crée ou met à niveau la base si nécessaire.
module.exports = handler('GET', async (req, res) => {
  const r = await withTx(async c => {
    await ensureDb(c);
    return (await c.query("SELECT (SELECT count(*) FROM persons)::int AS dossiers, (SELECT count(*) FROM users WHERE active AND role<>'Client')::int AS comptes, (SELECT count(*) FROM users WHERE role='Client')::int AS comptes_clients, (SELECT count(*) FROM invitations)::int AS invitations")).rows[0];
  });
  res.status(200).json({ ok: true, database: 'connectée', session: !!process.env.SESSION_SECRET, ...r, mail: await mailStatus() });
});
