<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Page publique des fonctionnalités

- `FEATURES.md` est la source de vérité de la page publique `/fonctionnalites`, qui le rend directement : ne jamais dupliquer cette liste dans la page React ou ailleurs.
- Toute modification qui ajoute, supprime, renomme ou change substantiellement une fonctionnalité visible par les organisateurs ou les bénévoles vérifie et, si nécessaire, met à jour `FEATURES.md` dans le même changement. Une fonctionnalité non livrée n'y est jamais annoncée comme disponible ; un changement purement interne ne demande pas de mise à jour.
- `FONCTIONNALITES.md` reste l'inventaire détaillé pour l'équipe ; `FEATURES.md` en est la présentation publique, par besoins.
- Toute nouvelle page publique de contenu se déclare dans `src/lib/doc-pages.ts` (métadonnées propres, sitemap, navigation) et son fichier source est copié dans l'image (`Dockerfile`).
