@AGENTS.md

## Conventions du projet

- **`CHANGELOG.md`** : backfiller `[Unreleased]` au fil de l'eau, à chaque PR mergée qui a un impact utilisateur — pas seulement au moment de la release. C'est ce qui a causé le trou de la version 1.11.1 (tag et release GitHub existants, mais aucune section CHANGELOG) et le retard de plusieurs versions sur `SECURITY.md`.
- **`GUIDE_ADMIN.md` / `GUIDE_BENEVOLE.md`** : décrivent uniquement l'état actuel du produit, jamais de langage « depuis la version X, c'est comme ça ». Ce sont aussi les sources de `/doc/admin` et `/doc/benevole` (pages publiques rendues depuis ces mêmes fichiers).
- **Release** : suivre la checklist « Publier une nouvelle version » dans `CONTRIBUTING.md` (CHANGELOG, package.json/package-lock.json, SECURITY.md, FONCTIONNALITES.md, guides, tag + release GitHub).
- **`SECURITY.md`** : sa table de versions supportées est vérifiée en CI (`scripts/check-security-md.mjs`) — la mettre à jour dans le même commit que tout bump de `package.json`.
