# NDAGE 2026 — Système d'accréditation

Plateforme web d'accréditation hébergée sur Vercel, avec base PostgreSQL.

## Fonctions
- Tableau de bord, événements (classement des dossiers par événement et sous-groupe)
- Demandes, revue des données (contrôles bloquants), vérifications
- Invitations : création automatique d'un compte Client (mot de passe généré, envoyé par e-mail) ; le client ne renseigne que son propre dossier
- Notification par e-mail des dossiers incomplets (à la personne ou au représentant de son organisation)
- Matrice d'accès (zones / privilèges par catégorie) et ajouts d'accès individuels
- Template d'accréditation (recto / verso) ; impression par lots sur feuille A5 paysage, avec export PDF
- Rapports et exports Excel ; import en masse depuis un fichier Excel (.xlsx ou .xls), avec modèle téléchargeable et contrôle avant import
- Utilisateurs (poste exact), rôles (intitulé officiel, mission, périmètre, privilèges), journal d'audit
- Contrôle d'intégrité de la base (écran « Intégrité des données », réservé aux administrateurs)

## Architecture
| Dossier | Rôle |
|---|---|
| `public/index.html` | Interface (une seule page, sans framework) |
| `api/` | Fonctions Vercel : `login`, `logout`, `state`, `sync`, `photo`, `invite`, `form` (public, par lien), `me` (espace personnel), `notify`, `admin` (intégrité), `health` |
| `lib/` | Connexion à la base, démarrage et mise à niveau, sessions, schéma, contrôle des droits, intégrité, e-mails |
| `db/schema.sql` | Schéma PostgreSQL de référence |

## Sécurité
- Mots de passe hachés (scrypt) ; session signée de 12 heures, fermée dès que le mot de passe change
- Au-delà de 8 échecs de connexion en 15 minutes pour une adresse, les essais sont refusés
- Chaque écriture passe par `/api/sync`, qui vérifie côté serveur les permissions du rôle et applique le lot dans une transaction
- Un rôle « limité à son organisation » ne reçoit et ne modifie que les données de son organisation
- Les photos sont validées (JPEG, PNG ou WebP) et servies une à une par `/api/photo` aux seuls comptes internes
- En-têtes : Content-Security-Policy, HSTS, X-Frame-Options, Referrer-Policy `no-referrer` ; les écritures venant d'un autre site sont refusées

## Variables d'environnement
| Variable | Usage |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (Neon, Supabase…) |
| `SESSION_SECRET` | Clé de signature des sessions (16 caractères minimum) |
| `SEED_PASSWORD` | Mot de passe initial du compte administrateur, utilisé à la création de la base. À changer dès la première connexion : le contrôle d'intégrité signale tout compte qui l'utilise encore |
| `SEED_DEMO` | Facultatif. `1` pour charger un jeu de démonstration (242 dossiers fictifs, 4 comptes de test) à la création de la base |
| `RESEND_API_KEY` | Facultatif. Clé [Resend](https://resend.com) pour l'envoi automatique des e-mails. Sans elle, les messages sont affichés pour être transmis à la main |
| `MAIL_FROM` | Facultatif. Expéditeur des e-mails, sur un domaine vérifié chez Resend |

## Base de données
À la première requête, si la base est vide, les tables, les référentiels (catégories, zones, privilèges, rôles) et le compte
`admin@ndaje.test` sont créés. Les mises à niveau du schéma sont versionnées (`settings.schema_version`) et appliquées
automatiquement, une seule fois, au démarrage suivant un déploiement.

`/api/health` (public) donne l'état du service et un résumé chiffré du contrôle d'intégrité, sans donnée nominative.

## Limites connues
- La liste des dossiers est chargée en une fois : prévu pour quelques milliers de dossiers, pas pour des dizaines de milliers.
- Un compte Client voit le dossier de sa dernière invitation ; une même adresse invitée à deux événements ne gère que le plus récent en ligne.
- Deux agents qui modifient le même dossier au même moment : la dernière écriture l'emporte (les changements de statut incohérents sont refusés).

## Développement local
```
npm install
DATABASE_URL=postgres://… SESSION_SECRET=… SEED_PASSWORD=… SEED_DEMO=1 npm run dev
```
