# Bénévoles

Application **SaaS multi-tenant** de gestion de bénévoles pour événements. Chaque organisation dispose de son propre espace isolé ; les bénévoles s'inscrivent via une timeline Gantt interactive accessible sans compte.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 26](https://img.shields.io/badge/Node.js-26-green.svg)](https://nodejs.org/)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-ffdd00.svg)](https://buymeacoffee.com/benevol.app)

Ce projet est gratuit et open source. Si vous l'utilisez et voulez soutenir son développement, un café est toujours apprécié : [buymeacoffee.com/benevol.app](https://buymeacoffee.com/benevol.app).

## Documentation

| Document | Destinataires |
|----------|---------------|
| [Guide bénévole](GUIDE_BENEVOLE.md) | Personnes qui s'inscrivent comme bénévoles |
| [Guide administrateur](GUIDE_ADMIN.md) | Organisateurs qui gèrent les événements |
| [Fonctionnalités](FONCTIONNALITES.md) | Liste exhaustive de tout ce que fait l'application |
| [Présentation des fonctionnalités](FEATURES.md) | Page publique `/fonctionnalites`, par besoins |
| [Architecture](docs/architecture.md) | Découpage du code, multi-tenant, flux principaux |
| [Configuration](docs/configuration.md) | Toutes les variables d'environnement |
| [Déploiement](docs/deploiement.md) | Docker, Kubernetes, CI/CD, sauvegardes |
| [Rôles et permissions](docs/roles-et-permissions.md) | Bénévoles, admins, super admin, isolation entre organisations |
| [API](docs/api.md) | Routes HTTP de l'application |
| [Conservation des données](docs/retention.md) | Durées, déclencheurs et mécanismes de purge |
| [Accessibilité](ACCESSIBILITE.md) | Déclaration publique (`/accessibilite`) ; vérifications : [docs/accessibilite.md](docs/accessibilite.md) |
| [Dossier RGPD](docs/rgpd/README.md) | Travail interne (non publié) : inventaire, sous-traitants, vérifications en production |
| [Contribuer](CONTRIBUTING.md) | Mise en place, conventions, tests |
| [Sécurité](SECURITY.md) | Signaler une vulnérabilité |
| [Changelog](CHANGELOG.md) | Historique des versions |

## Aperçu

**Côté public**
- Listing des événements publiés
- Inscription à un ou plusieurs créneaux via une timeline Gantt interactive (scroll horizontal sur mobile)
- Détection de conflits d'horaires en temps réel
- Liste d'attente sur les créneaux complets (offre de place valable 24 h)
- Gestion personnelle via un lien unique envoyé par email
- Rappels par notification push navigateur (optionnel, sur abonnement du bénévole)

**Côté admin**
- Multi-tenant : chaque organisation a ses propres événements, membres et admins, isolés des autres
- Création et gestion des événements, créneaux et programme des spectacles ; archivage, puis suppression définitive avec confirmation et sauvegarde PDF préalable
- Gestion de la liste des membres (pool de bénévoles) et envoi d'invitations tokenisées
- Rappels automatiques (J-2, J-1, Jour J) et rappel manuel avec message personnalisé
- Suivi des inscriptions en temps réel, export Gantt PDF
- Tableau de bord : événements, taux de remplissage, membres
- Réglages de l'organisation : nom, titre de la page publique, slug, charte du bénévole, équipe admin

**Super admin**
- CRUD des organisations
- Invitation des premiers admins par lien sécurisé (token révocable)
- Santé du service (`/super-admin/health`) : base, file d'emails, tâches planifiées, sauvegardes, migrations, configuration
- Nouveautés produit envoyées aux admins (`/super-admin/product-updates`)

## Captures d'écran

| Planning bénévole (ordinateur) | Planning bénévole (mobile) | Tableau de bord |
|---|---|---|
| ![Planning public d'un événement : les postes en lignes, les créneaux en barres colorées par jour, avec places restantes, liste d'attente, « Sur validation » et poste réservé](public/doc-img/public-timeline.png) | ![Planning public sur mobile, les créneaux du jour en barres colorées](public/doc-img/public-timeline-mobile.png) | ![Tableau de bord de l'administration : « Ce qui demande votre attention », du plus urgent au moins urgent](public/doc-img/admin-dashboard.png) |

> Les captures de la documentation (`public/doc-img/`) viennent de l'événement de démonstration (`scripts/seed-demo.ts`) et se régénèrent avec `npm run screenshots` sur une stack locale, jamais en production. La procédure est dans l'en-tête de `scripts/screenshots.mjs`, les variables (`BASE_URL`, `DEMO_ORG`, `ONLY`, `PUBLIC_ONLY`) dans [docs/configuration.md](docs/configuration.md#scripts-et-tests).

## Stack

| Couche | Technologie |
|--------|-------------|
| Framework | Next.js 16 (App Router, React 19) |
| Base de données | PostgreSQL 16 + Prisma 7 |
| Auth | NextAuth v5 (credentials) |
| Email | Nodemailer (SMTP configurable) |
| Notifications push | Web Push (VAPID, optionnel) |
| Monitoring | Sentry (`@sentry/nextjs`) |
| Export | HTML print (PDF) |
| Styles | Tailwind CSS v4 |
| Runtime | Node.js 26 (voir `.nvmrc` ; CI et image Docker alignées) |

## Prérequis

- Node.js **26** (`nvm use`, version lue dans `.nvmrc`)
- Docker (pour la stack dev locale)

## Démarrage rapide (dev)

Tout est piloté par le `Makefile`. Une seule commande pour partir de zéro :

```bash
git clone <repo>
cd benevoles
make dev-setup   # .env, npm install, docker (postgres + mailpit), migrations, seed
make dev         # lance le serveur Next.js
```

Trois services exposés en dev :
- App : http://localhost:3000
- Mailpit : http://localhost:8025 (capture de tous les emails)
- Postgres : `localhost:5432` (`benevoles` / `benevoles`)

Comptes créés par le seed avec les valeurs de `.env.development.example` (sans elles, le seed prend `admin@localhost` / `change-me` par défaut, voir `prisma/seed.ts`) :

| Rôle | Email | Mot de passe | URL |
|------|-------|--------------|-----|
| Super admin | `admin@local` | `admin` | `/admin` |
| Admin org (org `default`) | `org-admin@localhost` | `admin` | `/admin` |

| Commande | Effet |
|----------|-------|
| `make help` | Liste toutes les tâches |
| `make dev` | `npm run dev` |
| `make dev-up` / `dev-down` / `dev-logs` | Démarre / arrête postgres + mailpit, suit leurs journaux |
| `make dev-reset` | ⚠ Supprime la DB locale et la réinitialise |
| `make db-migrate` | Applique les migrations (`prisma migrate deploy`) ; pour en créer une : `npm run db:migrate` |
| `make db-seed` / `db-studio` | Seed, Prisma Studio |
| `make test` / `lint` / `typecheck` | Qualité |
| `make e2e-up` / `e2e-setup` / `e2e` / `e2e-down` | Stack E2E isolée (`docker-compose.e2e.yml`, ports 5433, 1026 et 8026, fichier `.env.e2e`) et tests Playwright |

### Setup manuel (sans Make)

La CLI Prisma (configurée par `prisma.config.ts`) ne charge pas `.env` : on le lui passe avec `node --env-file`, comme le fait le `Makefile`.

```bash
docker compose -f docker-compose.dev.yml up -d
npm install --legacy-peer-deps
cp .env.development.example .env
openssl rand -base64 48   # coller dans AUTH_SECRET dans .env
node --env-file=.env node_modules/.bin/prisma migrate deploy
node --env-file=.env node_modules/.bin/prisma db seed
npm run dev
```

## Variables d'environnement

En développement, copier `.env.development.example` vers `.env` (prérempli pour la stack Docker). En production, le minimum à renseigner :

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/benevoles"
# 32 caractères minimum : openssl rand -base64 48
AUTH_SECRET="..."
# NextAuth v5 derrière un reverse proxy
AUTH_URL="https://votre-domaine.com"
AUTH_TRUST_HOST="true"
# Liens des emails, QR codes, domaine des organisations
NEXT_PUBLIC_APP_URL="https://votre-domaine.com"
# Obligatoire : le serveur refuse de démarrer sans elle (openssl rand -base64 32, à ne jamais perdre)
TOKEN_ENCRYPTION_KEY="..."
# Sans lui, /api/cron/* refuse toute requête
CRON_SECRET="..."
# Sans SMTP_HOST, chaque envoi d'email échoue
SMTP_HOST="smtp.votre-fournisseur.com"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASSWORD="..."
EMAIL_FROM="Bénévoles <notifications@votre-domaine.com>"
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (génère le client Prisma puis lance Next.js) |
| `npm run build` | Build de production |
| `npm start` | Démarrer le serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Régénère le client Prisma puis `tsc --noEmit` |
| `npm test` | Tests unitaires et d'isolation (Vitest) |
| `npm run test:watch` / `test:coverage` | Vitest en continu / avec couverture |
| `npm run test:integration` | Tests sur un vrai PostgreSQL (`DATABASE_URL`), lancés par le job E2E de la CI |
| `npm run test:e2e` | Tests end-to-end (Playwright) ; `make e2e` les lance sur la stack E2E isolée |
| `npm run db:migrate` | Crée et applique une migration en développement (`prisma migrate dev`) |
| `npm run db:push` | Pousse le schéma sans migration (développement uniquement) |
| `npm run db:seed` | Créer super admin + org de démo |
| `npm run db:studio` | Interface graphique Prisma Studio |
| `npm run db:generate` | Régénérer le client Prisma |
| `npm run screenshots` | Génère les captures d'écran (`scripts/screenshots.mjs`) |
| `npm run retention:docs` | Régénère les tableaux de conservation de `GUIDE_ADMIN.md` et `docs/retention.md` depuis `src/lib/retention.ts` |

`db:migrate`, `db:push`, `db:seed` et `db:studio` ne chargent pas `.env` : exporter `DATABASE_URL` avant, ou passer par `make` (voir « Setup manuel »). `npm run dev` et `npm run test:e2e` vérifient d'abord la version de Node (`scripts/check-node-version.mjs`).

En production, les migrations sont appliquées une fois par déploiement, par un Job Kubernetes lancé avant la mise à jour de l'application (voir [docs/deploiement.md](docs/deploiement.md#ordre-de-déploiement)).

## Tâches planifiées (cron)

Trois endpoints, protégés par `Authorization: Bearer $CRON_SECRET` :

| Endpoint | Méthodes | Rôle | Fréquence |
|----------|----------|------|-----------|
| `/api/cron/reminders` | `GET`, `POST` | Rappels J-2, J-1 et Jour J (email et push) selon les réglages de l'organisation ; expiration des offres de liste d'attente et promotion du suivant ; nouvel essai des emails en échec (file d'envoi) | toutes les heures |
| `/api/cron/cleanup` | `GET`, `POST` | Purge RGPD : organisations désactivées depuis plus de 30 jours avec leurs comptes admin, comptes admin inactifs (désactivés ou invitation jamais acceptée) depuis plus de 30 jours, bénévoles orphelins, jetons de réinitialisation expirés, emails envoyés (en échec : après 30 jours), messages ciblés de plus de 12 mois, compteurs de limites expirés ; chiffrement des anciens liens personnels | une fois par jour |
| `/api/cron/heartbeat` | `POST` | Signal de vie des tâches extérieures à l'application (`backup`, `backup-offsite`, `restore-test`), affiché sur `/super-admin/health` | à la fin de chaque sauvegarde réussie |

Durées de conservation : [docs/retention.md](docs/retention.md).

Si `CRON_SECRET` est vide, les endpoints refusent toutes les requêtes en production et n'acceptent que `localhost` en développement. `CRON_SECRET` est donc indispensable en production.

```bash
# Exemple crontab (CRON_SECRET défini dans l'environnement du crontab)
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine.com/api/cron/reminders
0 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine.com/api/cron/cleanup
```

Sur Kubernetes, `k8s/` fournit les CronJobs `app-reminders` (toutes les heures), `app-cleanup` (02:00 UTC), `postgres-backup` (`pg_dump` chiffré à 01:00 UTC, rétention 30 jours) et `backup-offsite-dropbox` (copie des fichiers chiffrés vers Dropbox à 01:30 UTC, rétention 90 jours).

## Déploiement

### Docker Compose

```bash
docker compose up -d                       # première installation
git pull && docker compose up -d --build   # mise à jour
```

Variables à ajouter et cron de l'hôte : [docs/deploiement.md](docs/deploiement.md#docker-compose).

**Depuis une version 1.x**, suivre [Mise à jour depuis 1.x](docs/deploiement.md#mise-à-jour-depuis-1x) : clé de chiffrement obligatoire, migrations par un Job, deux manifestes supplémentaires.

### Kubernetes

Les manifestes sont dans `k8s/` (application, Job de migration, PostgreSQL, ingress, cron jobs, certificat wildcard via le webhook DNS Gandi de `gandi-webhook/`). Les migrations passent par un Job dédié, **avant** la mise à jour de l'application ; l'ordre complet des étapes, pour un déploiement manuel comme automatique, est dans [docs/deploiement.md](docs/deploiement.md#kubernetes).

Le CI/CD GitHub Actions (`.github/workflows/`) exécute le type-check, le lint et les tests, construit l'image (GHCR) puis déploie sur Kubernetes à chaque push vers `main`. La CI de pull request exécute en plus la couverture de tests, les contrôles `check-security-md.mjs` et `check-migrations.mjs`, les tests d'intégration sur PostgreSQL et les tests E2E Playwright (détail : [docs/deploiement.md](docs/deploiement.md#cicd)).

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                          # Accueil : page du produit (domaine principal), événements publiés (sous-domaine d'org)
│   ├── [eventSlug]/                      # Page publique d'un événement (org = sous-domaine) ; [pageSlug]/, success/
│   ├── my/[token]/                       # Lien personnel du bénévole
│   ├── leader/[token]/                   # Lien personnel d'un responsable de secteur
│   ├── waitlist/[token]/confirm/         # Confirmation d'une place de liste d'attente
│   ├── doc/, fonctionnalites/, accessibilite/   # Pages de contenu rendues depuis les .md (src/lib/doc-pages.ts)
│   ├── legal/                            # Politique de confidentialité, conditions d'utilisation
│   ├── product-updates/unsubscribed/     # Désabonnement des nouveautés produit
│   ├── admin/                            # Administration d'une organisation
│   │   ├── dashboard/, events/, members/, search/, account/
│   │   ├── settings/                     # admins/ (équipe, nom, slug, charte, fuseau), notifications/, message-templates/, activity/
│   │   └── login, forgot-password, reset-password, accept-invite/
│   ├── super-admin/                      # organizations/, health/ (santé du service), product-updates/, profile/
│   └── api/
│       ├── admin/                        # API protégée par org
│       ├── super-admin/                  # API super admin
│       ├── public/                       # API publique (inscriptions, liens personnels, push…)
│       ├── cron/                         # reminders, cleanup, heartbeat
│       ├── health/                       # Sonde Kubernetes (SELECT 1)
│       └── auth/                         # NextAuth
├── components/                           # admin/, public/, super-admin/, DayTimeline.tsx (timeline publique)
├── lib/
│   ├── auth-guard.ts, permissions.ts     # Gardes d'accès et rôles
│   ├── prisma-org.ts                     # Client Prisma scopé par organisation (getOrgClient)
│   ├── notifications/                    # sendNotification(), file d'envoi (outbox.ts), gabarits, canal email
│   ├── token-vault.ts                    # Empreinte et chiffrement des liens personnels
│   ├── env.ts, production-guards.ts      # Validation des variables au démarrage
│   ├── retention.ts                      # Durées de conservation (source unique)
│   └── …                                 # Règles métier (waitlist, gantt-utils, push, rate-limit…)
├── proxy.ts                              # Sous-domaine → en-tête x-org-slug, premier filtre d'auth
├── __tests__/                            # Tests de routes ; security/ : isolation cross-tenant
└── __integration__/                      # Tests sur un vrai PostgreSQL (npm run test:integration)
prisma/                                   # schema.prisma, migrations/, seed.ts
e2e/                                      # Tests Playwright
scripts/                                  # Captures, seed de démo, contrôles CI
k8s/                                      # Manifestes Kubernetes
gandi-webhook/                            # Webhook DNS Gandi pour cert-manager (Go)
.github/workflows/                        # CI/CD
```

## Modèle de données

| Modèle | Description |
|--------|-------------|
| `Organization` | Tenant (org) avec slug unique, flag `active`, charte du bénévole, option d'assurance de l'organisation, titre de la page publique et fuseau horaire |
| `AdminUser` | Compte d'administration : `admin` ou `organizer` rattaché à une org, ou `super_admin` sans org ; onboarding par token révocable |
| `Event` | Événement avec dates, statut, slug unique par org |
| `Shift` | Créneau horaire (rôle, capacité, statut, ordre) |
| `Volunteer` | Bénévole identifié par email ; porte les données propres à l'org (tags, notes, actif/inactif, `organizationId`) |
| `Registration` | Inscription bénévole ↔ créneau avec token d'édition unique (empreinte et copie chiffrée en base) et flags de rappels |
| `MemberInvite` | Token d'invitation d'un bénévole à un événement (FK vers `Volunteer`, révocable, réutilisable) |
| `PushSubscription` | Abonnement Web Push d'un bénévole (rattaché au bénévole, créé depuis son lien personnel) |
| `OrgSlugHistory` | Anciens slugs d'une organisation, pour rediriger les anciens liens |

Liste complète, avec les pages d'événement, responsables de secteur, jalons, journaux, file d'envoi et compteurs de limites : [docs/architecture.md](docs/architecture.md#modèle-de-données).

## Architecture multi-tenant

Chaque organisation dispose d'un client Prisma étendu (`getOrgClient`) qui limite à l'organisation toutes les opérations sur les modèles rattachés à une organisation (directement ou via leur événement) : lectures, modifications, suppressions et créations. Une ligne d'une autre organisation se comporte comme une ligne inexistante. Le code admin (`src/app/api/admin/**`, `src/app/admin/**`) n'a pas le droit d'importer le client brut (règle ESLint `no-restricted-imports`, exceptions justifiées fichier par fichier). Les tests de `src/__tests__/security/` et `src/lib/__tests__/prisma-org.test.ts` valident l'isolation.

L'organisation courante est déterminée par le sous-domaine (`[orgSlug].benevol.app`, injecté par `src/proxy.ts` dans l'en-tête `x-org-slug`). Sans sous-domaine d'organisation (localhost, `www`), le paramètre `?org=<slug>` joue le même rôle.

## Auteur

**Bénévoles** a été créé et est maintenu par **Philippe Vollenweider**.

Copyright © 2026 Philippe Vollenweider.\
Distribué sous licence [GNU Affero General Public License v3.0](LICENSE).

Les contributions restent la propriété de leurs auteurs respectifs, et les composants tiers restent soumis à leurs propres licences (voir [NOTICE](NOTICE)).

## Licence

[GNU Affero General Public License v3.0](LICENSE)
