const SCHEMA = require('./schema');
const { seed, PERMS, ROLE_INFO } = require('./seed');
const { hashPassword } = require('./auth');

// Version du schéma : à incrémenter à chaque évolution de migrate(). Les mises à niveau ne tournent qu'une fois par version.
const SCHEMA_VERSION = 4;

const err = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const arr = v => (Array.isArray(v) ? [...new Set(v.map(x => String(x)))] : []);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Une photo est une image encodée, rien d'autre : tout autre contenu est rejeté (elle est réaffichée dans les écrans des agents).
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const cleanPhoto = v => (typeof v === 'string' && v.length < 400000 && PHOTO.test(v) ? v : '');

/* ---------- Création, mise à niveau ---------- */
// Crée la base si elle est vide, sinon la met à niveau si sa version est ancienne. Sans effet (une lecture) quand tout est à jour.
async function ensureDb(c, verbose) {
  const has = async () => (await c.query("SELECT to_regclass('public.settings') AS t")).rows[0].t;
  const version = async () => Number(((await c.query("SELECT value FROM settings WHERE key='schema_version'")).rows[0] || {}).value || 0);
  if (await has() && await version() >= SCHEMA_VERSION) return false;
  await c.query('SELECT pg_advisory_xact_lock(20262027)'); // un seul processus à la fois crée ou met à niveau
  if (!await has()) {
    const pw = process.env.SEED_PASSWORD;
    if (!pw || pw.length < 8) throw err(503, 'SEED_PASSWORD non configuré (8 caractères minimum) : impossible de créer le compte administrateur.');
    await c.query(SCHEMA);
    const demo = process.env.SEED_DEMO === '1', s = seed(demo);
    for (const [name, perms] of Object.entries(s.roles)) await c.query('INSERT INTO roles (name,perms) VALUES ($1,$2)', [name, perms]);
    for (const u of s.users) await c.query('INSERT INTO users (id,name,email,pass_hash,role,org,active,job_title) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [u.id, u.n, u.e, hashPassword(pw), u.role, u.org, !!u.on, u.job]);
    let i = 0;
    for (const k of s.cats) await c.query('INSERT INTO categories VALUES ($1,$2,$3,$4,$5,$6,$7)', [k.c, k.l, k.b, k.col, k.pop, !!s.matrix[k.c].m, i++]);
    i = 0; for (const z of s.zones) await c.query('INSERT INTO zones VALUES ($1,$2,$3,$4)', [z.c, z.n, !!z.o, i++]);
    i = 0; for (const p of s.privs) await c.query('INSERT INTO privileges VALUES ($1,$2,$3)', [p.c, p.n, i++]);
    for (const [k, m] of Object.entries(s.matrix)) {
      for (const z of m.z) await c.query('INSERT INTO category_zones VALUES ($1,$2)', [k, z]);
      for (const p of m.p) await c.query('INSERT INTO category_privileges VALUES ($1,$2)', [k, p]);
    }
    for (const p of [...s.persons].reverse()) await writePerson(c, p, true);
    for (const q of s.reqs) await c.query('INSERT INTO access_requests VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),$8,$9)', [q.id, q.pid, q.type, q.code, q.motif, q.by, q.t, q.st, q.dec]);
    await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', ['Système', 'Initialisation', demo ? 'Base créée avec le jeu de démonstration' : 'Base créée (référentiels et compte administrateur)']);
    await c.query("INSERT INTO settings VALUES ('template',$1)", [JSON.stringify(s.tpl)]);
    if (verbose) console.log(`${s.persons.length} dossiers, ${s.users.length} compte(s)`);
  }
  if (await version() < SCHEMA_VERSION) {
    await migrate(c);
    await c.query("INSERT INTO settings VALUES ('schema_version',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [JSON.stringify(SCHEMA_VERSION)]);
    await c.query('INSERT INTO audit_log (user_name,domain,detail) VALUES ($1,$2,$3)', ['Système', 'Base de données', `Schéma mis à niveau en version ${SCHEMA_VERSION}`]);
  }
  return true;
}

// Mises à niveau des bases créées avec une version antérieure. Chaque instruction est sans effet si elle a déjà été appliquée.
async function migrate(c) {
  const addCheck = async (table, name, expr) => {
    if ((await c.query('SELECT 1 FROM pg_constraint WHERE conname=$1', [name])).rowCount) return;
    await c.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expr}) NOT VALID`); // s'applique aux nouvelles écritures
    await c.query('SAVEPOINT chk');
    try { await c.query(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`); await c.query('RELEASE SAVEPOINT chk'); }
    catch (e) { await c.query('ROLLBACK TO SAVEPOINT chk'); } // des lignes anciennes ne la respectent pas : signalé par le contrôle d'intégrité
  };
  await c.query(`ALTER TABLE persons ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`);
  await c.query('ALTER TABLE persons ALTER COLUMN sex DROP NOT NULL');
  await c.query(`CREATE TABLE IF NOT EXISTS invitations (
    id bigserial PRIMARY KEY, token_hash text NOT NULL UNIQUE, email text NOT NULL,
    category_code text NOT NULL REFERENCES categories(code), organisation text NOT NULL,
    person_id text UNIQUE REFERENCES persons(id) ON DELETE SET NULL, created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), last_sent_at timestamptz, submitted_at timestamptz)`);
  await c.query(`CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{1,16}$'), label text NOT NULL, type text NOT NULL DEFAULT 'Autre', starts_on date,
    place text NOT NULL DEFAULT '', group_label text NOT NULL DEFAULT 'Groupe', groups text[] NOT NULL DEFAULT '{}',
    archived boolean NOT NULL DEFAULT false, sort int NOT NULL DEFAULT 0)`);
  await c.query(`ALTER TABLE persons ADD COLUMN IF NOT EXISTS event_id text REFERENCES events(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS event_id text REFERENCES events(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT ''`);
  await c.query('CREATE INDEX IF NOT EXISTS persons_event_idx ON persons (event_id)');

  // Version 4 : intitulés et missions des rôles, poste des utilisateurs, cloisonnement par organisation, anti-force brute, contraintes et index
  await c.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS mission text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS scoped boolean NOT NULL DEFAULT false`);
  await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT ''`);
  await c.query(`INSERT INTO roles (name,perms) VALUES ('Client','{self}') ON CONFLICT (name) DO NOTHING`);
  for (const [name, i] of Object.entries(ROLE_INFO)) await c.query(`UPDATE roles SET title=CASE WHEN title='' THEN $2 ELSE title END, mission=CASE WHEN mission='' THEN $3 ELSE mission END WHERE name=$1`, [name, i.t, i.m]);
  await c.query(`UPDATE roles SET scoped=true WHERE name='Représentant d''organisation' AND title=$1`, [ROLE_INFO["Représentant d'organisation"].t]);
  await c.query(`UPDATE users u SET job_title=r.title FROM roles r WHERE r.name=u.role AND u.job_title=''`);
  await c.query(`CREATE TABLE IF NOT EXISTS login_attempts (email text NOT NULL, at timestamptz NOT NULL DEFAULT now())`);
  await c.query('CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (email, at)');
  await c.query('UPDATE users SET email=lower(email) WHERE email<>lower(email)');
  await c.query('UPDATE persons SET email=lower(email) WHERE email<>lower(email)');
  await c.query('UPDATE invitations SET email=lower(email) WHERE email<>lower(email)');
  await addCheck('users', 'users_email_lower_chk', "email = lower(email) AND email LIKE '%_@_%'");
  await addCheck('users', 'users_name_chk', "name <> ''");
  await addCheck('persons', 'persons_id_chk', "id ~ '^[0-9]{4,9}-[0-9]{2}$'");
  await addCheck('persons', 'persons_identity_chk', "last_name <> '' AND first_name <> '' AND organisation <> ''");
  await addCheck('persons', 'persons_email_lower_chk', 'email = lower(email)');
  await addCheck('persons', 'persons_photo_chk', "photo = '' OR photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'");
  await addCheck('persons', 'persons_group_chk', "event_id IS NOT NULL OR grp = ''");
  await addCheck('access_requests', 'access_requests_code_chk', "(type = 'meal') = (code = '')");
  await addCheck('invitations', 'invitations_email_lower_chk', 'email = lower(email)');
  await c.query('CREATE INDEX IF NOT EXISTS persons_org_idx ON persons (organisation)');
  await c.query('CREATE INDEX IF NOT EXISTS persons_email_idx ON persons (email)');
  await c.query('CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (email)');
  await c.query('CREATE INDEX IF NOT EXISTS access_requests_status_idx ON access_requests (status)');
}

async function writePerson(c, p, isNew) {
  const v = [p.id, p.ln, p.fn, p.sx || null, p.dob || null, p.nat || '', p.cat, p.org, p.fct || '', p.photo || '', !!p.hasPh, !!p.doc, p.bg, p.st, !!p.xm, p.note || '', p.addr || '', p.tel || '', p.email || '', p.ev || null, p.ev ? p.grp || '' : ''];
  if (isNew) await c.query('INSERT INTO persons (id,last_name,first_name,sex,birth_date,nationality,category_code,organisation,function,photo,has_photo,doc_ok,bg_status,status,meal_extra,review_note,address,phone,email,event_id,grp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)', v);
  // Une photo vide dans une mise à jour signifie « inchangée » : l'image n'est envoyée que lorsqu'elle est remplacée.
  else await c.query(`UPDATE persons SET last_name=$2,first_name=$3,sex=$4,birth_date=$5,nationality=$6,category_code=$7,organisation=$8,function=$9,photo=CASE WHEN $10<>'' THEN $10 ELSE photo END,has_photo=$11,doc_ok=$12,bg_status=$13,status=$14,meal_extra=$15,review_note=$16,address=$17,phone=$18,email=$19,event_id=$20,grp=$21,updated_at=now() WHERE id=$1`, v);
  await c.query('DELETE FROM person_zones WHERE person_id=$1', [p.id]);
  await c.query('DELETE FROM person_privileges WHERE person_id=$1', [p.id]);
  for (const z of p.xz) await c.query('INSERT INTO person_zones SELECT $1, code FROM zones WHERE code=$2', [p.id, z]);
  for (const x of p.xp) await c.query('INSERT INTO person_privileges SELECT $1, code FROM privileges WHERE code=$2', [p.id, x]);
}

/* ---------- Lecture de l'état complet ---------- */
// Les photos ne voyagent pas avec la liste : « pv » (version de la photo, 0 si absente) permet de les charger une à une via /api/photo.
const PERSON_SQL = `SELECT p.id, p.last_name ln, p.first_name fn, p.sex sx, coalesce(to_char(p.birth_date,'YYYY-MM-DD'),'') dob, p.nationality nat,
  p.category_code cat, p.organisation org, p.function fct, p.address addr, p.phone tel, p.email,
  (CASE WHEN p.photo<>'' THEN extract(epoch from p.updated_at)::bigint ELSE 0 END)::int pv, p.has_photo "hasPh", p.doc_ok doc, p.bg_status bg, p.status st,
  p.meal_extra xm, p.review_note note, coalesce(p.event_id,'') ev, p.grp,
  coalesce((SELECT array_agg(zone_code) FROM person_zones z WHERE z.person_id=p.id),'{}') xz,
  coalesce((SELECT array_agg(privilege_code) FROM person_privileges x WHERE x.person_id=p.id),'{}') xp
  FROM persons p`;
// user : { id, name, org, scoped }. Un rôle cloisonné ne reçoit que les données de sa propre organisation.
async function loadState(c, user) {
  const q = async (sql, a) => (await c.query(sql, a)).rows;
  const sc = !!user.scoped, org = user.org || '';
  const cats = await q(`SELECT code c, label l, banner b, color col, population pop, meal,
    coalesce((SELECT array_agg(zone_code) FROM category_zones z WHERE z.category_code=k.code),'{}') z,
    coalesce((SELECT array_agg(privilege_code) FROM category_privileges x WHERE x.category_code=k.code),'{}') p FROM categories k ORDER BY sort`);
  const matrix = {};
  cats.forEach(k => { matrix[k.c] = { z: k.z, p: k.p, m: k.meal ? 1 : 0 }; delete k.z; delete k.p; delete k.meal; });
  const roles = {}, rinfo = {};
  (await q('SELECT name, perms, title, mission, scoped FROM roles ORDER BY name')).forEach(r => { roles[r.name] = r.perms; rinfo[r.name] = { t: r.title, m: r.mission, s: r.scoped ? 1 : 0 }; });
  const persons = (await q(PERSON_SQL + (sc ? ' WHERE p.organisation=$1' : '') + ' ORDER BY p.pos DESC', sc ? [org] : [])).map(p => ({ ...p, photo: '', xm: p.xm ? 1 : 0 }));
  return {
    me: user.id, scoped: sc ? 1 : 0, cats, matrix, roles, rinfo, persons,
    zones: (await q('SELECT code c, label n, off_site o FROM zones ORDER BY sort, code')).map(z => ({ ...z, o: z.o ? 1 : 0 })),
    privs: await q('SELECT code c, label n FROM privileges ORDER BY sort, code'),
    users: (await q(`SELECT id, name n, email e, role, org, active, job_title job FROM users ${sc ? 'WHERE id=$1' : ''} ORDER BY created_at, id`, sc ? [user.id] : [])).map(u => ({ id: u.id, n: u.n, e: u.e, role: u.role, org: u.org, job: u.job, on: u.active ? 1 : 0 })),
    reqs: (await q(`SELECT r.id, r.person_id pid, r.type, r.code, r.reason motif, r.requested_by by, (extract(epoch from r.requested_at)*1000)::bigint t, r.status st, r.decided_by dec
      FROM access_requests r ${sc ? 'JOIN persons p ON p.id=r.person_id AND p.organisation=$1' : ''} ORDER BY r.requested_at DESC, r.id DESC`, sc ? [org] : [])).map(r => ({ ...r, t: Number(r.t) })),
    audit: (await q(`SELECT id, (extract(epoch from at)*1000)::bigint t, user_name u, domain a, detail d, person_id pid FROM audit_log ${sc ? 'WHERE user_name=$1' : ''} ORDER BY id DESC LIMIT 600`, sc ? [user.name] : [])).map(a => ({ ...a, t: Number(a.t) })),
    events: (await q(`SELECT id, label l, type, coalesce(to_char(starts_on,'YYYY-MM-DD'),'') date, place, group_label gl, groups gs, archived FROM events ORDER BY sort, id`)).map(e => ({ id: e.id, l: e.l, type: e.type, date: e.date, place: e.place, gl: e.gl, gs: e.gs, arch: e.archived ? 1 : 0 })),
    invs: (await q(`SELECT id::int, email, category_code cat, organisation org, coalesce(event_id,'') ev, grp, coalesce(person_id,'') pid, created_by by, (extract(epoch from coalesce(last_sent_at, created_at))*1000)::bigint t, submitted_at IS NOT NULL done
      FROM invitations ${sc ? 'WHERE organisation=$1' : ''} ORDER BY id DESC LIMIT 500`, sc ? [org] : [])).map(i => ({ ...i, t: Number(i.t) })),
    tpl: (await q("SELECT value FROM settings WHERE key='template'"))[0].value
  };
}

/* ---------- Écriture : chaque changement est contrôlé selon le rôle ---------- */
const FLOW = { SUB: [['DRAFT', 'RET'], 'edit'], APP: [['SUB'], 'review'], RET: [['SUB'], 'review'], REJ: [['SUB'], 'review'], PRT: [['APP'], 'print'], DLV: [['PRT'], 'print'] };
const IDENT = ['ln', 'fn', 'sx', 'dob', 'nat', 'cat', 'org', 'fct', 'hasPh', 'doc', 'addr', 'tel', 'email', 'ev', 'grp'];

async function applySync(c, user, body) {
  const can = k => user.perms.includes(k);
  const need = (k, what) => { if (!can(k)) throw err(403, `Votre rôle (${user.role}) ne permet pas : ${what}.`); };
  const b = body && typeof body === 'object' ? body : {};
  if (!can('view')) throw err(403, 'Ce compte ne permet que de renseigner son propre dossier.');
  const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);

  // Référentiels et gabarit
  if (b.zones || b.privs || b.cats || b.matrix || b.tpl) need('matrix', 'modifier la matrice ou le template');
  if (b.zones) {
    const l = list(b.zones).map(z => ({ c: str(z.c, 3).toUpperCase(), n: str(z.n, 120), o: !!z.o })).filter(z => z.c && z.n);
    await c.query('DELETE FROM zones WHERE NOT (code = ANY($1))', [l.map(z => z.c)]);
    let i = 0; for (const z of l) await c.query('INSERT INTO zones VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO UPDATE SET label=$2, off_site=$3, sort=$4', [z.c, z.n, z.o, i++]);
  }
  if (b.privs) {
    const l = list(b.privs).map(p => ({ c: str(p.c, 1).toUpperCase(), n: str(p.n, 120) })).filter(p => p.c && p.n);
    await c.query('DELETE FROM privileges WHERE NOT (code = ANY($1))', [l.map(p => p.c)]);
    let i = 0; for (const p of l) await c.query('INSERT INTO privileges VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET label=$2, sort=$3', [p.c, p.n, i++]);
  }
  for (const k of list(b.cats)) await c.query('UPDATE categories SET banner=$2, color=$3 WHERE code=$1', [str(k.c, 8), str(k.b, 40), str(k.col, 7)]);
  if (b.matrix && typeof b.matrix === 'object') for (const [k, m] of Object.entries(b.matrix)) {
    if (!m || typeof m !== 'object') continue;
    await c.query('UPDATE categories SET meal=$2 WHERE code=$1', [k, !!m.m]);
    await c.query('DELETE FROM category_zones WHERE category_code=$1', [k]);
    await c.query('DELETE FROM category_privileges WHERE category_code=$1', [k]);
    for (const z of arr(m.z)) await c.query('INSERT INTO category_zones SELECT k.code, z.code FROM categories k, zones z WHERE k.code=$1 AND z.code=$2', [k, z]);
    for (const p of arr(m.p)) await c.query('INSERT INTO category_privileges SELECT k.code, p.code FROM categories k, privileges p WHERE k.code=$1 AND p.code=$2', [k, p]);
  }
  if (b.tpl && typeof b.tpl === 'object') {
    const t = b.tpl, bit = v => (v ? 1 : 0);
    if (!/^#[0-9A-Fa-f]{6}$/.test(t.bar)) throw err(400, 'Couleur de bande invalide.');
    await c.query("UPDATE settings SET value=$1 WHERE key='template'", [JSON.stringify({ bar: t.bar, ev: str(t.ev, 60), sub: str(t.sub, 60), gen: str(t.gen, 80), showEv: bit(t.showEv), showZ: bit(t.showZ), showM: bit(t.showM), showLeg: bit(t.showLeg) })]);
  }

  // Événements : la liste reçue remplace la liste existante (les dossiers d'un événement supprimé ne sont plus classés)
  if (b.events) {
    need('matrix', 'gérer les événements');
    const l = list(b.events).map(e => ({ id: str(e.id, 16), l: str(e.l, 120), type: str(e.type, 60) || 'Autre', date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null, place: str(e.place, 120),
      gl: str(e.gl, 40) || 'Groupe', gs: arr(e.gs).map(g => str(g, 80)).filter(Boolean).slice(0, 200), arch: !!e.arch })).filter(e => /^[A-Za-z0-9]{1,16}$/.test(e.id) && e.l);
    await c.query(`UPDATE persons SET grp='' WHERE event_id IS NOT NULL AND NOT (event_id = ANY($1))`, [l.map(e => e.id)]);
    await c.query(`UPDATE invitations SET grp='' WHERE event_id IS NOT NULL AND NOT (event_id = ANY($1))`, [l.map(e => e.id)]);
    await c.query('DELETE FROM events WHERE NOT (id = ANY($1))', [l.map(e => e.id)]);
    let i = 0; for (const e of l) await c.query(`INSERT INTO events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET label=$2, type=$3, starts_on=$4, place=$5, group_label=$6, groups=$7, archived=$8, sort=$9`, [e.id, e.l, e.type, e.date, e.place, e.gl, e.gs, e.arch, i++]);
  }

  // Rôles (permissions, intitulé, mission, cloisonnement) et utilisateurs
  if (b.roles && typeof b.roles === 'object') {
    need('admin', 'modifier les rôles');
    for (const [name, perms] of Object.entries(b.roles)) {
      const n = str(name, 60); if (!n) continue;
      const p = n === 'Administrateur' ? PERMS : n === 'Client' ? ['self'] : arr(perms).filter(x => PERMS.includes(x));
      await c.query('INSERT INTO roles (name,perms) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET perms=$2', [n, p]);
    }
  }
  if (b.rinfo && typeof b.rinfo === 'object') {
    need('admin', 'modifier les rôles');
    for (const [name, i] of Object.entries(b.rinfo)) {
      if (!i || typeof i !== 'object') continue;
      const fixed = ['Administrateur', 'Client'].includes(name); // jamais cloisonnés
      await c.query('UPDATE roles SET title=$2, mission=$3, scoped=$4 WHERE name=$1', [str(name, 60), str(i.t, 120), str(i.m, 400), fixed ? false : !!i.s]);
    }
  }
  for (const u of list(b.users && b.users.up)) {
    need('admin', 'gérer les utilisateurs');
    const id = str(u.id, 40), name = str(u.n, 80), email = str(u.e, 120).toLowerCase(), pw = u.pw ? String(u.pw) : '', role = str(u.role, 60), on = !!u.on;
    if (!/^[a-z0-9]{1,40}$/.test(id) || !name || !EMAIL.test(email)) throw err(400, 'Nom ou e-mail utilisateur invalide.');
    if (pw && pw.length < 8) throw err(400, 'Le mot de passe doit contenir au moins 8 caractères.');
    const ex = (await c.query('SELECT role, active FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (id === user.id && (!on || role !== ex.role)) throw err(400, 'Vous ne pouvez ni désactiver votre propre compte ni changer votre propre rôle.');
    if ((await c.query('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2', [email, id])).rowCount) throw err(400, 'Cet e-mail est déjà utilisé.');
    if (!ex) {
      if (!pw) throw err(400, 'Un mot de passe est obligatoire pour un nouvel utilisateur.');
      await c.query('INSERT INTO users (id,name,email,pass_hash,role,org,active,job_title) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, name, email, hashPassword(pw), role, str(u.org, 80), on, str(u.job, 120)]);
    } else {
      await c.query('UPDATE users SET name=$2,email=$3,role=$4,org=$5,active=$6,job_title=$7 WHERE id=$1', [id, name, email, role, str(u.org, 80), on, str(u.job, 120)]);
      if (pw) await c.query('UPDATE users SET pass_hash=$2 WHERE id=$1', [id, hashPassword(pw)]);
    }
  }
  if ((b.users || b.roles) && !(await c.query("SELECT 1 FROM users WHERE active AND role='Administrateur' LIMIT 1")).rowCount) throw err(400, 'Il doit rester au moins un administrateur actif.');

  // Dossiers
  const P = b.persons && typeof b.persons === 'object' ? b.persons : {}, ups = list(P.up);
  const evs = ups.length ? new Map((await c.query('SELECT id, extract(year from starts_on)::int y FROM events')).rows.map(r => [r.id, r.y])) : new Map();
  for (const id of Array.isArray(P.del) ? P.del : []) { need('admin', 'supprimer un dossier'); await c.query('DELETE FROM persons WHERE id=$1', [String(id)]); }
  for (const raw of ups) {
    const p = {
      id: str(raw.id, 20), ln: str(raw.ln, 80), fn: str(raw.fn, 80), sx: raw.sx === 'M' ? 'M' : raw.sx === 'F' ? 'F' : null,
      addr: str(raw.addr, 200), tel: str(raw.tel, 40), email: str(raw.email, 120).toLowerCase(), dob: /^\d{4}-\d{2}-\d{2}$/.test(raw.dob) ? raw.dob : '',
      nat: str(raw.nat, 80), cat: str(raw.cat, 8), org: str(raw.org, 120), fct: str(raw.fct, 120),
      photo: cleanPhoto(raw.photo),
      hasPh: !!raw.hasPh, doc: !!raw.doc, bg: ['PEND', 'OK', 'FLAG'].includes(raw.bg) ? raw.bg : 'PEND', st: str(raw.st, 5),
      xz: arr(raw.xz), xp: arr(raw.xp), xm: raw.xm ? 1 : 0, note: str(raw.note, 500),
      ev: evs.has(String(raw.ev || '')) ? String(raw.ev) : '', grp: str(raw.grp, 80)
    };
    if (raw.photo && !p.photo) throw err(400, `Dossier ${p.id} : la photo doit être une image JPEG, PNG ou WebP de moins de 300 Ko.`);
    if (p.email && !EMAIL.test(p.email)) throw err(400, `Dossier ${p.id} : adresse e-mail invalide.`);
    if (!p.ev) p.grp = '';
    if (user.scoped) p.org = user.org; // un rôle cloisonné ne peut écrire que dans sa propre organisation
    if (!/^\d{4,9}-\d{2}$/.test(p.id) || !p.ln || !p.fn || !p.org) throw err(400, 'Dossier incomplet : nom, prénom et organisation sont obligatoires.');
    const cur = (await c.query(PERSON_SQL + ' WHERE p.id=$1 FOR UPDATE OF p', [p.id])).rows[0];
    if (!cur) {
      need('edit', 'créer un dossier');
      Object.assign(p, { st: p.st === 'SUB' ? 'SUB' : 'DRAFT', bg: 'PEND', xz: [], xp: [], xm: 0, note: '' });
      if (p.photo) p.hasPh = true;
      await writePerson(c, p, true);
      continue;
    }
    if (user.scoped && cur.org !== user.org) throw err(403, `Le dossier ${p.id} n'appartient pas à votre organisation.`);
    cur.xm = cur.xm ? 1 : 0;
    if (p.photo) p.hasPh = true;
    if (p.photo || IDENT.some(k => p[k] !== cur[k])) need('edit', 'modifier un dossier');
    if (p.bg !== cur.bg) need('review', 'statuer sur une vérification');
    if (!same(p.xz, cur.xz) || !same(p.xp, cur.xp) || p.xm !== cur.xm) need('access', 'accorder un ajout d\'accès');
    if (p.st !== cur.st) {
      const f = FLOW[p.st];
      if (!f || !f[0].includes(cur.st)) throw err(409, `Changement de statut impossible pour le dossier ${p.id} (il a peut-être été modifié par un autre utilisateur).`);
      need(f[1], 'ce changement de statut');
      if (p.st === 'APP' && blockers({ ...p, pv: cur.pv }, refYear(evs.get(p.ev))).length) throw err(400, `Dossier ${p.id} : approbation impossible tant qu'une anomalie bloquante subsiste.`);
      if (['RET', 'REJ'].includes(p.st) && !p.note) throw err(400, 'Un motif est obligatoire pour renvoyer ou refuser un dossier.');
    } else if (p.note !== cur.note) p.note = cur.note;
    await writePerson(c, p, false);
  }

  // Demandes d'ajout d'accès
  for (const r of list(b.reqs && b.reqs.up)) {
    const id = str(r.id, 12), cur = (await c.query('SELECT status, person_id FROM access_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) {
      need('edit', 'demander un ajout d\'accès');
      const type = ['zone', 'priv', 'meal'].includes(r.type) ? r.type : null, motif = str(r.motif, 500), code = type === 'meal' ? '' : str(r.code, 3);
      if (!type || !motif || !/^AA-\d{3,6}$/.test(id)) throw err(400, 'Demande d\'ajout d\'accès invalide.');
      const pr = (await c.query('SELECT organisation FROM persons WHERE id=$1', [str(r.pid, 20)])).rows[0];
      if (!pr || (user.scoped && pr.organisation !== user.org)) throw err(400, 'Demande d\'ajout d\'accès : dossier introuvable.');
      if (type !== 'meal' && !(await c.query(`SELECT 1 FROM ${type === 'zone' ? 'zones' : 'privileges'} WHERE code=$1`, [code])).rowCount) throw err(400, 'Demande d\'ajout d\'accès : zone ou privilège inconnu.');
      await c.query('INSERT INTO access_requests (id,person_id,type,code,reason,requested_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, str(r.pid, 20), type, code, motif, user.name]);
    } else if (r.st !== cur.status) {
      need('access', 'décider d\'un ajout d\'accès');
      if (cur.status !== 'PEND' || !['OK', 'NO'].includes(r.st)) throw err(409, `La demande ${id} a déjà été traitée.`);
      await c.query('UPDATE access_requests SET status=$2, decided_by=$3 WHERE id=$1', [id, r.st, user.name]);
    }
  }

  // Journal d'audit : l'auteur est toujours l'utilisateur connecté
  for (const a of list(b.audit).slice(0, 500)) await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [user.name, str(a.a, 60), str(a.d, 500), str(a.pid, 20)]);
}

// Année de référence pour le contrôle d'âge : celle de l'événement du dossier, sinon l'année en cours.
const refYear = y => Number(y) || new Date().getFullYear();
// Anomalies d'un dossier : [libellé, bloquante ?]. Mêmes règles que l'écran de revue.
function issuesOf(p, year) {
  const r = [], age = p.dob ? refYear(year) - Number(String(p.dob).slice(0, 4)) : null;
  if (!p.photo && !p.hasPh && !Number(p.pv)) r.push(['Photo manquante', true]);
  if (!p.doc) r.push(["Pièce d'identité non fournie", true]);
  if (!p.dob) r.push(['Date de naissance manquante', p.cat === 'ATH']);
  if (p.cat === 'ATH' && age != null && (age < 15 || age > 18)) r.push(['Âge hors limites (athlète)', true]);
  if (p.bg === 'FLAG') r.push(['Vérification signalée', true]);
  if (!p.fct) r.push(['Fonction non renseignée', false]);
  return r;
}
const blockers = (p, year) => issuesOf(p, year).filter(i => i[1]);

module.exports = { ensureDb, loadState, applySync, issuesOf, refYear, cleanPhoto, PERSON_SQL, EMAIL, SCHEMA_VERSION, err, str };
