// Contrôle d'intégrité de la base : chaque contrôle compte les lignes en anomalie et en donne quelques exemples.
// Niveaux : « bloquant » (à corriger avant exploitation), « attention » (à examiner), « info » (constat).
const { checkPassword } = require('./auth');

const CHECKS = [
  ['bloquant', 'Aucun administrateur actif', `SELECT 'aucun' x WHERE NOT EXISTS (SELECT 1 FROM users WHERE active AND role='Administrateur')`],
  ['bloquant', 'Dossiers approuvés, imprimés ou remis sans photo', `SELECT id x FROM persons WHERE status IN ('APP','PRT','DLV') AND photo='' AND NOT has_photo`],
  ['bloquant', "Dossiers approuvés, imprimés ou remis sans pièce d'identité", `SELECT id x FROM persons WHERE status IN ('APP','PRT','DLV') AND NOT doc_ok`],
  ['bloquant', 'Dossiers approuvés, imprimés ou remis avec vérification signalée', `SELECT id x FROM persons WHERE status IN ('APP','PRT','DLV') AND bg_status='FLAG'`],
  ['bloquant', 'Photos enregistrées dans un format non conforme', `SELECT id x FROM persons WHERE photo<>'' AND photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'`],
  ['bloquant', 'Dossiers renvoyés ou refusés sans motif', `SELECT id x FROM persons WHERE status IN ('RET','REJ') AND review_note=''`],
  ['bloquant', 'Contraintes de la base non validées', `SELECT conname x FROM pg_constraint WHERE NOT convalidated AND connamespace='public'::regnamespace`],
  ['attention', 'Doublons possibles (même nom, prénom et date de naissance)', `SELECT min(id) || ' / ' || max(id) x FROM persons WHERE status<>'REJ' GROUP BY lower(last_name), lower(first_name), birth_date HAVING count(*)>1`],
  ['attention', 'Adresse e-mail partagée par plusieurs dossiers', `SELECT email x FROM persons WHERE email<>'' AND status<>'REJ' GROUP BY email HAVING count(*)>1`],
  ['attention', 'Invitations sans compte Client correspondant', `SELECT i.email x FROM invitations i WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email=i.email AND u.role='Client')`],
  ['attention', 'Comptes Client sans invitation', `SELECT u.email x FROM users u WHERE u.role='Client' AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.email=u.email)`],
  ['attention', 'Utilisateurs internes actifs sans poste renseigné', `SELECT email x FROM users WHERE active AND role<>'Client' AND job_title=''`],
  ['attention', 'Rôles sans intitulé officiel', `SELECT name x FROM roles WHERE title=''`],
  ['attention', "Rôle cloisonné attribué à un utilisateur sans organisation", `SELECT u.email x FROM users u JOIN roles r ON r.name=u.role WHERE r.scoped AND u.org=''`],
  ['attention', "Ajouts d'accès accordés qui ne figurent plus sur le dossier", `SELECT r.id x FROM access_requests r WHERE r.status='OK' AND ((r.type='zone' AND NOT EXISTS (SELECT 1 FROM person_zones z WHERE z.person_id=r.person_id AND z.zone_code=r.code))
     OR (r.type='priv' AND NOT EXISTS (SELECT 1 FROM person_privileges z WHERE z.person_id=r.person_id AND z.privilege_code=r.code)) OR (r.type='meal' AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id=r.person_id AND p.meal_extra)))`],
  ['attention', "Ajouts d'accès en attente sur un dossier refusé", `SELECT r.id x FROM access_requests r JOIN persons p ON p.id=r.person_id WHERE r.status='PEND' AND p.status='REJ'`],
  ['info', 'Dossiers non rattachés à un événement (alors que des événements existent)', `SELECT id x FROM persons WHERE event_id IS NULL AND EXISTS (SELECT 1 FROM events)`],
  ['info', "Dossiers classés dans un sous-groupe absent de la liste de l'événement", `SELECT p.id x FROM persons p JOIN events e ON e.id=p.event_id WHERE p.grp<>'' AND NOT (p.grp = ANY(e.groups))`],
  ['info', 'Catégories sans aucune zone ni privilège', `SELECT k.code x FROM categories k WHERE NOT EXISTS (SELECT 1 FROM category_zones z WHERE z.category_code=k.code) AND NOT EXISTS (SELECT 1 FROM category_privileges p WHERE p.category_code=k.code)`]
];
const TABLES = ['persons', 'events', 'invitations', 'access_requests', 'users', 'roles', 'categories', 'zones', 'privileges', 'audit_log'];

async function integrity(c, withSamples) {
  const checks = [];
  for (const [level, label, sql] of CHECKS) {
    const r = (await c.query(sql)).rows;
    checks.push({ level, label, count: r.length, ...(withSamples ? { samples: r.slice(0, 8).map(x => String(x.x)) } : {}) });
  }
  // Comptes internes dont le mot de passe est encore celui fourni à l'installation
  const seedPw = process.env.SEED_PASSWORD || '', weak = [];
  if (seedPw) for (const u of (await c.query("SELECT email, pass_hash FROM users WHERE active AND role<>'Client' ORDER BY created_at LIMIT 40")).rows) if (checkPassword(seedPw, u.pass_hash)) weak.push(u.email);
  checks.splice(1, 0, { level: 'bloquant', label: "Comptes internes utilisant encore le mot de passe d'installation", count: weak.length, ...(withSamples ? { samples: weak.slice(0, 8) } : {}) });
  const tables = {};
  for (const t of TABLES) tables[t] = (await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  const sum = l => checks.filter(k => k.level === l && k.count).length;
  return { version: Number(((await c.query("SELECT value FROM settings WHERE key='schema_version'")).rows[0] || {}).value || 0), bloquants: sum('bloquant'), attentions: sum('attention'), infos: sum('info'), checks, tables };
}
module.exports = { integrity };
