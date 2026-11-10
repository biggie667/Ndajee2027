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
function makeCookie(userId) {
  const body = Buffer.from(JSON.stringify({ u: userId, x: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${process.env.VERCEL ? '; Secure' : ''}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
function sessionUserId(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.x > Date.now() / 1000 ? d.u : null; } catch (e) { return null; }
}
// Retourne l'utilisateur connecté (avec ses permissions) ou lève une erreur 401.
async function requireUser(c, req) {
  const id = sessionUserId(req);
  if (id) {
    const r = await c.query('SELECT u.id, u.name, u.role, r.perms FROM users u JOIN roles r ON r.name = u.role WHERE u.id = $1 AND u.active', [id]);
    if (r.rows[0]) return r.rows[0];
  }
  const e = new Error('Session expirée, reconnectez-vous.'); e.status = 401; throw e;
}
// Enveloppe commune des fonctions API : méthode, erreurs, JSON.
function handler(method, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== method) return res.status(405).json({ error: 'Méthode non autorisée' });
    try { await fn(req, res); }
    catch (e) {
      if (/^(22|23)/.test(e.code || '')) { e.status = 400; e.message = 'Données invalides ou référence inexistante.'; }
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
    }
  };
}
module.exports = { hashPassword, checkPassword, makeCookie, clearCookie, requireUser, handler };
