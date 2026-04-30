# Bénévoles

Application **SaaS multi-tenant** de gestion de bénévoles pour événements. Chaque organisation dispose de son propre espace isolé ; les bénévoles s'inscrivent via une timeline Gantt interactive accessible sans compte.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)

## Documentation

| Document | Destinataires |
|----------|---------------|
| [Guide bénévole](GUIDE_BENEVOLE.md) | Personnes qui s'inscrivent comme bénévoles |
| [Guide administrateur](GUIDE_ADMIN.md) | Organisateurs qui gèrent les événements |
| [Fonctionnalités](FONCTIONNALITES.md) | Liste exhaustive de tout ce que fait l'application |
| [Changelog](CHANGELOG.md) | Historique des versions |

## Aperçu

**Côté public**
- Listing des événements publiés
- Inscription à un ou plusieurs créneaux via une timeline Gantt interactive (scroll horizontal sur mobile)
- Détection de conflits d'horaires en temps réel
- Gestion personnelle via un lien unique envoyé par email

**Côté admin**
- Multi-tenant : chaque organisation a ses propres événements, membres et admins, isolés des autres
- Création et gestion des événements, créneaux et programme des spectacles
- Gestion de la liste des membres (pool de bénévoles) et envoi d'invitations tokenisées
- Rappels automatiques (J-2, J-1, Jour J) et rappel manuel avec message personnalisé
- Suivi des inscriptions en temps réel, export Gantt (Excel + PDF)
- Gestion de l'équipe admin de l'organisation

**Super admin**
- CRUD des organisations
- Invitation des premiers admins par lien sécurisé (token révocable)

## Stack

| Couche | Technologie |
|--------|-------------|
| Framework | Next.js 16 (App Router, React 19) |
| Base de données | PostgreSQL 16 + Prisma 7 |
| Auth | NextAuth v5 (credentials) |
| Email | Nodemailer (SMTP configurable) |
| Export | ExcelJS (xlsx), HTML print (PDF) |
| Styles | Tailwind CSS v4 |
| Runtime | Node.js 22 |

## Prérequis

- Node.js **22** (`nvm use 22`)
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

Copier `.env.example` vers `.env` et renseigner :

```env
# Base de données (requis)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/benevoles"

# Auth (requis) — chaîne aléatoire ≥ 32 caractères
AUTH_SECRET="..."

# SMTP (requis pour l'envoi d'emails)
SMTP_HOST="smtp.votre-fournisseur.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="..."
SMTP_PASSWORD="..."
EMAIL_FROM="notifications@votre-domaine.com"

# Email qui reçoit une copie à chaque inscription (optionnel)
ADMIN_NOTIFICATION_EMAIL=""

# URL publique de l'application (utilisée dans les emails et les QR codes)
NEXT_PUBLIC_APP_URL="https://votre-domaine.com"

# Secret partagé pour le endpoint cron /api/cron/reminders (recommandé en prod)
CRON_SECRET="..."
```

> Pour un déploiement derrière un reverse proxy, ajouter aussi `AUTH_TRUST_HOST=true` et `AUTH_URL=https://votre-domaine.com`.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run build` | Build de production |
| `npm start` | Démarrer le serveur de production |
| `npm run db:migrate` | Appliquer les migrations Prisma |
| `npm run db:seed` | Créer super admin + org de démo |
| `npm run db:studio` | Interface graphique Prisma Studio |
| `npm run db:generate` | Régénérer le client Prisma |

## Rappels automatiques (cron)

Le endpoint `GET /api/cron/reminders` envoie les rappels J-2, J-1 et Jour J. Il doit être appelé toutes les heures par un scheduler externe.

```bash
# Exemple crontab
0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine.com/api/cron/reminders
```

Sur Vercel, configurer un Cron Job natif vers `/api/cron/reminders` (intervalle `0 * * * *`).

## Déploiement

### Docker Compose

```bash
docker compose up -d
```

### Kubernetes

Les manifestes sont dans `k8s/`. Un init container exécute `prisma migrate deploy` automatiquement avant le démarrage.

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
APP_IMAGE=ghcr.io/<org>/benevoles:<tag> envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Le CI/CD GitHub Actions gère automatiquement le build et le déploiement sur push vers `main`.

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                          # Liste des événements publiés
│   ├── [orgSlug]/[eventSlug]/            # Page publique d'un événement
│   ├── my/[token]/                       # Gestion de son inscription (bénévole)
│   ├── admin/                            # Interface d'administration par org
│   │   ├── events/                       # CRUD événements, créneaux, inscriptions
│   │   ├── members/                      # Gestion des membres (pool bénévoles)
│   │   └── settings/admins/              # Gestion de l'équipe admin
│   ├── super-admin/                      # Interface super administrateur
│   │   └── organizations/                # CRUD des organisations
│   └── api/
│       ├── admin/                        # API protégée par org
│       ├── super-admin/                  # API super admin
│       ├── cron/reminders/               # Endpoint rappels automatiques
│       └── public/                       # API publique (événements, inscriptions)
├── components/
│   ├── admin/                            # Composants interface admin
│   ├── super-admin/                      # Composants super admin
│   └── DayTimeline.tsx                   # Timeline Gantt interactive
└── lib/
    ├── auth-guard.ts                     # Guards d'authentification + scoping org
    ├── prisma-org.ts                     # Client Prisma scopé par organisation
    ├── notifications/                    # Couche d'envoi de notifications (email)
    │   ├── types.ts                      # Types NotificationKind, Payload
    │   ├── templates.ts                  # Templates HTML + texte
    │   └── index.ts                      # sendNotification()
    ├── email.ts                          # Wrappers sendMemberInvite, etc.
    ├── prisma.ts                         # Client Prisma singleton
    └── utils.ts                          # Utilitaires (token, dates, conflits)
prisma/
├── schema.prisma                         # Schéma BDD
├── migrations/                           # Migration unique (squashée)
└── seed.ts                               # Données initiales
k8s/                                      # Manifestes Kubernetes
.github/workflows/                        # CI/CD GitHub Actions
src/__tests__/security/                   # Tests d'isolation cross-tenant
```

## Modèle de données

| Modèle | Description |
|--------|-------------|
| `Organization` | Tenant (org) avec slug unique et flag `active` |
| `AdminUser` | Compte admin rattaché à une org (ou super admin sans org) ; onboarding par token révocable |
| `Event` | Événement avec dates, statut, slug unique par org |
| `Shift` | Créneau horaire (rôle, capacité, statut, ordre) |
| `Volunteer` | Bénévole identifié par email (partagé entre orgs) |
| `Registration` | Inscription bénévole ↔ créneau avec token d'édition unique et flags de rappels |
| `Member` | Membre du pool bénévole d'une org (tags, notes, actif/inactif) |
| `MemberInvite` | Token d'invitation d'un membre à un événement (révocable, réutilisable) |

## Architecture multi-tenant

Chaque organisation dispose d'un client Prisma étendu (`getOrgClient`) qui injecte automatiquement `organizationId` dans tous les reads. Les mutations passent par une vérification de propriété (read scopé) avant d'accéder au client brut. 20 tests de sécurité valident l'isolation cross-tenant dans `src/__tests__/security/`.

## Licence

[GNU Affero General Public License v3.0](LICENSE)
