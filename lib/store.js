const SCHEMA = require('./schema');
const { seed, PERMS } = require('./seed');
const { hashPassword } = require('./auth');

const err = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const arr = v => (Array.isArray(v) ? [...new Set(v.map(x => String(x)))] : []);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/* ---------- Création et alimentation initiale ---------- */
// Crée les tables et charge le jeu de démonstration si la base est vide.
async function ensureDb(c, verbose) {
  await c.query('SELECT pg_advisory_xact_lock(20262027)');
  const t = await c.query("SELECT to_regclass('public.settings') AS t");
  if (t.rows[0].t) { await migrate(c); return false; }
  const pw = process.env.SEED_PASSWORD;
  if (!pw || pw.length < 8) throw err(503, 'SEED_PASSWORD non configuré (8 caractères minimum) : impossible de créer les comptes de test.');
  await c.query(SCHEMA);
  const s = seed();
  for (const [name, perms] of Object.entries(s.roles)) await c.query('INSERT INTO roles VALUES ($1,$2)', [name, perms]);
  for (const u of s.users) await c.query('INSERT INTO users (id,name,email,pass_hash,role,org,active) VALUES ($1,$2,$3,$4,$5,$6,$7)', [u.id, u.n, u.e, hashPassword(pw), u.role, u.org, !!u.on]);
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
  for (const a of s.audit) await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [a.u, a.a, a.d, a.pid]);
  await c.query("INSERT INTO settings VALUES ('template',$1)", [JSON.stringify(s.tpl)]);
  await migrate(c);
  if (verbose) console.log(`${s.persons.length} dossiers, ${s.users.length} comptes de test`);
  return true;
}

// Mises à niveau des bases créées avec une version antérieure (sans effet si déjà à jour).
async function migrate(c) {
  await c.query(`ALTER TABLE persons ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`);
  await c.query('ALTER TABLE persons ALTER COLUMN sex DROP NOT NULL');
  await c.query(`INSERT INTO roles VALUES ('Client','{self}') ON CONFLICT (name) DO NOTHING`);
  await c.query(`CREATE TABLE IF NOT EXISTS invitations (
    id bigserial PRIMARY KEY, token_hash text NOT NULL UNIQUE, email text NOT NULL,
    category_code text NOT NULL REFERENCES categories(code), organisation text NOT NULL,
    person_id text UNIQUE REFERENCES persons(id) ON DELETE SET NULL, created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), last_sent_at timestamptz, submitted_at timestamptz)`);
  // Événements (sportif, concert, dîner de gala, diplomatique…) et classement des dossiers
  await c.query(`CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{1,16}$'), label text NOT NULL, type text NOT NULL DEFAULT 'Autre', starts_on date,
    place text NOT NULL DEFAULT '', group_label text NOT NULL DEFAULT 'Groupe', groups text[] NOT NULL DEFAULT '{}',
    archived boolean NOT NULL DEFAULT false, sort int NOT NULL DEFAULT 0)`);
  await c.query(`ALTER TABLE persons ADD COLUMN IF NOT EXISTS event_id text REFERENCES events(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS event_id text REFERENCES events(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT ''`);
  await c.query('CREATE INDEX IF NOT EXISTS persons_event_idx ON persons (event_id)');
}

async function writePerson(c, p, isNew) {
  const v = [p.id, p.ln, p.fn, p.sx || null, p.dob || null, p.nat || '', p.cat, p.org, p.fct || '', p.photo || '', !!p.hasPh, !!p.doc, p.bg, p.st, !!p.xm, p.note || '', p.addr || '', p.tel || '', p.email || '', p.ev || null, p.ev ? p.grp || '' : ''];
  if (isNew) await c.query('INSERT INTO persons (id,last_name,first_name,sex,birth_date,nationality,category_code,organisation,function,photo,has_photo,doc_ok,bg_status,status,meal_extra,review_note,address,phone,email,event_id,grp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)', v);
  else await c.query('UPDATE persons SET last_name=$2,first_name=$3,sex=$4,birth_date=$5,nationality=$6,category_code=$7,organisation=$8,function=$9,photo=$10,has_photo=$11,doc_ok=$12,bg_status=$13,status=$14,meal_extra=$15,review_note=$16,address=$17,phone=$18,email=$19,event_id=$20,grp=$21,updated_at=now() WHERE id=$1', v);
  await c.query('DELETE FROM person_zones WHERE person_id=$1', [p.id]);
  await c.query('DELETE FROM person_privileges WHERE person_id=$1', [p.id]);
  for (const z of p.xz) await c.query('INSERT INTO person_zones VALUES ($1,$2)', [p.id, z]);
  for (const x of p.xp) await c.query('INSERT INTO person_privileges VALUES ($1,$2)', [p.id, x]);
}

/* ---------- Lecture de l'état complet ---------- */
const PERSON_SQL = `SELECT p.id, p.last_name ln, p.first_name fn, p.sex sx, coalesce(to_char(p.birth_date,'YYYY-MM-DD'),'') dob, p.nationality nat,
  p.category_code cat, p.organisation org, p.function fct, p.address addr, p.phone tel, p.email, p.photo, p.has_photo "hasPh", p.doc_ok doc, p.bg_status bg, p.status st,
  p.meal_extra xm, p.review_note note, coalesce(p.event_id,'') ev, p.grp,
  coalesce((SELECT array_agg(zone_code) FROM person_zones z WHERE z.person_id=p.id),'{}') xz,
  coalesce((SELECT array_agg(privilege_code) FROM person_privileges x WHERE x.person_id=p.id),'{}') xp
  FROM persons p`;
async function loadState(c, userId) {
  const q = async (sql, a) => (await c.query(sql, a)).rows;
  const cats = await q(`SELECT code c, label l, banner b, color col, population pop, meal,
    coalesce((SELECT array_agg(zone_code) FROM category_zones z WHERE z.category_code=k.code),'{}') z,
    coalesce((SELECT array_agg(privilege_code) FROM category_privileges x WHERE x.category_code=k.code),'{}') p FROM categories k ORDER BY sort`);
  const matrix = {};
  cats.forEach(k => { matrix[k.c] = { z: k.z, p: k.p, m: k.meal ? 1 : 0 }; delete k.z; delete k.p; delete k.meal; });
  const roles = {};
  (await q('SELECT name, perms FROM roles ORDER BY name')).forEach(r => roles[r.name] = r.perms);
  const persons = (await q(PERSON_SQL + ' ORDER BY p.pos DESC')).map(p => ({ ...p, xm: p.xm ? 1 : 0 }));
  return {
    me: userId, cats, matrix, roles, persons,
    zones: (await q('SELECT code c, label n, off_site o FROM zones ORDER BY sort, code')).map(z => ({ ...z, o: z.o ? 1 : 0 })),
    privs: await q('SELECT code c, label n FROM privileges ORDER BY sort, code'),
    users: (await q('SELECT id, name n, email e, role, org, active FROM users ORDER BY created_at, id')).map(u => ({ id: u.id, n: u.n, e: u.e, role: u.role, org: u.org, on: u.active ? 1 : 0 })),
    reqs: (await q(`SELECT id, person_id pid, type, code, reason motif, requested_by by, (extract(epoch from requested_at)*1000)::bigint t, status st, decided_by dec FROM access_requests ORDER BY requested_at DESC, id DESC`)).map(r => ({ ...r, t: Number(r.t) })),
    audit: (await q(`SELECT id, (extract(epoch from at)*1000)::bigint t, user_name u, domain a, detail d, person_id pid FROM audit_log ORDER BY id DESC LIMIT 600`)).map(a => ({ ...a, t: Number(a.t) })),
    events: (await q(`SELECT id, label l, type, coalesce(to_char(starts_on,'YYYY-MM-DD'),'') date, place, group_label gl, groups gs, archived FROM events ORDER BY sort, id`)).map(e => ({ id: e.id, l: e.l, type: e.type, date: e.date, place: e.place, gl: e.gl, gs: e.gs, arch: e.archived ? 1 : 0 })),
    invs: (await q(`SELECT id::int, email, category_code cat, organisation org, coalesce(event_id,'') ev, grp, coalesce(person_id,'') pid, created_by by, (extract(epoch from coalesce(last_sent_at, created_at))*1000)::bigint t, submitted_at IS NOT NULL done FROM invitations ORDER BY id DESC LIMIT 500`)).map(i => ({ ...i, t: Number(i.t) })),
    tpl: (await q("SELECT value FROM settings WHERE key='template'"))[0].value
  };
}

/* ---------- Écriture : chaque changement est contrôlé selon le rôle ---------- */
const FLOW = { SUB: [['DRAFT', 'RET'], 'edit'], APP: [['SUB'], 'review'], RET: [['SUB'], 'review'], REJ: [['SUB'], 'review'], PRT: [['APP'], 'print'], DLV: [['PRT'], 'print'] };
const IDENT = ['ln', 'fn', 'sx', 'dob', 'nat', 'cat', 'org', 'fct', 'photo', 'hasPh', 'doc', 'addr', 'tel', 'email', 'ev', 'grp'];

async function applySync(c, user, body) {
  const can = k => user.perms.includes(k);
  const need = (k, what) => { if (!can(k)) throw err(403, `Votre rôle (${user.role}) ne permet pas : ${what}.`); };
  const b = body || {};
  if (!can('view')) throw err(403, 'Ce compte ne permet que de renseigner son propre dossier.');

  // Référentiels et gabarit
  if (b.zones || b.privs || b.cats || b.matrix || b.tpl) need('matrix', 'modifier la matrice ou le template');
  if (b.zones) {
    const list = b.zones.map(z => ({ c: str(z.c, 3).toUpperCase(), n: str(z.n, 120), o: !!z.o })).filter(z => z.c && z.n);
    await c.query('DELETE FROM zones WHERE NOT (code = ANY($1))', [list.map(z => z.c)]);
    let i = 0; for (const z of list) await c.query('INSERT INTO zones VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO UPDATE SET label=$2, off_site=$3, sort=$4', [z.c, z.n, z.o, i++]);
  }
  if (b.privs) {
    const list = b.privs.map(p => ({ c: str(p.c, 1).toUpperCase(), n: str(p.n, 120) })).filter(p => p.c && p.n);
    await c.query('DELETE FROM privileges WHERE NOT (code = ANY($1))', [list.map(p => p.c)]);
    let i = 0; for (const p of list) await c.query('INSERT INTO privileges VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET label=$2, sort=$3', [p.c, p.n, i++]);
  }
  if (b.cats) for (const k of b.cats) await c.query('UPDATE categories SET banner=$2, color=$3 WHERE code=$1', [str(k.c, 8), str(k.b, 40), str(k.col, 7)]);
  if (b.matrix) for (const [k, m] of Object.entries(b.matrix)) {
    await c.query('UPDATE categories SET meal=$2 WHERE code=$1', [k, !!m.m]);
    await c.query('DELETE FROM category_zones WHERE category_code=$1', [k]);
    await c.query('DELETE FROM category_privileges WHERE category_code=$1', [k]);
    for (const z of arr(m.z)) await c.query('INSERT INTO category_zones SELECT $1, code FROM zones WHERE code=$2', [k, z]);
    for (const p of arr(m.p)) await c.query('INSERT INTO category_privileges SELECT $1, code FROM privileges WHERE code=$2', [k, p]);
  }
  if (b.tpl) {
    const t = b.tpl, bit = v => (v ? 1 : 0);
    if (!/^#[0-9A-Fa-f]{6}$/.test(t.bar)) throw err(400, 'Couleur de bande invalide.');
    await c.query("UPDATE settings SET value=$1 WHERE key='template'", [JSON.stringify({ bar: t.bar, ev: str(t.ev, 60), sub: str(t.sub, 60), gen: str(t.gen, 80), showEv: bit(t.showEv), showZ: bit(t.showZ), showM: bit(t.showM), showLeg: bit(t.showLeg) })]);
  }

  // Événements : la liste reçue remplace la liste existante (les dossiers d'un événement supprimé ne sont plus classés)
  if (b.events) {
    need('matrix', 'gérer les événements');
    const list = b.events.map(e => ({ id: str(e.id, 16), l: str(e.l, 120), type: str(e.type, 60) || 'Autre', date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null, place: str(e.place, 120),
      gl: str(e.gl, 40) || 'Groupe', gs: arr(e.gs).map(g => str(g, 80)).filter(Boolean).slice(0, 200), arch: !!e.arch })).filter(e => /^[A-Za-z0-9]{1,16}$/.test(e.id) && e.l);
    await c.query('DELETE FROM events WHERE NOT (id = ANY($1))', [list.map(e => e.id)]);
    let i = 0; for (const e of list) await c.query(`INSERT INTO events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET label=$2, type=$3, starts_on=$4, place=$5, group_label=$6, groups=$7, archived=$8, sort=$9`, [e.id, e.l, e.type, e.date, e.place, e.gl, e.gs, e.arch, i++]);
  }

  // Rôles et utilisateurs
  if (b.roles) {
    need('admin', 'modifier les rôles');
    for (const [name, perms] of Object.entries(b.roles)) {
      const n = str(name, 60); if (!n) continue;
      const p = n === 'Administrateur' ? PERMS : n === 'Client' ? ['self'] : arr(perms).filter(x => PERMS.includes(x));
      await c.query('INSERT INTO roles VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET perms=$2', [n, p]);
    }
  }
  for (const u of (b.users && b.users.up) || []) {
    need('admin', 'gérer les utilisateurs');
    const id = str(u.id, 40), name = str(u.n, 80), email = str(u.e, 120).toLowerCase(), pw = u.pw ? String(u.pw) : '';
    if (!id || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Nom ou e-mail utilisateur invalide.');
    if (id === user.id && !u.on) throw err(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    if (pw && pw.length < 8) throw err(400, 'Le mot de passe doit contenir au moins 8 caractères.');
    const ex = (await c.query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount;
    if ((await c.query('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2', [email, id])).rowCount) throw err(400, 'Cet e-mail est déjà utilisé.');
    if (!ex) {
      if (!pw) throw err(400, 'Un mot de passe est obligatoire pour un nouvel utilisateur.');
      await c.query('INSERT INTO users (id,name,email,pass_hash,role,org,active) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, name, email, hashPassword(pw), str(u.role, 60), str(u.org, 80), !!u.on]);
    } else {
      await c.query('UPDATE users SET name=$2,email=$3,role=$4,org=$5,active=$6 WHERE id=$1', [id, name, email, str(u.role, 60), str(u.org, 80), !!u.on]);
      if (pw) await c.query('UPDATE users SET pass_hash=$2 WHERE id=$1', [id, hashPassword(pw)]);
    }
  }

  // Dossiers
  const P = b.persons || {};
  const evIds = P.up && P.up.length ? new Set((await c.query('SELECT id FROM events')).rows.map(r => r.id)) : new Set();
  for (const id of P.del || []) { need('admin', 'supprimer un dossier'); await c.query('DELETE FROM persons WHERE id=$1', [String(id)]); }
  for (const raw of P.up || []) {
    const p = {
      id: str(raw.id, 20), ln: str(raw.ln, 80), fn: str(raw.fn, 80), sx: raw.sx === 'M' ? 'M' : raw.sx === 'F' ? 'F' : null,
      addr: str(raw.addr, 200), tel: str(raw.tel, 40), email: str(raw.email, 120).toLowerCase(), dob: /^\d{4}-\d{2}-\d{2}$/.test(raw.dob) ? raw.dob : '',
      nat: str(raw.nat, 80), cat: str(raw.cat, 8), org: str(raw.org, 120), fct: str(raw.fct, 120),
      photo: typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') && raw.photo.length < 400000 ? raw.photo : '',
      hasPh: !!raw.hasPh, doc: !!raw.doc, bg: ['PEND', 'OK', 'FLAG'].includes(raw.bg) ? raw.bg : 'PEND', st: str(raw.st, 5),
      xz: arr(raw.xz), xp: arr(raw.xp), xm: raw.xm ? 1 : 0, note: str(raw.note, 500),
      ev: evIds.has(String(raw.ev || '')) ? String(raw.ev) : '', grp: str(raw.grp, 80)
    };
    if (!p.ev) p.grp = '';
    if (!/^\d{4,9}-\d{2}$/.test(p.id) || !p.ln || !p.fn || !p.org) throw err(400, 'Dossier incomplet : nom, prénom et organisation sont obligatoires.');
    const cur = (await c.query(PERSON_SQL + ' WHERE p.id=$1 FOR UPDATE OF p', [p.id])).rows[0];
    if (!cur) {
      need('edit', 'créer un dossier');
      Object.assign(p, { st: p.st === 'SUB' ? 'SUB' : 'DRAFT', bg: 'PEND', xz: [], xp: [], xm: 0, note: '' });
      await writePerson(c, p, true);
      continue;
    }
    cur.xm = cur.xm ? 1 : 0;
    if (IDENT.some(k => p[k] !== cur[k])) need('edit', 'modifier un dossier');
    if (p.bg !== cur.bg) need('review', 'statuer sur une vérification');
    if (!same(p.xz, cur.xz) || !same(p.xp, cur.xp) || p.xm !== cur.xm) need('access', 'accorder un ajout d\'accès');
    if (p.st !== cur.st) {
      const f = FLOW[p.st];
      if (!f || !f[0].includes(cur.st)) throw err(409, `Changement de statut impossible pour le dossier ${p.id} (il a peut-être été modifié par un autre utilisateur).`);
      need(f[1], 'ce changement de statut');
      if (p.st === 'APP' && blockers({ ...p }).length) throw err(400, `Dossier ${p.id} : approbation impossible tant qu'une anomalie bloquante subsiste.`);
      if (['RET', 'REJ'].includes(p.st) && !p.note) throw err(400, 'Un motif est obligatoire pour renvoyer ou refuser un dossier.');
    } else if (p.note !== cur.note) p.note = cur.note;
    await writePerson(c, p, false);
  }

  // Demandes d'ajout d'accès
  for (const r of (b.reqs && b.reqs.up) || []) {
    const id = str(r.id, 12), cur = (await c.query('SELECT status FROM access_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) {
      need('edit', 'demander un ajout d\'accès');
      const type = ['zone', 'priv', 'meal'].includes(r.type) ? r.type : null, motif = str(r.motif, 500);
      if (!type || !motif || !/^AA-\d{3,6}$/.test(id)) throw err(400, 'Demande d\'ajout d\'accès invalide.');
      await c.query('INSERT INTO access_requests (id,person_id,type,code,reason,requested_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, str(r.pid, 20), type, type === 'meal' ? '' : str(r.code, 3), motif, user.name]);
    } else if (r.st !== cur.status) {
      need('access', 'décider d\'un ajout d\'accès');
      if (cur.status !== 'PEND' || !['OK', 'NO'].includes(r.st)) throw err(409, `La demande ${id} a déjà été traitée.`);
      await c.query('UPDATE access_requests SET status=$2, decided_by=$3 WHERE id=$1', [id, r.st, user.name]);
    }
  }

  // Journal d'audit : l'auteur est toujours l'utilisateur connecté
  for (const a of (b.audit || []).slice(0, 500)) await c.query('INSERT INTO audit_log (user_name,domain,detail,person_id) VALUES ($1,$2,$3,$4)', [user.name, str(a.a, 60), str(a.d, 500), str(a.pid, 20)]);
}

// Anomalies d'un dossier : [libellé, bloquante ?]. Mêmes règles que l'écran de revue.
function issuesOf(p) {
  const r = [], age = p.dob ? 2026 - Number(String(p.dob).slice(0, 4)) : null;
  if (!p.photo && !p.hasPh) r.push(['Photo manquante', true]);
  if (!p.doc) r.push(["Pièce d'identité non fournie", true]);
  if (!p.dob) r.push(['Date de naissance manquante', p.cat === 'ATH']);
  if (p.cat === 'ATH' && age != null && (age < 15 || age > 18)) r.push(['Âge hors limites (athlète)', true]);
  if (p.bg === 'FLAG') r.push(['Vérification signalée', true]);
  if (!p.fct) r.push(['Fonction non renseignée', false]);
  return r;
}
const blockers = p => issuesOf(p).filter(i => i[1]);

module.exports = { ensureDb, loadState, applySync, issuesOf, PERSON_SQL, err, str };
