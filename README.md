# NDAGE 2026 — Système d'accréditation

Application web d'accréditation hébergée sur Vercel, avec base PostgreSQL.

## Fonctions
- Tableau de bord
- Demandes, revue des données, vérifications
- Populations : athlètes & équipes, fédérations internationales et nationales, staff, médias, volontaires
- Matrice d'accès (zones / privilèges par catégorie) et ajouts d'accès individuels
- Template d'accréditation (recto / verso) et impression par lots (A4 paysage)
- Rapports & exports CSV, import en masse
- Utilisateurs & rôles, journal d'audit

## Architecture
| Dossier | Rôle |
|---|---|
| `public/index.html` | Interface (une seule page, sans framework) |
| `api/` | Fonctions Vercel : `login`, `logout`, `state`, `sync`, `health` |
| `lib/` | Connexion à la base, sessions, schéma, contrôle des droits, données initiales |
| `db/schema.sql` | Schéma PostgreSQL (référence) |

Chaque modification passe par `/api/sync`, qui vérifie côté serveur les permissions
du rôle connecté et applique le lot dans une transaction.

## Variables d'environnement
| Variable | Usage |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (Neon, Supabase…) |
| `SESSION_SECRET` | Clé de signature des sessions (16 caractères minimum) |
| `SEED_PASSWORD` | Mot de passe initial des comptes de test, utilisé une seule fois à la création de la base |

## Premier démarrage
À la première connexion, si la base est vide, les tables sont créées et le jeu de
démonstration est chargé (242 dossiers fictifs, référentiels, template) avec quatre comptes de test :

| E-mail | Rôle |
|---|---|
| `admin@ndaje.test` | Administrateur |
| `validateur@ndaje.test` | Validateur |
| `impression@ndaje.test` | Opérateur d'impression |
| `representant@ndaje.test` | Représentant d'organisation |

Leur mot de passe est la valeur de `SEED_PASSWORD`. Il se change ensuite dans « Utilisateurs & rôles ».

## Développement local
```
npm install
DATABASE_URL=postgres://… SESSION_SECRET=… SEED_PASSWORD=… npm run dev
```
