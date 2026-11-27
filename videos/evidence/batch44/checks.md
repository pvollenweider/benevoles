# Closing checks

- Les dix vidéos publiées passent chacune `npm run video:validate -- <ID>`. La commande sans identifiant demandée dans le brief échoue avec son message d'utilisation : le script exige un identifiant.
- `node --import tsx videos/tools/check-types.ts` : réussi.
- Vitest : `video-catalog`, `doc-video-references`, `doc-pages`, `video-gallery-payload` et `sentence-anchors`, 5 fichiers et 1 358 tests réussis. Le premier couvre les limites des blocs `viewer`.
- `node scripts/check-doc-screenshots.mjs origin/main` : réussi, aucune capture de documentation touchée.
- Les dix MP4 publiés ont été mesurés par FFprobe ; les dix affiches répondent HTTP 200. Les dimensions et durées sont dans `videos/renders.json`.
