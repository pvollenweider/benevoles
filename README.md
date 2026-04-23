# Bénévoles

Application de gestion de bénévoles pour événements. Permet aux organisateurs de créer des événements, définir des créneaux de bénévolat, et aux bénévoles de s'inscrire en ligne.

## Fonctionnalités

- **Côté public** : listing des événements publiés, inscription à un ou plusieurs créneaux, modification ou annulation via un lien personnel envoyé par email
- **Côté admin** : création et gestion des événements, des créneaux (rôle, horaire, capacité), suivi des inscriptions, export Excel et PDF
- Détection de conflits d'horaires en temps réel lors de l'inscription
- Notifications email (confirmation bénévole + alerte admin optionnelle)
- Vue planning Gantt par jour dans l'export

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
- PostgreSQL 16+

## Installation

```bash
git clone <repo>
cd benevoles
npm install
cp .env.example .env
# Remplir .env (voir section Variables d'environnement)
```

### Base de données

```bash
# Créer les tables
npm run db:migrate

# Créer le compte admin + données de démonstration
npm run db:seed
```

### Développement

```bash
npm run dev
# → http://localhost:3000         (vue publique)
# → http://localhost:3000/admin   (interface admin)
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

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
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

Les manifestes sont dans `k8s/`. L'application est déployée sur `benevoles.gallerypack.app`.

```bash
# 1. Build et push de l'image
docker build -t ghcr.io/<org>/benevoles:<tag> .
docker push ghcr.io/<org>/benevoles:<tag>

# 2. Appliquer les secrets (à faire une seule fois ou après modif)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml   # après avoir renseigné les valeurs

# 3. Déployer
APP_IMAGE=ghcr.io/<org>/benevoles:<tag> envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Un init container exécute `prisma migrate deploy` automatiquement avant le démarrage de l'application.

## Structure du projet

```
src/
├── app/
│   ├── page.tsx                    # Page d'accueil (liste des événements)
│   ├── events/[slug]/              # Page publique d'un événement
│   ├── my/[token]/                 # Gestion de son inscription (bénévole)
│   ├── admin/                      # Interface d'administration
│   └── api/
│       ├── admin/                  # API protégée (CRUD événements, créneaux)
│       └── public/                 # API publique (événements, inscriptions)
├── components/                     # Composants réutilisables
└── lib/                            # Utilitaires (email, prisma, rôles)
prisma/
├── schema.prisma                   # Schéma de la base (Event, Shift, Volunteer…)
├── migrations/                     # Migrations SQL
└── seed.ts                         # Données initiales
k8s/                                # Manifestes Kubernetes
```

## Modèle de données

- **Event** — événement avec dates, statut de publication, programme des spectacles
- **Shift** — créneau horaire rattaché à un événement (rôle, capacité, statut)
- **Volunteer** — bénévole identifié par son email
- **Registration** — inscription d'un bénévole à un créneau, avec token d'édition unique
- **AdminUser** — compte administrateur avec mot de passe hashé (bcrypt)

## Licence

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)
