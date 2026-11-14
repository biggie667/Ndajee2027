const crypto = require('crypto');
const COOKIE = 'ndage_sid';
const TTL = 12 * 3600; // secondes

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) { const e = new Error('SESSION_SECRET non configuré.'); e.status = 503; throw e; }
  return s;
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sign = v => crypto.createHmac('sha256', secret()).update(v).digest('base64url');
// Empreinte du mot de passe portée par la session : changer ou réinitialiser le mot de passe ferme les sessions ouvertes.
const stamp = passHash => crypto.createHash('sha256').update(String(passHash)).digest('hex').slice(0, 16);
function makeCookie(userId, passHash) {
  const body = Buffer.from(JSON.stringify({ u: userId, v: stamp(passHash), x: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${process.env.VERCEL ? '; Secure' : ''}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.VERCEL ? '; Secure' : ''}`;
function session(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.x > Date.now() / 1000 ? d : null; } catch (e) { return null; }
}
// Retourne l'utilisateur connecté (permissions, organisation, cloisonnement) ou lève une erreur 401.
async function requireUser(c, req) {
  const s = session(req);
  if (s) {
    const u = (await c.query('SELECT u.id, u.name, u.email, u.org, u.role, u.pass_hash, r.perms, r.scoped FROM users u JOIN roles r ON r.name = u.role WHERE u.id = $1 AND u.active', [String(s.u)])).rows[0];
    if (u && s.v === stamp(u.pass_hash)) { delete u.pass_hash; return u; }
  }
  const e = new Error('Session expirée, reconnectez-vous.'); e.status = 401; throw e;
}
// Une écriture doit venir d'une page du site lui-même (protection contre les requêtes forgées depuis un autre site).
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === String(req.headers['x-forwarded-host'] || req.headers.host); } catch (e) { return false; }
}
// Enveloppe commune des fonctions API : méthodes acceptées, origine, erreurs, JSON. routes = { GET: fn, POST: fn }.
function route(routes) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fn = routes[req.method];
    if (!fn) return res.status(405).json({ error: 'Méthode non autorisée' });
    if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'Origine de la requête refusée.' });
    if (req.method !== 'GET' && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body))) req.body = {};
    try { await fn(req, res); }
    catch (e) {
      if (/^(22|23)/.test(e.code || '')) { e.status = 400; e.message = 'Données invalides ou référence inexistante.'; }
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
    }
  };
}
const handler = (method, fn) => route({ [method]: fn });
module.exports = { hashPassword, checkPassword, makeCookie, clearCookie, requireUser, handler, route };
