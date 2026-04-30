# Bénévoles

Application de gestion de bénévoles pour événements. Les organisateurs créent des événements et des créneaux de bénévolat ; les bénévoles s'inscrivent en ligne via une timeline interactive.

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
- Création et gestion des événements, créneaux et programme des spectacles
- Suivi des inscriptions en temps réel
- Export Gantt (Excel + PDF) avec plages des spectacles en fond

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
- App : http://localhost:3000 (admin sur `/admin`, identifiants par défaut `admin@local` / `admin`)
- Mailpit : http://localhost:8025 (captures de tous les emails envoyés en dev)
- Postgres : `localhost:5432` (`benevoles` / `benevoles`)

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
# Génère un AUTH_SECRET et colle-le dans .env
openssl rand -base64 48
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## Variables d'environnement

Copier `.env.example` vers `.env` et renseigner :

```env
# Base de données (requis)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/benevoles"

# Compte administrateur — utilisé par `npm run db:seed`
ADMIN_EMAIL="admin@votre-domaine.com"
ADMIN_PASSWORD="mot-de-passe-robuste"

# Auth (requis) — chaîne aléatoire ≥ 32 caractères
AUTH_SECRET="..."

# SMTP (requis pour l'envoi d'emails)
SMTP_HOST="smtp.votre-fournisseur.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="..."
SMTP_PASSWORD="..."
EMAIL_FROM="no-reply@votre-domaine.com"

# Email qui reçoit une copie à chaque inscription (optionnel)
ADMIN_NOTIFICATION_EMAIL=""

# URL publique de l'application (utilisée dans les emails)
NEXT_PUBLIC_APP_URL="https://votre-domaine.com"
```

> Pour un déploiement derrière un reverse proxy, ajouter aussi `AUTH_TRUST_HOST=true` et `AUTH_URL=https://votre-domaine.com`.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run build` | Build de production |
| `npm start` | Démarrer le serveur de production |
| `npm run db:migrate` | Appliquer les migrations Prisma |
| `npm run db:seed` | Créer le compte admin + données démo |
| `npm run db:studio` | Interface graphique Prisma Studio |
| `npm run db:generate` | Régénérer le client Prisma |

## Déploiement

### Docker Compose

```bash
# Production
docker compose up -d

# Développement (avec hot-reload)
docker compose -f docker-compose.dev.yml up
```

### Kubernetes

Les manifestes sont dans `k8s/`. Un init container exécute `prisma migrate deploy` automatiquement avant le démarrage de l'application.

```bash
# 1. Build et push de l'image
docker build -t ghcr.io/<org>/benevoles:<tag> .
docker push ghcr.io/<org>/benevoles:<tag>

# 2. Appliquer les secrets (une seule fois ou après modification)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml

# 3. Déployer
APP_IMAGE=ghcr.io/<org>/benevoles:<tag> envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Le CI/CD GitHub Actions gère automatiquement le build et le déploiement sur push vers `main`.

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                    # Page d'accueil (liste des événements)
│   ├── events/[slug]/              # Page publique d'un événement
│   ├── my/[token]/                 # Gestion de son inscription (bénévole)
│   ├── admin/                      # Interface d'administration
│   └── api/
│       ├── admin/                  # API protégée (CRUD événements, créneaux, exports)
│       └── public/                 # API publique (événements, inscriptions)
├── components/
│   └── DayTimeline.tsx             # Timeline Gantt interactive
└── lib/
    ├── email.ts                    # Envoi d'emails (Nodemailer)
    ├── prisma.ts                   # Client Prisma singleton
    ├── roles.tsx                   # Palette de couleurs par rôle
    └── utils.ts                    # Utilitaires (token, dates, détection de conflits)
prisma/
├── schema.prisma                   # Schéma BDD (Event, Shift, Volunteer…)
├── migrations/                     # Migrations SQL versionnées
└── seed.ts                         # Données initiales
k8s/                                # Manifestes Kubernetes
.github/workflows/                  # CI/CD GitHub Actions
```

## Modèle de données

| Modèle | Description |
|--------|-------------|
| `Event` | Événement avec dates, statut de publication et programme des spectacles |
| `Shift` | Créneau horaire rattaché à un événement (rôle, capacité, statut) |
| `Volunteer` | Bénévole identifié par son email |
| `Registration` | Inscription d'un bénévole à un créneau, avec token d'édition unique |
| `AdminUser` | Compte administrateur avec mot de passe hashé (bcrypt) |

## Licence

[GNU Affero General Public License v3.0](LICENSE)
