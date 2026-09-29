# Guide de contribution

Merci de votre intérêt pour ce projet !

## Prérequis

- Node.js **26** (`nvm use`, version lue dans `.nvmrc`)
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

Les PRs doivent passer le CI avant d'être mergées : type-check (`tsc --noEmit`), lint, tests Vitest et tests E2E Playwright. Les mêmes contrôles se lancent en local avec `make typecheck` (ou `npm run typecheck`, qui régénère le client Prisma avant `tsc` : après un changement de schéma ou de branche, un client obsolète produit de faux échecs), `make lint`, `make test` et `npm run test:e2e`.

TypeScript est installé en deux versions côte à côte, selon la procédure officielle de TypeScript 7 : `@typescript/native` (TypeScript 7) fournit la commande `tsc` utilisée pour le type-check, et le paquet `typescript` pointe vers `@typescript/typescript6`, dont l'API reste nécessaire à typescript-eslint et au build Next.js. `tsc6` lance la vérification avec TypeScript 6 si besoin de comparer.

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

Ne jamais modifier une migration déjà appliquée en production : Prisma enregistre une somme de contrôle de chaque migration appliquée, et le déploiement suivant échouerait.

### Migrations compatibles avec le déploiement progressif

Le déploiement applique les migrations une fois, dans un Job Kubernetes lancé avec la nouvelle image (`k8s/job-migrate.yaml`), avant de mettre à jour l'application ; les pods de l'application ne migrent pas au démarrage (`MIGRATE_ON_START=false`, alors que `docker-compose` garde la migration au démarrage). Kubernetes remplace ensuite l'ancien pod progressivement (`maxSurge: 1`, `maxUnavailable: 0`) : entre la migration et la fin du remplacement, **l'ancienne version du code tourne sur le nouveau schéma**. Si la migration échoue, le déploiement s'arrête et l'ancienne version continue de servir. Une migration doit donc rester compatible avec le code de la version précédente (principe *expand/contract*) :

- **ajouter** une colonne : nullable ou avec une valeur par défaut, jamais `NOT NULL` sans défaut dans la même version que le code qui la remplit ;
- **renommer** ou **changer le sens** d'une colonne : ajouter la nouvelle, écrire dans les deux, lire la nouvelle, et seulement dans une version suivante supprimer l'ancienne ;
- **supprimer** une colonne, une table ou une contrainte : uniquement quand plus aucune version déployée ne l'utilise (donc dans une release ultérieure) ;
- une migration qui ne peut pas respecter ces règles doit être déployée sans coexistence : passer ponctuellement `strategy` à `Recreate` dans `k8s/deployment.yaml` (courte coupure assumée), puis revenir à `RollingUpdate`.

La CI des PR vérifie ces règles (`scripts/check-migrations.mjs`, logique dans `src/lib/migration-safety.ts`) :

- une migration déjà présente sur `main` ne doit jamais être modifiée, supprimée ou renommée (Prisma en garde une empreinte, la production ne correspondrait plus au dépôt) ;
- une nouvelle migration qui supprime ou renomme une table ou une colonne, change un type, ou rend une colonne obligatoire sans défaut fait échouer la CI, sauf si elle contient une ligne `-- migration-safety: <pourquoi c'est sans risque>` (par exemple : colonne plus lue depuis la version précédente, déploiement en `Recreate`). Cette justification est relue avec la PR.

En local : `node scripts/check-migrations.mjs origin/main`.

## Erreurs d'API

Toutes les routes répondent en erreur avec `{ error: string, details?: … }` : `error` est un message en français affichable tel quel, `details` porte des données structurées si utile. Pour un échec de validation zod, utiliser `validationError(parsed.error)` (`src/lib/api-error.ts`), jamais `{ error: parsed.error.flatten() }`.

## Tests

Les tests d'intégration (`src/__integration__`, `npm run test:integration`) tournent contre un vrai Postgres (`DATABASE_URL`) : application des migrations sur une base contenant déjà des données, file d'envoi sous concurrence. Ils sont ignorés sans `DATABASE_URL` et lancés par le job E2E de la CI. Toute migration qui transforme des données existantes doit y avoir son scénario.

La CI des PR lance les tests avec la couverture (`npm run test:coverage`) et échoue si elle passe sous les seuils de `vitest.config.mts`. Ces seuils suivent la couverture mesurée : les relever quand elle progresse, ne jamais les baisser pour faire passer une PR.

```bash
make test        # lance la suite Vitest
make typecheck   # vérifie les types TypeScript
make lint        # ESLint
npm run test:e2e # tests end-to-end Playwright (demandent une base migrée et seedée)
```

Toute nouvelle route API admin doit être accompagnée d'un test d'isolation cross-tenant dans `src/__tests__/security/cross-tenant-isolation.test.ts`. Ces tests vérifient que la route utilise le client Prisma scopé (`db` de `requireOrgSession`) et non le client brut (`prisma`). L'import de `@/lib/prisma` est d'ailleurs refusé par ESLint dans le code admin ; si une route en a réellement besoin (modèle non rattaché à une organisation comme `Organization` ou `AdminUser`, vérification volontairement inter-organisations), désactiver la règle sur la ligne d'import avec la raison en commentaire.

## Publier une nouvelle version

Checklist à suivre à chaque bump de version (créée après coup — `SECURITY.md` et deux entrées de `CHANGELOG.md` étaient restées désynchronisées pendant plusieurs versions sans que rien ne le signale) :

1. **`CHANGELOG.md`** : backfiller `[Unreleased]` avec tout ce qui a été mergé depuis la dernière version, puis le renommer `[x.y.z] — AAAA-MM-JJ`. Omettre les chores purement internes (bump de dépendance, CI) sans impact utilisateur.
2. **`package.json` et `package-lock.json`** : bump du champ `"version"` (les deux fichiers — `package-lock.json` a sa propre copie du numéro à la racine et dans `packages[""]`).
3. **`SECURITY.md`** : mettre à jour la ligne `x.y.x` de la table « Versions supportées ». **Vérifié automatiquement en CI** (`scripts/check-security-md.mjs`, job « Type-check, lint & tests ») — le build échoue si ce fichier n'a pas suivi le bump de `package.json`.
4. **`FONCTIONNALITES.md`** : vérifier que les fonctionnalités ajoutées/retirées depuis la dernière relecture y figurent. Pas de vérification automatique — audit manuel périodique.
5. **`GUIDE_ADMIN.md` / `GUIDE_BENEVOLE.md`** : décrivent uniquement l'état actuel du produit, jamais de langage « depuis la version x, … ». Ce sont aussi les pages publiques `/doc/admin` et `/doc/benevole` (même source).
6. **Tag + release GitHub** : `git tag -a vX.Y.Z -m "vX.Y.Z"`, `git push origin vX.Y.Z`, puis `gh release create vX.Y.Z --notes-file <extrait du CHANGELOG>`. Le numéro affiché dans le pied de page public (`v{version}`) vient directement de `package.json` — rien à modifier à la main de ce côté.
7. Vérifier le déploiement (`gh run watch` sur le workflow *Build & Deploy* déclenché par le push sur `main`).

## Signaler un bug de sécurité

Voir [SECURITY.md](SECURITY.md) — ne pas ouvrir d'issue publique.
