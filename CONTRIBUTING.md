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

`npm install` installe aussi un hook pre-commit (husky) : il lance `eslint --fix` sur les fichiers `*.ts` et `*.tsx` indexés (lint-staged), puis `tsc --noEmit`.

## Workflow

1. Ouvrir ou choisir une issue
2. Créer une branche : `git checkout -b feat/ma-fonctionnalite`
3. Développer et commiter (voir conventions ci-dessous)
4. Ouvrir une Pull Request vers `main`

Les PRs doivent passer la CI avant d'être fusionnées. Contrôles de `ci.yml` et leur équivalent local :

| Job CI | Contrôle | En local |
|--------|----------|----------|
| Type-check, lint & tests | `tsc --noEmit` | `make typecheck` |
| | ESLint | `make lint` |
| | Vitest et seuils de couverture | `npm run test:coverage` |
| | `SECURITY.md` suit la version de `package.json` | `node scripts/check-security-md.mjs` |
| | Migrations compatibles avec la version précédente | `node scripts/check-migrations.mjs origin/main` |
| E2E (Playwright) | Tests d'intégration sur un vrai PostgreSQL | `npm run test:integration` (avec `DATABASE_URL`) |
| | Tests Playwright, dont l'accessibilité (axe-core) | `make e2e` |

`make typecheck` (ou `npm run typecheck`) régénère le client Prisma avant `tsc` : après un changement de schéma ou de branche, un client obsolète produit de faux échecs.

Tests E2E : `make e2e-up && make e2e-setup && make e2e` la première fois, puis `make e2e`. Ils tournent sur une base et une boîte mail dédiées (`docker-compose.e2e.yml`, ports 5433, 1026 et 8026), avec `.env.e2e` créé depuis `e2e/e2e.env.example`, jamais sur la base de développement. `npm run test:e2e` seul lance `next dev`, qui lit `.env`, donc la base de développement.

Plusieurs piles E2E en parallèle (un dossier de travail par branche, ou un serveur déjà lancé sur 3100) : chaque dossier prend un numéro de pile, `E2E_SLOT=N` (1 à 9), et l'utilise pour toutes les commandes : `make E2E_SLOT=2 e2e-up e2e-setup e2e`. La pile N a ses propres ports (serveur 3100+10N, Postgres 5433+10N, SMTP 1026+10N, Mailpit 8026+10N, calculés par `scripts/e2e-slot.mjs`), son projet Docker (`benevoles-e2e-N`), ses containers et son fichier `.env.e2e.N` ; `make E2E_SLOT=2 e2e-down` n'arrête que celle-là. Sans `E2E_SLOT`, c'est la pile historique (slot 0), celle de la CI. Avant de lancer Playwright, `make e2e` vérifie (`scripts/e2e-port-guard.mjs`) que le port n'est pas tenu par un serveur lancé depuis un autre dossier : Playwright le réutiliserait et testerait un autre code sur d'autres données. Dans ce cas, il attend (un contrôle toutes les 30 s, 5 minutes au plus) sans l'arrêter, puis échoue en nommant le processus.

Deux projets Playwright : `chromium` (toute la suite, sauf `e2e/mobile/`) et `webkit-iphone` (seulement `e2e/mobile/`, moteur WebKit avec émulation d'iPhone 15, pour les comportements propres à Safari comme un bouton touché qui ne prend pas le focus). `make e2e` lance les deux ; il faut avoir installé WebKit une fois avec `npx playwright install webkit`. Pour ne lancer que les parcours mobiles : `node --env-file=.env.e2e node_modules/.bin/playwright test --project=webkit-iphone`. Un test qui dépend du toucher (`tap()`) va dans `e2e/mobile/`.

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
| `release` | Commit de version (`release: vX.Y.Z` : CHANGELOG, package.json, SECURITY.md…) |

Exemples : `feat(admin): multi-page PDF export`, `fix(timeline): broken mobile scroll`

## Structure du projet

```
src/
  app/
    [eventSlug]/            # Page publique d'un événement (organisation lue dans le sous-domaine, ?org= en dev)
      [pageSlug]/           # Pages personnalisées de l'événement
      success/              # Confirmation d'inscription
    my/[token]/             # Page personnelle du bénévole
    leader/[token]/         # Page du responsable de secteur
    waitlist/[token]/       # Confirmation d'une place de liste d'attente
    doc/ fonctionnalites/ accessibilite/   # Pages publiques rendues depuis les .md (src/lib/doc-pages.ts)
    legal/                  # Confidentialité, conditions d'utilisation
    product-updates/        # Désabonnement des nouveautés produit
    admin/                  # Interface admin (protégée, scopée par org)
      dashboard/ events/ members/ search/ account/
      settings/             # admins (équipe, nom, slug, fuseau, charte), notifications, message-templates, activity
    super-admin/            # organizations, product-updates, health, profile (rôle super_admin)
    api/
      public/ admin/ super-admin/
      cron/                 # reminders, cleanup (purge RGPD), heartbeat (sauvegardes)
      health/               # Sonde Kubernetes
  components/               # admin/, super-admin/, public/, __tests__/ (*.react.test.tsx, jsdom)
  lib/                      # Logique métier pure et testée (__tests__/), notifications/
    prisma-org.ts           # Client Prisma scopé par organisation (getOrgClient)
    auth-guard.ts           # requireOrgSession(level), requireSuperAdmin, getOrgContext
    permissions.ts          # Matrice PERMISSIONS (Organisateur / Propriétaire)
    env.ts                  # Validation des variables d'environnement
  proxy.ts                  # Auth /admin et /super-admin, en-tête x-org-slug (convention Proxy de Next 16)
  __tests__/                # Tests de routes ; security/ : isolation cross-tenant
  __integration__/          # Tests contre un vrai Postgres (*.int.test.ts)
  generated/prisma/         # Client Prisma (généré, ne pas éditer)
prisma/                     # schema.prisma, migrations/, seed.ts
e2e/                        # Specs Playwright (dont accessibility.spec.ts), helpers/
scripts/                    # check-*.mjs (CI), seed-demo.ts, screenshots.mjs, retention-docs.ts
k8s/                        # Manifestes Kubernetes
gandi-webhook/              # Webhook DNS Gandi pour cert-manager (Go)
```

## Base de données

Les migrations sont gérées par Prisma. La CLI Prisma (configurée par `prisma.config.ts`) ne charge pas `.env` : lui passer avec `node --env-file`. Pour modifier le schéma :

```bash
# 1. Modifier prisma/schema.prisma
# 2. Créer la migration
node --env-file=.env node_modules/.bin/prisma migrate dev --name ma-migration
# 3. Commiter schema.prisma ET le dossier migrations/
```

Ne jamais modifier les fichiers dans `src/generated/prisma/` : ils sont régénérés automatiquement.

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

Toute correction de bug a son test Vitest de régression, toute fonctionnalité plusieurs cas. La logique testable va dans une fonction pure d'un module `src/lib/*.ts` plutôt que de rester dans une route ou un composant (voir `gantt-utils.ts`, `pdf-export-gantt.ts`, `sector-leaders.ts`). Les tests de composants sont dans `src/components/__tests__/*.react.test.tsx`, avec `@vitest-environment jsdom` en tête de fichier.

Les tests d'intégration (`src/__integration__`, `npm run test:integration`) tournent contre un vrai Postgres (`DATABASE_URL`) : application des migrations sur une base contenant déjà des données, file d'envoi sous concurrence et validée ou annulée avec la transaction métier, limites de débit partagées entre répliques. Ils sont ignorés sans `DATABASE_URL` et lancés par le job E2E de la CI. Toute migration qui transforme des données existantes doit y avoir son scénario.

La CI des PR lance les tests avec la couverture (`npm run test:coverage`) et échoue si elle passe sous les seuils de `vitest.config.mts`. Ces seuils suivent la couverture mesurée : les relever quand elle progresse, ne jamais les baisser pour faire passer une PR.

```bash
make test        # lance la suite Vitest
make typecheck   # vérifie les types TypeScript
make lint        # ESLint
make e2e         # tests end-to-end Playwright sur la stack E2E isolée (voir « Workflow »)
```

Toute nouvelle route API admin doit être accompagnée d'un test d'isolation cross-tenant dans `src/__tests__/security/cross-tenant-isolation.test.ts`. Ces tests vérifient que la route utilise le client Prisma scopé (`db` de `requireOrgSession`) et non le client brut (`prisma`). L'import de `@/lib/prisma` est d'ailleurs refusé par ESLint dans le code admin ; si une route en a réellement besoin (modèle non rattaché à une organisation comme `Organization` ou `AdminUser`, vérification volontairement inter-organisations), désactiver la règle sur la ligne d'import avec la raison en commentaire.

Elle doit aussi figurer dans `PERMISSIONS` (`src/lib/permissions.ts`) avec son niveau, Organisateur ou Propriétaire ; `src/lib/__tests__/permissions.test.ts` échoue sinon. Une route réservée aux propriétaires appelle `requireOrgSession("owner")`.

## Documentation du dépôt

| Fichier | Rôle |
|---------|------|
| `FEATURES.md`, `GUIDE_ADMIN.md`, `ACCESSIBILITE.md` | Sources des pages publiques (`/fonctionnalites`, `/doc/admin`, `/accessibilite`), déclarées dans `src/lib/doc-pages.ts` et copiées dans l'image par le `Dockerfile` |
| `GUIDE_BENEVOLE.md` | Mot d'accueil du guide bénévole, rendu en tête de `/doc/benevole` : le guide est entièrement découpé en pages de `guide/`, dont `/doc/benevole` est l'index |
| `guide/*.md` | Documentation par tâche (#649), celle des bénévoles et des organisateurs, une page par fichier rendue à `/doc/<fichier>` ; le tableau des durées de conservation d'`exporter-et-conserver-ses-donnees.md` est généré par `npm run retention:docs` ; en-tête et règles d'écriture dans `guide/README.md`, dont la liste est générée par `npm run doc:index` depuis `src/lib/doc-units.ts` |
| `FONCTIONNALITES.md` | Inventaire détaillé pour l'équipe |
| `DESIGN.md`, `PRODUCT.md` | Système visuel et contexte produit, à relire avant tout changement d'interface |
| `docs/accessibilite.md` | Vérifications d'accessibilité, à dater |
| `docs/retention.md` | Durées de conservation ; tableaux générés par `npm run retention:docs` depuis `src/lib/retention.ts` |
| `docs/configuration.md`, `docs/deploiement.md` | Variables d'environnement, déploiement et exploitation |
| `docs/architecture.md`, `docs/api.md`, `docs/roles-et-permissions.md` | Code, routes HTTP, rôles |
| `docs/rgpd/` | Dossier RGPD interne (non publié) |

Les guides et les pages publiques décrivent l'état actuel du produit, jamais « depuis la version X » : l'historique va dans `CHANGELOG.md`.

Les titres des pages publiques ont une ancre stable, le slug de leur texte (`/doc/creer-un-evenement#page-blanche`, `src/lib/heading-anchors.ts`). Les liens « Aide : … » des pages d'administration ouvrent une page de `guide/` (et, s'il est indiqué, un de ses titres) listée dans `src/lib/help-links.ts` : renommer ou supprimer une de ces pages ou un de ces titres demande de mettre ce fichier à jour dans le même changement (`src/lib/__tests__/help-links.test.ts` échoue sinon, comme pour un lien `](autre-page.md#ancre)` vers un titre qui n'existe plus).

### Principes de rédaction de la documentation

Pour toute section nouvelle ou réécrite des guides (`GUIDE_ADMIN.md`, pages de `guide/`) :

- **La tâche d'abord** : le titre dit ce que la personne veut faire (« Créer une série de créneaux », « Gérer son inscription »), pas le nom d'un écran ou d'un composant. La première phrase dit où cela se passe et à quoi cela sert.
- **Des sections courtes** : une tâche par section, une procédure en étapes quand il y en a plusieurs, les cas rares dans les questions fréquentes. Une explication qui vaut pour plusieurs rôles est écrite une seule fois, au bon endroit, et les autres sections y renvoient par un lien.
- **La vidéo par son identifiant** : quand une vidéo de la bibliothèque montre cette tâche, ajouter sous le titre, sur sa propre ligne entourée de lignes vides, `<!-- video: ID -->` avec l'identifiant stable de `videos/catalog.json` (jamais son titre, sa durée ni son adresse : ils viennent du catalogue). La page publique en fait un lien « Voir la vidéo : titre (durée) » si la vidéo est publiée et son film en ligne, et rien sinon ; GitHub n'affiche rien. Une vidéo au plus par section, et une seule fois par fichier. Un identifiant inconnu ou mal écrit fait échouer `src/lib/__tests__/doc-video-references.test.ts`.
- **L'état actuel seulement** : décrire ce que fait le produit aujourd'hui, jamais « depuis la version X » ni « nouveau » ; l'historique va dans `CHANGELOG.md`.
- **Un seul registre par page**, celui de son public (`PRODUCT.md`) : « vous » dans le guide administrateur et les pages pour les organisateurs ; « tu » dans les pages pour les bénévoles, comme dans le produit, ses emails et ses vidéos ; une page pour les deux rôles explique une fois, puis « Côté organisation » (vous) et « Côté bénévole » (tu).

## Publier une nouvelle version

Checklist à suivre à chaque changement de version :

1. **`CHANGELOG.md`** : `[Unreleased]` est complété à chaque PR fusionnée, étape par étape. À la release seulement, le nettoyer : une entrée par fonctionnalité telle qu'elle existe maintenant (fusionner les étapes successives), retirer les corrections de ce qui a été introduit depuis la dernière version publiée, puis vérifier qu'il ne manque rien et le renommer `[x.y.z] — AAAA-MM-JJ`. Omettre les chores purement internes (bump de dépendance, CI) sans impact utilisateur. Pour une version majeure, ouvrir la section par « Mise à jour depuis x » (voir 2.0.0).
2. **`package.json` et `package-lock.json`** : bump du champ `"version"` (les deux fichiers : `package-lock.json` a sa propre copie du numéro à la racine et dans `packages[""]`).
3. **`SECURITY.md`** : dans le même commit que le bump de `package.json`, mettre à jour la première ligne `X.Y.x` de la table « Versions supportées » à chaque changement de version mineure ou majeure (un correctif ne la change pas). **Vérifié en CI** (`scripts/check-security-md.mjs`, job « Type-check, lint & tests ») : la CI échoue si cette ligne ne correspond pas à la version majeure et mineure de `package.json`.
4. **`FONCTIONNALITES.md`** : vérifier que les fonctionnalités ajoutées ou retirées depuis la dernière relecture y figurent. Pas de vérification automatique : audit manuel périodique.
5. **`FEATURES.md`** (page publique `/fonctionnalites`) : chaque fonctionnalité livrée y figure, aucune fonctionnalité non livrée n'y est annoncée (règle d'`AGENTS.md`).
6. **`GUIDE_ADMIN.md` / `guide/*.md`** : décrivent uniquement l'état actuel du produit, jamais de langage « depuis la version x, … ». Ce sont aussi les pages publiques `/doc/admin` et `/doc/<page>` (même source) ; `/doc/benevole` et `/doc/admin` listent les pages de leur rôle.
7. **Changement incompatible** (variable obligatoire, manifeste, migration par Job) : section « Mise à jour depuis x » dans `docs/deploiement.md`, lien dans le README et en tête de la section du CHANGELOG.
8. **Nouvelle variable d'environnement** : `src/lib/env.ts` si elle doit être validée au démarrage, `docs/configuration.md`, `.env.example`, l'étape « Sync k8s secret » de `.github/workflows/deploy.yml` et le secret GitHub correspondant.
9. **Captures de la documentation** (`public/doc-img/`, utilisées par les guides et le README) : si des écrans ont changé, les régénérer sur une base jetable avec l'événement de démonstration (`scripts/seed-demo.ts` puis `npm run screenshots`, procédure en tête de `scripts/screenshots.mjs`), et relire les textes alternatifs.
10. **Tag et release GitHub** : après fusion de la PR de release sur `main`, sur ce commit : `git tag -a vX.Y.Z -m "vX.Y.Z"`, `git push origin vX.Y.Z`, puis `gh release create vX.Y.Z --notes-file <extrait du CHANGELOG>`. Le déploiement part du push sur `main`, pas du tag. Le numéro affiché dans le pied de page public (`v{version}`) vient directement de `package.json` : rien à modifier à la main de ce côté.
11. Vérifier le déploiement (`gh run watch` sur le workflow *Build & Deploy* déclenché par le push sur `main`).

## Signaler un bug de sécurité

Voir [SECURITY.md](SECURITY.md) : ne pas ouvrir d'issue publique.
