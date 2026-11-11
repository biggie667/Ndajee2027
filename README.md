# NDAGE 2026 — Système d'accréditation

Application web d'accréditation hébergée sur Vercel, avec base PostgreSQL.

## Fonctions
- Tableau de bord
- Demandes, revue des données, vérifications
- Invitations : création automatique d'un compte Client (mot de passe généré, envoyé par e-mail) ; le client ne voit que son propre dossier (nom, prénom, adresse, téléphone, photo, fonction)
- Notification par e-mail des dossiers incomplets (à la personne ou au représentant d'organisation)
- Populations : athlètes & équipes, fédérations internationales et nationales, staff, médias, volontaires
- Matrice d'accès (zones / privilèges par catégorie) et ajouts d'accès individuels
- Template d'accréditation (recto / verso) et impression par lots (une feuille A5 paysage par accréditation, recto et verso côte à côte), avec export PDF
- Rapports & exports CSV, import en masse
- Utilisateurs & rôles, journal d'audit

## Architecture
| Dossier | Rôle |
|---|---|
| `public/index.html` | Interface (une seule page, sans framework) |
| `api/` | Fonctions Vercel : `login`, `logout`, `state`, `sync`, `invite`, `form` (public), `me` (espace client), `notify`, `health` |
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
| `RESEND_API_KEY` | Facultatif. Clé [Resend](https://resend.com) pour l'envoi automatique des e-mails (invitations, dossiers incomplets). Sans elle, les liens et messages sont affichés pour être transmis à la main |
| `MAIL_FROM` | Facultatif. Expéditeur des e-mails, sur un domaine vérifié chez Resend, ex. `NDAGE 2026 <accreditation@mondomaine.com>` |

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
