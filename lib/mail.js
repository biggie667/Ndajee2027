// Envoi d'e-mails via Resend (https://resend.com). Sans clé RESEND_API_KEY, rien n'est envoyé :
// l'appelant reçoit sent:false et peut transmettre le message à la main.
async function sendMail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY, list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { sent: false, reason: 'Aucune adresse e-mail destinataire.' };
  if (!key) return { sent: false, reason: "Envoi automatique non configuré (clé RESEND_API_KEY absente)." };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'NDAGE 2026 <onboarding@resend.dev>', to: list, subject, text })
    });
    if (r.ok) return { sent: true };
    const j = await r.json().catch(() => ({}));
    return { sent: false, reason: "Le service d'envoi a refusé le message : " + (j.message || r.status) };
  } catch (e) { return { sent: false, reason: "Service d'envoi injoignable." }; }
}
const baseUrl = req => (req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')) + '://' + String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.:-]/g, '');
module.exports = { sendMail, baseUrl };
