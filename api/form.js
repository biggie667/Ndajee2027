const { withTx } = require('../lib/db');
const F = require('../lib/selfform');

// Formulaire public d'inscription : accessible uniquement avec un lien d'invitation valide.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const token = String((req.query && req.query.t) || new URL(req.url, 'http://x').searchParams.get('t') || '');
      return res.status(200).json(await withTx(async c => F.view(c, await F.byToken(c, token))));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const d = F.clean(req.body || {});
    await withTx(async c => F.submit(c, await F.byToken(c, String((req.body || {}).t || ''), true), d, 'Formulaire en ligne'));
    res.status(200).json({ ok: true });
  } catch (e) {
    if (/^(22|23)/.test(e.code || '')) { e.status = 400; e.message = 'Données invalides.'; }
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
  }
};
