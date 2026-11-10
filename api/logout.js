const { handler, clearCookie } = require('../lib/auth');
module.exports = handler('POST', async (req, res) => {
  res.setHeader('Set-Cookie', clearCookie());
  res.status(200).json({ ok: true });
});
