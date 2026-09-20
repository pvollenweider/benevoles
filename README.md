# Bénévoles

Application **SaaS multi-tenant** de gestion de bénévoles pour événements. Chaque organisation dispose de son propre espace isolé ; les bénévoles s'inscrivent via une timeline Gantt interactive accessible sans compte.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 26](https://img.shields.io/badge/Node.js-26-green.svg)](https://nodejs.org/)

## Documentation

| Document | Destinataires |
|----------|---------------|
| [Guide bénévole](GUIDE_BENEVOLE.md) | Personnes qui s'inscrivent comme bénévoles |
| [Guide administrateur](GUIDE_ADMIN.md) | Organisateurs qui gèrent les événements |
| [Fonctionnalités](FONCTIONNALITES.md) | Liste exhaustive de tout ce que fait l'application |
| [Architecture](docs/architecture.md) | Découpage du code, multi-tenant, flux principaux |
| [Configuration](docs/configuration.md) | Toutes les variables d'environnement |
| [Déploiement](docs/deploiement.md) | Docker, Kubernetes, CI/CD, sauvegardes |
| [Rôles et permissions](docs/roles-et-permissions.md) | Bénévoles, admins, super admin, isolation entre organisations |
| [API](docs/api.md) | Routes HTTP de l'application |
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
- Création et gestion des événements, créneaux et programme des spectacles
- Gestion de la liste des membres (pool de bénévoles) et envoi d'invitations tokenisées
- Rappels automatiques (J-2, J-1, Jour J) et rappel manuel avec message personnalisé
- Suivi des inscriptions en temps réel, export Gantt PDF
- Tableau de bord : événements, taux de remplissage, membres
- Réglages de l'organisation : slug, charte du bénévole, équipe admin

**Super admin**
- CRUD des organisations
- Invitation des premiers admins par lien sécurisé (token révocable)

## Captures d'écran

| Landing page | Timeline bénévole (desktop) | Timeline mobile |
|---|---|---|
| ![Landing](docs/screenshots/01-landing.png) | ![Timeline desktop](docs/screenshots/03-timeline-desktop.png) | ![Timeline mobile](docs/screenshots/02-landing-mobile.png) |

> Les captures admin (dashboard, événements, membres, export PDF) sont générées avec `npm run screenshots`.
> Voir `scripts/screenshots.mjs` pour la configuration des URL et des credentials.

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

Comptes créés par le seed :

| Rôle | Email | Mot de passe | URL |
|------|-------|--------------|-----|
| Super admin | `admin@local` | `admin` | `/admin` |
| Admin org (org `default`) | `org-admin@localhost` | `admin` | `/admin` |

| Commande | Effet |
|----------|-------|
| `make help` | Liste toutes les tâches |
| `make dev` | `npm run dev` |
| `make dev-up` / `dev-down` | Démarre / arrête postgres + mailpit |
| `make dev-reset` | ⚠ Supprime la DB locale et la réinitialise |
| `make db-migrate` / `db-seed` / `db-studio` | Tâches Prisma |
| `make test` / `lint` / `typecheck` | Qualité |

### Setup manuel (sans Make)

```bash
docker compose -f docker-compose.dev.yml up -d
npm install --legacy-peer-deps
cp .env.development.example .env
openssl rand -base64 48   # coller dans AUTH_SECRET dans .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## Variables d'environnement

Copier `.env.example` vers `.env` (production) ou `.env.development.example` vers `.env` (développement local, prérempli pour la stack Docker) et renseigner :

```env
# Base de données (requis)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/benevoles"

# Auth (requis) — chaîne aléatoire ≥ 32 caractères
AUTH_SECRET="..."

# NextAuth v5 derrière un reverse proxy (obligatoire en production)
AUTH_URL="https://votre-domaine.com"
AUTH_TRUST_HOST="true"

# SMTP (requis pour l'envoi d'emails ; sans SMTP_HOST, les emails sont affichés dans la console)
SMTP_HOST="smtp.votre-fournisseur.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="..."
SMTP_PASSWORD="..."
EMAIL_FROM="Bénévoles <notifications@votre-domaine.com>"
# Adresse à laquelle les bénévoles atterrissent s'ils répondent (optionnel)
EMAIL_REPLY_TO="contact@votre-domaine.com"

# Email qui reçoit une copie à chaque inscription (optionnel)
ADMIN_NOTIFICATION_EMAIL=""

# URL publique de l'application (utilisée dans les emails et les QR codes)
NEXT_PUBLIC_APP_URL="https://votre-domaine.com"

# Secret partagé pour les endpoints /api/cron/* (indispensable en production : sans lui, ils refusent toute requête)
CRON_SECRET="..."

# Notifications push navigateur (optionnel). Sans clés VAPID, aucun push n'est envoyé.
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_EMAIL=""
```

Variables supplémentaires lues par le code :

| Variable | Rôle |
|----------|------|
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Envoi des erreurs à Sentry (serveur / navigateur) |
| `SENTRY_AUTH_TOKEN` | Upload des source maps au build (secret de build Docker) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte super admin créé par `npm run db:seed` (défauts : `admin@localhost` / `change-me`) |
| `ORG_ADMIN_EMAIL`, `ORG_ADMIN_PASSWORD` | Admin de l'organisation `default` créé par le seed (défauts : `org-admin@localhost` / valeur de `ADMIN_PASSWORD`) |

Générer les clés VAPID : `node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys()))"`.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (génère le client Prisma puis lance Next.js) |
| `npm run build` | Build de production |
| `npm start` | Démarrer le serveur de production |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires et d'isolation (Vitest) |
| `npm run test:watch` / `test:coverage` | Vitest en continu / avec couverture |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run db:migrate` | Crée et applique une migration en développement (`prisma migrate dev`) |
| `npm run db:push` | Pousse le schéma sans migration (développement uniquement) |
| `npm run db:seed` | Créer super admin + org de démo |
| `npm run db:studio` | Interface graphique Prisma Studio |
| `npm run db:generate` | Régénérer le client Prisma |
| `npm run screenshots` | Génère les captures d'écran (`scripts/screenshots.mjs`) |

En production, les migrations s'appliquent avec `npx prisma migrate deploy` (fait par l'init container Kubernetes).

## Tâches planifiées (cron)

Deux endpoints, appelables en `GET` ou `POST`, protégés par `Authorization: Bearer $CRON_SECRET` :

| Endpoint | Rôle | Fréquence |
|----------|------|-----------|
| `/api/cron/reminders` | Rappels J-2, J-1, Jour J (email et push), expiration des offres de liste d'attente | toutes les heures |
| `/api/cron/cleanup` | Purge RGPD : organisations et comptes admin désactivés depuis plus de 30 jours, bénévoles orphelins, jetons expirés | une fois par jour |

Si `CRON_SECRET` est vide, les endpoints refusent toutes les requêtes en production et n'acceptent que `localhost` en développement. `CRON_SECRET` est donc indispensable en production.

```bash
# Exemple crontab
0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine.com/api/cron/reminders
```

Sur Kubernetes, `k8s/cronjob-reminders.yaml` (toutes les heures), `k8s/cronjob-cleanup.yaml` (02:00 UTC) et `k8s/cronjob-backup.yaml` (`pg_dump` chiffré à 01:00 UTC, rétention 30 jours) sont fournis.

## Déploiement

### Docker Compose

```bash
docker compose up -d
```

### Kubernetes

Les manifestes sont dans `k8s/` (application, PostgreSQL, ingress, cron jobs, certificat wildcard via le webhook DNS Gandi de `gandi-webhook/`). Un init container exécute `prisma migrate deploy` automatiquement avant le démarrage.

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
APP_IMAGE=ghcr.io/<org>/benevoles:<tag> envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Le CI/CD GitHub Actions (`.github/workflows/`) exécute le type-check, le lint et les tests, construit l'image (GHCR) puis déploie sur Kubernetes à chaque push vers `main`. La CI de pull request exécute en plus les tests E2E Playwright.

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                          # Liste des événements publiés
│   ├── [orgSlug]/[eventSlug]/            # Page publique d'un événement
│   ├── my/[token]/                       # Gestion de son inscription (bénévole)
│   ├── admin/                            # Interface d'administration par org
│   │   ├── dashboard/                    # Tableau de bord
│   │   ├── events/                       # CRUD événements, créneaux, inscriptions
│   │   ├── members/                      # Gestion des membres (pool bénévoles)
│   │   ├── settings/admins/              # Équipe admin, slug, charte du bénévole
│   │   └── login, forgot-password, reset-password, accept-invite/
│   ├── waitlist/[token]/confirm/         # Confirmation d'une place de liste d'attente
│   ├── legal/                            # Politique de confidentialité, conditions d'utilisation
│   ├── super-admin/                      # Interface super administrateur
│   │   └── organizations/                # CRUD des organisations
│   └── api/
│       ├── admin/                        # API protégée par org
│       ├── super-admin/                  # API super admin
│       ├── cron/                         # reminders (rappels) et cleanup (purge RGPD)
│       └── public/                       # API publique (événements, inscriptions)
├── components/
│   ├── admin/                            # Composants interface admin (AdminDayTimeline…)
│   ├── super-admin/                      # Composants super admin
│   └── DayTimeline.tsx                   # Timeline Gantt publique interactive
└── lib/
    ├── auth-guard.ts                     # Guards d'authentification + scoping org
    ├── prisma-org.ts                     # Client Prisma scopé par organisation
    ├── notifications/                    # Couche d'envoi de notifications (email)
    │   ├── types.ts                      # Types NotificationKind, Payload
    │   ├── templates.ts                  # Templates HTML + texte
    │   └── index.ts                      # sendNotification()
    ├── gantt-utils.ts                    # Utilitaires partagés des timelines Gantt
    ├── waitlist.ts                       # Promotion liste d'attente
    ├── push.ts                           # Notifications push (Web Push)
    ├── env.ts                            # Validation des variables d'environnement (Zod)
    ├── prisma.ts                         # Client Prisma singleton
    └── utils.ts                          # Utilitaires (token, dates, conflits)
prisma/
├── schema.prisma                         # Schéma BDD
├── migrations/                           # Historique des migrations Prisma
└── seed.ts                               # Données initiales
k8s/                                      # Manifestes Kubernetes
gandi-webhook/                            # Webhook DNS Gandi pour cert-manager (Go)
.github/workflows/                        # CI/CD GitHub Actions
src/__tests__/security/                   # Tests d'isolation cross-tenant
```

## Modèle de données

| Modèle | Description |
|--------|-------------|
| `Organization` | Tenant (org) avec slug unique, flag `active`, charte du bénévole et option d'assurance de l'organisation |
| `AdminUser` | Compte admin rattaché à une org (ou super admin sans org) ; onboarding par token révocable |
| `Event` | Événement avec dates, statut, slug unique par org |
| `Shift` | Créneau horaire (rôle, capacité, statut, ordre) |
| `Volunteer` | Bénévole identifié par email ; porte les données propres à l'org (tags, notes, actif/inactif, `organizationId`) |
| `Registration` | Inscription bénévole ↔ créneau avec token d'édition unique et flags de rappels |
| `MemberInvite` | Token d'invitation d'un bénévole à un événement (FK vers `Volunteer`, révocable, réutilisable) |
| `PushSubscription` | Abonnement Web Push d'un bénévole (identifié par email) |
| `OrgSlugHistory` | Anciens slugs d'une organisation, pour rediriger les anciens liens |

## Architecture multi-tenant

Chaque organisation dispose d'un client Prisma étendu (`getOrgClient`) qui injecte automatiquement `organizationId` dans tous les reads. Les mutations passent par une vérification de propriété (read scopé) avant d'accéder au client brut. 20 tests de sécurité valident l'isolation cross-tenant dans `src/__tests__/security/`.

L'organisation courante est déterminée par le sous-domaine (`[orgSlug].benevol.app`, injecté par `src/middleware.ts` dans l'en-tête `x-org-slug`). En développement, sans sous-domaine, le paramètre `?org=<slug>` joue le même rôle.

## Licence

[GNU Affero General Public License v3.0](LICENSE)
