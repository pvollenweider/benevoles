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
  app/
    [orgSlug]/[eventSlug]/  # Page publique d'un événement
    my/                     # Gestion inscription bénévole (/my/[token])
    admin/                  # Interface admin (protégée, scopée par org)
      events/               # CRUD événements, créneaux, inscriptions, invitations
      members/              # Pool de bénévoles de l'organisation
      settings/admins/      # Gestion de l'équipe admin
    super-admin/            # Interface super admin (rôle super_admin requis)
      organizations/        # CRUD organisations
    api/
      public/               # API publique (événements, inscriptions)
      admin/                # API admin scopée par organisation
      super-admin/          # API super admin
      cron/reminders/       # Rappels automatiques (toutes les heures)
  components/
    admin/                  # Composants interface admin
    super-admin/            # Composants super admin
  lib/
    notifications/          # Couche email (sendNotification, templates, types)
    prisma-org.ts           # Client Prisma scopé par organisation (getOrgClient)
    auth-guard.ts           # Guards d'authentification (requireOrgSession)
  __tests__/security/       # Tests d'isolation cross-tenant (Vitest)
  generated/prisma/         # Client Prisma (généré, ne pas éditer)
prisma/
  schema.prisma             # Schéma de base de données
  migrations/               # Migration unique (squashée)
k8s/                        # Manifestes Kubernetes
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
```

Toute nouvelle route API admin doit être accompagnée d'un test d'isolation cross-tenant dans `src/__tests__/security/cross-tenant-isolation.test.ts`. Ces tests vérifient que la route utilise le client Prisma scopé (`db` de `requireOrgSession`) et non le client brut (`prisma`).

## Signaler un bug de sécurité

Voir [SECURITY.md](SECURITY.md) — ne pas ouvrir d'issue publique.
