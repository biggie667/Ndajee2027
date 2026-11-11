// Dossier personnel d'un invité : lecture et dépôt, par lien (jeton) ou par compte Client.
const { err, str } = require('./store');
const { hash } = require('./invites');

const OPEN = ['DRAFT', 'SUB', 'RET'];
const SQL = `SELECT i.id, i.email, i.category_code cat, i.organisation org, i.person_id pid, k.label,
  p.last_name ln, p.first_name fn, p.address addr, p.phone tel, p.function fct, p.photo, p.status st, p.review_note note
  FROM invitations i JOIN categories k ON k.code=i.category_code LEFT JOIN persons p ON p.id=i.person_id`;
async function byToken(c, token, lock) {
  const r = await c.query(`${SQL} WHERE i.token_hash=$1 ${lock ? 'FOR UPDATE OF i' : ''}`, [hash(token)]);
  if (!r.rows[0]) throw err(404, "Ce lien n'est pas valide ou a été remplacé par un lien plus récent.");
  return r.rows[0];
}
async function byEmail(c, email, lock) {
  const r = await c.query(`${SQL} WHERE lower(i.email)=lower($1) ORDER BY i.id DESC LIMIT 1 ${lock ? 'FOR UPDATE OF i' : ''}`, [email]);
  if (!r.rows[0]) throw err(404, "Aucune demande d'accréditation n'est associée à ce compte. Contactez votre organisation.");
  return r.rows[0];
}
async function view(c, i) {
  const event = (await c.query("SELECT value->>'ev' ev FROM settings WHERE key='template'")).rows[0].ev;
  return { event, category: i.label, org: i.org, email: i.email, status: i.pid ? i.st : 'NEW', editable: !i.pid || OPEN.includes(i.st), note: i.st === 'RET' ? i.note : '',
    person: i.pid ? { ln: i.ln, fn: i.fn, addr: i.addr, tel: i.tel, fct: i.fct, photo: i.photo } : null };
}
function clean(b) {
  const d = { ln: str(b.ln, 80), fn: str(b.fn, 80), addr: str(b.addr, 200), tel: str(b.tel, 40), fct: str(b.fct, 120),
    photo: typeof b.photo === 'string' && b.photo.startsWith('data:image/') && b.photo.length < 400000 ? b.photo : '' };
  if (!d.ln || !d.fn || !d.addr || !d.tel || !d.fct) throw err(400, 'Tous les champs sont obligatoires : nom, prénom, adresse, numéro et fonction.');
  if (!/^[+0-9 ().-]{6,40}$/.test(d.tel)) throw err(400, 'Numéro de téléphone invalide.');
  return d;
}
async function submit(c, i, d, via) {
  if (!i.pid) {
    if (!d.photo) throw err(400, 'La photo est obligatoire.');
    const m = (await c.query("SELECT coalesce(max(split_part(id,'-',1)::bigint),210000) m FROM persons")).rows[0].m;
    const id = (Number(m) + 1 + Math.floor(Math.random() * 30)) + '-' + (10 + Math.floor(Math.random() * 80));
    await c.query(`INSERT INTO persons (id,last_name,first_name,category_code,organisation,function,address,phone,email,photo,has_photo,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'SUB')`, [id, d.ln, d.fn, i.cat, i.org, d.fct, d.addr, d.tel, i.email, d.photo]);
    await c.query('UPDATE invitations SET person_id=$2, submitted_at=now() WHERE id=$1', [i.id, id]);
    await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [via, 'Invitations', `Dossier déposé par ${d.fn} ${d.ln.toUpperCase()} (${i.email})`, id]);
  } else {
    if (!OPEN.includes(i.st)) throw err(409, 'Votre dossier est déjà en cours de traitement : il ne peut plus être modifié en ligne.');
    if (!d.photo && !i.photo) throw err(400, 'La photo est obligatoire.');
    await c.query(`UPDATE persons SET last_name=$2, first_name=$3, function=$4, address=$5, phone=$6, photo=CASE WHEN $7<>'' THEN $7 ELSE photo END, has_photo=true,
      status='SUB', review_note='', updated_at=now() WHERE id=$1`, [i.pid, d.ln, d.fn, d.fct, d.addr, d.tel, d.photo]);
    await c.query('UPDATE invitations SET submitted_at=now() WHERE id=$1', [i.id]);
    await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [via, 'Invitations', `Dossier mis à jour par ${d.fn} ${d.ln.toUpperCase()}`, i.pid]);
  }
}
module.exports = { byToken, byEmail, view, clean, submit };
