const crypto = require('crypto');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
// Le lien contient le jeton ; la base n'en garde que l'empreinte.
function newToken() { const token = crypto.randomBytes(24).toString('base64url'); return { token, hash: hash(token) }; }
const linkFor = (base, token) => `${base}/?inv=${token}`;
function inviteMail(link, event, catLabel, org) {
  return {
    subject: `${event} — votre demande d'accréditation`,
    text: `Bonjour,\n\nVous êtes invité(e) à compléter votre demande d'accréditation pour ${event} (${catLabel} — ${org}).\n\nCliquez sur ce lien personnel pour renseigner vos informations (nom, prénom, adresse, numéro de téléphone, photo et fonction) :\n${link}\n\nCe lien vous est réservé : ne le transférez pas.\n\nL'équipe accréditation`
  };
}
module.exports = { hash, newToken, linkFor, inviteMail };
