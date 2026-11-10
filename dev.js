// Serveur local de développement : sert public/ et les fonctions api/ comme Vercel.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith('/api/')) {
    const f = path.join(__dirname, 'api', url.pathname.slice(5).replace(/[^a-z]/g, '') + '.js');
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Introuvable' });
    let raw = '';
    req.on('data', d => raw += d).on('end', () => { try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; } require(f)(req, res); });
    return;
  }
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, d) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(d); });
}).listen(PORT, () => console.log('http://localhost:' + PORT));
