# Guide de contribution

Merci de votre intérêt pour ce projet !

## Prérequis

- Node.js **24** (`nvm use`, version lue dans `.nvmrc`)
- PostgreSQL 16 (fourni par `make dev-up` via Docker)
- Docker (stack de développement : postgres + mailpit)
- `npm` (pas yarn, pas pnpm)

## Mise en place locale

```bash
git clone https://github.com/pvollenweider/benevoles.git
cd benevoles
make dev-setup   # .env, npm install, docker (postgres + mailpit), migrations, seed
make dev         # démarre sur http://localhost:3000
```

Comptes créés par le seed :

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Super admin | `admin@local` | `admin` |
| Admin org | `org-admin@localhost` | `admin` |

Mailpit (capture emails) accessible sur http://localhost:8025.

## Workflow

1. Ouvrir ou choisir une issue
2. Créer une branche : `git checkout -b feat/ma-fonctionnalite`
3. Développer et commiter (voir conventions ci-dessous)
4. Ouvrir une Pull Request vers `main`

Les PRs doivent passer le CI avant d'être mergées : type-check (`tsc --noEmit`), lint, tests Vitest et tests E2E Playwright. Les mêmes contrôles se lancent en local avec `make typecheck`, `make lint`, `make test` et `npm run test:e2e`.

Les messages de commit et les titres de PR sont rédigés en anglais.

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

Exemples : `feat(admin): multi-page PDF export`, `fix(timeline): broken mobile scroll`

## Structure du projet

```
src/
  app/
    [orgSlug]/[eventSlug]/  # Page publique d'un événement
    my/                     # Gestion inscription bénévole (/my/[token])
    admin/                  # Interface admin (protégée, scopée par org)
      dashboard/            # Tableau de bord
      events/               # CRUD événements, créneaux, inscriptions, invitations
      members/              # Pool de bénévoles de l'organisation
      settings/admins/      # Équipe admin, slug, charte du bénévole
    super-admin/            # Interface super admin (rôle super_admin requis)
      organizations/        # CRUD organisations
    waitlist/[token]/       # Confirmation d'une place de liste d'attente
    legal/                  # Politique de confidentialité, conditions d'utilisation
    api/
      public/               # API publique (événements, inscriptions, push)
      admin/                # API admin scopée par organisation
      super-admin/          # API super admin
      cron/                 # reminders (rappels) et cleanup (purge RGPD)
  components/
    admin/                  # Composants interface admin
    super-admin/            # Composants super admin
  lib/
    notifications/          # Couche email (sendNotification, templates, types)
    prisma-org.ts           # Client Prisma scopé par organisation (getOrgClient)
    auth-guard.ts           # Guards d'authentification (requireOrgSession)
    env.ts                  # Validation des variables d'environnement
  middleware.ts             # Auth /admin et /super-admin, routage par sous-domaine
  __tests__/security/       # Tests d'isolation cross-tenant (Vitest)
  generated/prisma/         # Client Prisma (généré, ne pas éditer)
prisma/
  schema.prisma             # Schéma de base de données
  migrations/               # Historique des migrations Prisma
k8s/                        # Manifestes Kubernetes
gandi-webhook/              # Webhook DNS Gandi pour cert-manager (Go)
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

## Tests

```bash
make test        # lance la suite Vitest
make typecheck   # vérifie les types TypeScript
make lint        # ESLint
npm run test:e2e # tests end-to-end Playwright (demandent une base migrée et seedée)
```

Toute nouvelle route API admin doit être accompagnée d'un test d'isolation cross-tenant dans `src/__tests__/security/cross-tenant-isolation.test.ts`. Ces tests vérifient que la route utilise le client Prisma scopé (`db` de `requireOrgSession`) et non le client brut (`prisma`).

## Signaler un bug de sécurité

Voir [SECURITY.md](SECURITY.md) — ne pas ouvrir d'issue publique.
