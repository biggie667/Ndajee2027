# NDAGE 2026 — Système d'accréditation

Application web d'accréditation (fichier unique `index.html`, sans dépendance à installer).

## Modules
- Tableau de bord
- Demandes, Revue des données, Vérifications
- Populations : athlètes & équipes, fédérations internationales et nationales, staff, médias, volontaires
- Matrice d'accès (zones / privilèges par catégorie) et ajouts d'accès individuels
- Template d'accréditation (recto / verso) et impression par lots (A4 paysage)
- Rapports & exports (CSV, sauvegarde JSON), import en masse
- Utilisateurs & rôles, journal d'audit

## Utilisation
Ouvrir `index.html` dans un navigateur, ou publier le dépôt avec GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / racine).

## Limites de cette version
- Les données sont un jeu de **démonstration** généré automatiquement.
- Les modifications sont enregistrées dans le navigateur du poste (localStorage) :
  pas de serveur, pas de base partagée, pas d'authentification réelle.
