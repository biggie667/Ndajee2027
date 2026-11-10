const { withTx } = require('../lib/db');
const { err, str } = require('../lib/store');
const { hash } = require('../lib/invites');

// Formulaire public d'inscription : accessible uniquement avec un lien d'invitation valide.
const OPEN = ['DRAFT', 'SUB', 'RET'];
async function find(c, token, lock) {
  const r = await c.query(`SELECT i.id, i.email, i.category_code cat, i.organisation org, i.person_id pid, k.label,
    p.last_name ln, p.first_name fn, p.address addr, p.phone tel, p.function fct, p.photo, p.status st, p.review_note note
    FROM invitations i JOIN categories k ON k.code=i.category_code LEFT JOIN persons p ON p.id=i.person_id WHERE i.token_hash=$1 ${lock ? 'FOR UPDATE OF i' : ''}`, [hash(token)]);
  if (!r.rows[0]) throw err(404, "Ce lien n'est pas valide ou a été remplacé par un lien plus récent.");
  return r.rows[0];
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const token = String((req.query && req.query.t) || new URL(req.url, 'http://x').searchParams.get('t') || '');
      const d = await withTx(async c => {
        const i = await find(c, token);
        const event = (await c.query("SELECT value->>'ev' ev FROM settings WHERE key='template'")).rows[0].ev;
        return { event, category: i.label, org: i.org, email: i.email, status: i.pid ? i.st : 'NEW', editable: !i.pid || OPEN.includes(i.st), note: i.st === 'RET' ? i.note : '',
          person: i.pid ? { ln: i.ln, fn: i.fn, addr: i.addr, tel: i.tel, fct: i.fct, photo: i.photo } : null };
      });
      return res.status(200).json(d);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const b = req.body || {};
    const ln = str(b.ln, 80), fn = str(b.fn, 80), addr = str(b.addr, 200), tel = str(b.tel, 40), fct = str(b.fct, 120);
    const photo = typeof b.photo === 'string' && b.photo.startsWith('data:image/') && b.photo.length < 400000 ? b.photo : '';
    if (!ln || !fn || !addr || !tel || !fct) throw err(400, 'Tous les champs sont obligatoires : nom, prénom, adresse, numéro et fonction.');
    if (!/^[+0-9 ().-]{6,40}$/.test(tel)) throw err(400, 'Numéro de téléphone invalide.');
    await withTx(async c => {
      const i = await find(c, String(b.t || ''), true);
      if (!i.pid) {
        if (!photo) throw err(400, 'La photo est obligatoire.');
        const m = (await c.query("SELECT coalesce(max(split_part(id,'-',1)::bigint),210000) m FROM persons")).rows[0].m;
        const id = (Number(m) + 1 + Math.floor(Math.random() * 30)) + '-' + (10 + Math.floor(Math.random() * 80));
        await c.query(`INSERT INTO persons (id,last_name,first_name,category_code,organisation,function,address,phone,email,photo,has_photo,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'SUB')`, [id, ln, fn, i.cat, i.org, fct, addr, tel, i.email, photo]);
        await c.query('UPDATE invitations SET person_id=$2, submitted_at=now() WHERE id=$1', [i.id, id]);
        await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', ['Formulaire en ligne', 'Invitations', `Dossier déposé par ${fn} ${ln.toUpperCase()} (${i.email})`, id]);
      } else {
        if (!OPEN.includes(i.st)) throw err(409, 'Votre dossier est déjà en cours de traitement : il ne peut plus être modifié en ligne.');
        if (!photo && !i.photo) throw err(400, 'La photo est obligatoire.');
        await c.query(`UPDATE persons SET last_name=$2, first_name=$3, function=$4, address=$5, phone=$6, photo=CASE WHEN $7<>'' THEN $7 ELSE photo END, has_photo=true,
          status='SUB', review_note='', updated_at=now() WHERE id=$1`, [i.pid, ln, fn, fct, addr, tel, photo]);
        await c.query('UPDATE invitations SET submitted_at=now() WHERE id=$1', [i.id]);
        await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', ['Formulaire en ligne', 'Invitations', `Dossier mis à jour par ${fn} ${ln.toUpperCase()}`, i.pid]);
      }
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    if (/^(22|23)/.test(e.code || '')) { e.status = 400; e.message = 'Données invalides.'; }
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
  }
};
