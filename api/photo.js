const { withDb } = require('../lib/boot');
const { handler, requireUser } = require('../lib/auth');
const { err } = require('../lib/store');

// Photo d'un dossier, servie à l'unité (les listes ne transportent pas les images). Réservée aux comptes internes.
module.exports = handler('GET', async (req, res) => {
  const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
  const photo = await withDb(async c => {
    const u = await requireUser(c, req);
    if (!u.perms.includes('view')) throw err(403, 'Accès refusé.');
    const p = (await c.query('SELECT photo, organisation FROM persons WHERE id=$1', [id])).rows[0];
    if (!p || !p.photo || (u.scoped && p.organisation !== u.org)) throw err(404, 'Photo introuvable.');
    return p.photo;
  });
  const m = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return res.status(404).json({ error: 'Photo introuvable.' });
  res.setHeader('Content-Type', m[1]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400'); // l'adresse change (paramètre v) quand la photo est remplacée
  res.statusCode = 200;
  res.end(Buffer.from(m[2], 'base64'));
});
