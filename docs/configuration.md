# Configuration

Toutes les variables d'environnement lues par l'application. La validation au démarrage est dans `src/lib/env.ts` (Zod) : si `DATABASE_URL` ou `AUTH_SECRET` manque ou est invalide, le processus s'arrête avec un message explicite.

Modèles de fichiers fournis :

- `.env.example` : production
- `.env.development.example` : développement local, prérempli pour la stack Docker (`docker-compose.dev.yml`)

## Application

| Variable | Requis | Description |
|----------|--------|-------------|
| `DATABASE_URL` | oui | URL PostgreSQL (`postgresql://utilisateur:motdepasse@hôte:5432/benevoles?schema=public`) |
| `AUTH_SECRET` | oui | Secret NextAuth, 32 caractères minimum (`openssl rand -base64 48`) |
| `AUTH_URL` | en production | URL publique, requise par NextAuth v5 derrière un reverse proxy |
| `AUTH_TRUST_HOST` | en production | `true` derrière un reverse proxy |
| `NEXT_PUBLIC_APP_URL` | recommandé | URL publique, utilisée dans les emails et les QR codes. Doit être une URL valide |
| `CRON_SECRET` | en production | Secret des endpoints `/api/cron/*`. Vide : refus de toute requête en production, `localhost` seul accepté en développement |

## Email

Sans `SMTP_HOST`, aucun email n'est envoyé : le contenu est affiché dans la console du serveur (voir `src/lib/notifications/channels/email.ts`).

| Variable | Requis | Description |
|----------|--------|-------------|
| `SMTP_HOST` | pour envoyer | Serveur SMTP |
| `SMTP_PORT` | non | Défaut `587` |
| `SMTP_SECURE` | non | `true` pour TLS implicite (port 465), sinon `false` |
| `SMTP_USER`, `SMTP_PASSWORD` | non | Authentification SMTP, utilisée si les deux sont renseignées |
| `EMAIL_FROM` | recommandé | Expéditeur, avec nom possible : `Bénévoles <notifications@votre-domaine.com>` |
| `EMAIL_REPLY_TO` | non | Adresse de réponse. Doit pointer vers une boîte lue par un humain |
| `ADMIN_NOTIFICATION_EMAIL` | non | Reçoit une copie de chaque nouvelle inscription |

Exemples de réglages SMTP courants dans `.env.example` (Gmail, OVH, Infomaniak, Brevo).

## Notifications push (optionnel)

Sans clés VAPID, le bouton d'abonnement n'est pas proposé aux bénévoles et aucun push n'est envoyé.

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | Clé publique VAPID |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID |
| `VAPID_EMAIL` | Contact déclaré au service push. Défaut : `EMAIL_FROM`, puis `mailto:admin@benevol.app` |

Générer une paire de clés :

```bash
node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys()))"
```

## Sentry (optionnel)

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | DSN serveur et edge (`sentry.server.config.ts`, `sentry.edge.config.ts`) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN navigateur (`instrumentation-client.ts`). Argument de build Docker |
| `SENTRY_AUTH_TOKEN` | Upload des source maps au build. Secret de build Docker (`sentry_auth_token`) |

Le client Sentry ignore les erreurs provoquées par les scripts injectés par les navigateurs iOS (`__firefox__`, `DarkReader`, `window.ethereum`).

## Seed (`npm run db:seed`)

Lues uniquement par `prisma/seed.ts`, jamais par l'application.

| Variable | Défaut |
|----------|--------|
| `ADMIN_EMAIL` | `admin@localhost` |
| `ADMIN_PASSWORD` | `change-me` |
| `ORG_ADMIN_EMAIL` | `org-admin@localhost` |
| `ORG_ADMIN_PASSWORD` | valeur de `ADMIN_PASSWORD` |

Le seed crée un super admin et une organisation `default` avec son admin. En production, définir ces quatre variables avant de lancer le seed.

Avec `.env.development.example`, le super admin est `admin@local` / `admin`.

## Scripts et tests

- `BASE_PUBLIC` (défaut `https://www.benevol.app`) et `BASE_ADMIN` (défaut `https://cdp.benevol.app`) : URL ciblées par `npm run screenshots` (`scripts/screenshots.mjs`).
- `CI` : change le comportement de Playwright (une relance en cas d'échec, rapport GitHub, pas de réutilisation d'un serveur existant).

## Secrets Kubernetes

`k8s/secret.yaml` liste les clés du secret `benevoles-secret`. Il ne contient pas `AUTH_URL`, `AUTH_TRUST_HOST`, `VAPID_*` ni les variables Sentry : à ajouter au secret réel si vous les utilisez. `BACKUP_PASSPHRASE` sert à chiffrer les sauvegardes (`k8s/cronjob-backup.yaml`).
