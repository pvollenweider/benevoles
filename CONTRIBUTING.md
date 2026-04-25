# Guide de contribution

Merci de votre intérêt pour ce projet !

## Prérequis

- Node.js ≥ 22
- PostgreSQL 16
- `npm` (pas yarn, pas pnpm)

## Mise en place locale

```bash
git clone https://github.com/pvollenweider/benevoles.git
cd benevoles
npm install
cp .env.example .env      # remplir les valeurs
npx prisma migrate dev    # applique les migrations + génère le client
npm run db:seed           # crée l'admin initial
npm run dev               # démarre sur http://localhost:3000
```

## Workflow

1. Ouvrir ou choisir une issue
2. Créer une branche : `git checkout -b feat/ma-fonctionnalite`
3. Développer et commiter (voir conventions ci-dessous)
4. Ouvrir une Pull Request vers `main`

Les PRs doivent passer le CI (type-check + lint) avant d'être mergées.

## Conventions de commit

Format : `type(scope): description courte`

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `refactor` | Refactoring sans changement de comportement |
| `docs` | Documentation uniquement |
| `test` | Ajout ou correction de tests |
| `ci` | CI/CD, GitHub Actions |
| `ops` | Infrastructure, Docker, K8s |
| `chore` | Tâches diverses (dépendances, config) |

Exemples : `feat(admin): export PDF multi-pages`, `fix(timeline): scroll mobile cassé`

## Structure du projet

```
src/
  app/              # Routes Next.js (App Router)
    admin/          # Interface admin (protégée)
    api/            # API REST (public/ et admin/)
    events/         # Pages publiques bénévoles
    my/             # Gestion inscription bénévole
  components/       # Composants React
    admin/          # Composants admin
  lib/              # Utilitaires serveur (prisma, email, env…)
  generated/prisma/ # Client Prisma (généré, ne pas éditer)
prisma/
  schema.prisma     # Schéma de base de données
  migrations/       # Migrations versionnées
k8s/                # Manifestes Kubernetes
```

## Base de données

Les migrations sont gérées par Prisma. Pour modifier le schéma :

```bash
# 1. Modifier prisma/schema.prisma
# 2. Créer la migration
npx prisma migrate dev --name ma-migration
# 3. Commiter schema.prisma ET le dossier migrations/
```

Ne jamais modifier les fichiers dans `src/generated/prisma/` — ils sont régénérés automatiquement.

## Signaler un bug de sécurité

Voir [SECURITY.md](SECURITY.md) — ne pas ouvrir d'issue publique.
