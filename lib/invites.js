const crypto = require('crypto');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
// Le lien contient le jeton ; la base n'en garde que l'empreinte.
function newToken() { const token = crypto.randomBytes(24).toString('base64url'); return { token, hash: hash(token) }; }
const linkFor = (base, token) => `${base}/?inv=${token}`;
// Mot de passe initial lisible (sans caractères ambigus), propre à chaque compte.
function newPassword() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const part = n => Array.from(crypto.randomBytes(n), x => A[x % A.length]).join('');
  return `${part(4)}-${part(4)}-${part(4)}`;
}
function inviteMail({ base, link, event, label, org, email, password }) {
  const acc = password
    ? `Un compte personnel a été créé pour vous :\n  Adresse du site : ${base}/\n  Identifiant : ${email}\n  Mot de passe : ${password}\n\nConnectez-vous, renseignez vos informations (nom, prénom, adresse, numéro de téléphone, photo et fonction) puis envoyez votre demande. Vous pourrez changer votre mot de passe une fois connecté(e).\n\nAccès direct sans mot de passe : ${link}`
    : `Votre compte existe déjà : connectez-vous sur ${base}/ avec l'identifiant ${email} et votre mot de passe habituel.\n\nAccès direct sans mot de passe : ${link}`;
  return {
    subject: `${event} — votre demande d'accréditation`,
    text: `Bonjour,\n\nVous êtes invité(e) à déposer votre demande d'accréditation pour ${event} (${label} — ${org}).\n\n${acc}\n\nCes accès sont personnels : ne les transférez pas.\n\nL'équipe accréditation`
  };
}
module.exports = { hash, newToken, newPassword, linkFor, inviteMail };
