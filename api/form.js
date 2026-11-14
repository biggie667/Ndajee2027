const { withDb } = require('../lib/boot');
const { route } = require('../lib/auth');
const F = require('../lib/selfform');

// Formulaire public d'inscription : accessible uniquement avec un lien d'invitation valide.
module.exports = route({
  GET: async (req, res) => {
    const token = String((req.query && req.query.t) || new URL(req.url, 'http://x').searchParams.get('t') || '');
    res.status(200).json(await withDb(async c => F.view(c, await F.byToken(c, token))));
  },
  POST: async (req, res) => {
    const d = F.clean(req.body);
    await withDb(async c => F.submit(c, await F.byToken(c, String(req.body.t || ''), true), d, 'Formulaire en ligne'));
    res.status(200).json({ ok: true });
  }
});
