# Configuration

Toutes les variables d'environnement lues par l'application. Au démarrage, `src/lib/env.ts` (Zod) arrête le processus avec un message explicite si `DATABASE_URL` manque, si `AUTH_SECRET` fait moins de 32 caractères, si `NEXT_PUBLIC_APP_URL` n'est pas une URL ou si `TOKEN_ENCRYPTION_KEY` n'est pas une clé de 32 octets. `src/lib/production-guards.ts` (appelé par `src/instrumentation.ts`) refuse ensuite de démarrer sur une clé de rotation mal formée, un `TOKEN_ENCRYPTION_KEY_ID` qui contient `:` ou un fuseau invalide, et, en production, sans `TOKEN_ENCRYPTION_KEY`.

Modèles de fichiers fournis :

- `.env.example` : production. Il ne contient pas `TOKEN_ENCRYPTION_KEY`, pourtant obligatoire en production : l'ajouter.
- `.env.development.example` : développement local, prérempli pour la stack Docker (`docker-compose.dev.yml`)

## Application

| Variable | Requis | Description |
|----------|--------|-------------|
| `DATABASE_URL` | oui | URL PostgreSQL (`postgresql://utilisateur:motdepasse@hôte:5432/benevoles?schema=public`) |
| `AUTH_SECRET` | oui | Secret NextAuth, 32 caractères minimum (`openssl rand -base64 48`). Il sert aussi de clé aux empreintes d'adresse du registre des effacements (#516) : avant de le changer, exporter ce registre (`scripts/erasure-register.ts export`), car les empreintes antérieures ne permettront plus de retrouver une fiche par son adresse ; le rejeu par identifiant fonctionne toujours. Voir [rgpd/procedure-effacement.md](rgpd/procedure-effacement.md). |
| `AUTH_URL` | en production | URL publique, requise par NextAuth v5 derrière un reverse proxy |
| `AUTH_TRUST_HOST` | en production | `true` derrière un reverse proxy |
| `NEXT_PUBLIC_APP_URL` | en production | URL publique du site principal (`https://www.benevol.app`). Sert aux liens des emails et aux QR codes, et donne le domaine des organisations (`<slug>.benevol.app`, sans `www`). Défaut `http://localhost:3000` : en local, les liens d'organisation deviennent `?org=<slug>`. Doit être une URL valide. Les CronJobs Kubernetes l'utilisent comme adresse de l'application |
| `CRON_SECRET` | en production | Secret des endpoints `/api/cron/*`. Vide : refus de toute requête en production, `localhost` seul accepté en développement |
| `RELEASE_CHECK` | non | Vérification quotidienne de la dernière release GitHub publique (#612), instances auto-hébergées. Défaut actif ; `off` la désactive complètement : aucune requête sortante, utile sur un intranet sans accès web. La requête (sans jeton) ne révèle que l'adresse IP de l'instance à GitHub, rien sur les organisations ni les bénévoles. `benevol.app` garde le défaut actif : déployé depuis `main`, sa version n'est jamais en retard sur la dernière release, la bannière ne s'affiche donc jamais |
| `TOKEN_ENCRYPTION_KEY` | en production | Chiffrement en base des liens personnels des bénévoles, responsables et invitations (32 octets en base64, `openssl rand -base64 32`). Le serveur refuse de démarrer sans elle en production ; en développement, les jetons restent en clair. Avec la clé, les nouveaux jetons sont chiffrés et la tâche de nettoyage chiffre les anciens. Ne doit jamais être perdue : pour la changer, voir [Rotation de la clé de chiffrement](#rotation-de-la-clé-de-chiffrement) |
| `TOKEN_ENCRYPTION_KEY_ID` | non | Identifiant de la clé courante, enregistré dans chaque valeur chiffrée (défaut `k1`, sans `:`) |
| `TOKEN_ENCRYPTION_PREVIOUS_KEYS` | non | Anciennes clés encore nécessaires pendant une rotation : `id:base64,id:base64`. Une entrée mal formée empêche le démarrage |
| `APP_TIME_ZONE` | non | Fuseau horaire par défaut des événements (nom IANA, défaut `Europe/Zurich`), pour les organisations qui n'ont pas choisi le leur dans leurs paramètres. Les heures des créneaux sont des heures locales : ce fuseau sert à calculer les rappels et à afficher les heures dans les emails, le journal et l'export PDF. Une valeur invalide empêche le démarrage |
| `TRUSTED_PROXY_HOPS` | non | Nombre de proxies qui ajoutent une entrée à `X-Forwarded-For` devant l'application (défaut `1` : Traefik). L'adresse client utilisée pour les limites de débit est la n-ième en partant de la droite ; à augmenter seulement si un autre proxy ou répartiteur ajoute sa propre entrée devant Traefik |
| `MIGRATE_ON_START` | non | Toute valeur autre que `false` : `docker-entrypoint.sh` applique `prisma migrate deploy` avant de lancer le serveur (défaut, Docker Compose). `false` dans `k8s/deployment.yaml`, où le Job `k8s/job-migrate.yaml` (qui la met à `true`) les applique une seule fois par déploiement |
| `GIT_SHA` | non | Commit déployé, fixé au build de l'image (argument de build `GIT_SHA`, rempli par `deploy.yml`). Affiché sur la page Santé du service |

L'image et les manifestes fixent eux-mêmes `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` et `NEXT_TELEMETRY_DISABLED=1`. `docker-compose.yml` transmet aussi `POSTGRES_HOST` et `POSTGRES_USER` à l'application, qui ne les lit pas.

### Rotation de la clé de chiffrement

Pour remplacer `TOKEN_ENCRYPTION_KEY` sans casser les liens existants :

1. Générer une nouvelle clé (`openssl rand -base64 32`) et la conserver avec les autres secrets.
2. Mettre l'ancienne clé dans `TOKEN_ENCRYPTION_PREVIOUS_KEYS` sous son identifiant actuel (`k1:<ancienne clé>` si `TOKEN_ENCRYPTION_KEY_ID` n'était pas défini), la nouvelle dans `TOKEN_ENCRYPTION_KEY`, et un nouvel identifiant dans `TOKEN_ENCRYPTION_KEY_ID` (par exemple `k2`), puis déployer.
3. La tâche de nettoyage rechiffre tout avec la nouvelle clé ; sa réponse indique `reencrypted` à chaque passage. Quand un passage ne rechiffre plus rien, et au moins un jour plus tard pour que les emails en attente chiffrés avec l'ancienne clé soient partis, retirer l'ancienne clé de `TOKEN_ENCRYPTION_PREVIOUS_KEYS` et redéployer.

## Email

Sans `SMTP_HOST`, aucun email n'est envoyé. En production, chaque envoi échoue avec la raison « SMTP_HOST manquant » : la file d'envoi le retente puis alerte, les envois directs le signalent à l'écran, et ni le destinataire ni le contenu ne sont écrits dans les journaux. En développement et en test, le contenu est affiché dans la console du serveur (voir `src/lib/notifications/channels/email.ts`). La page **Santé du service** signale un `SMTP_HOST` manquant.

| Variable | Requis | Description |
|----------|--------|-------------|
| `SMTP_HOST` | pour envoyer | Serveur SMTP |
| `SMTP_PORT` | non | Défaut `587` |
| `SMTP_SECURE` | non | `true` pour TLS implicite (port 465), sinon `false` |
| `SMTP_USER`, `SMTP_PASSWORD` | non | Authentification SMTP, utilisée si les deux sont renseignées |
| `EMAIL_FROM` | recommandé | Expéditeur, avec nom possible : `Bénévoles <notifications@votre-domaine.com>`. Défaut : `Bénévoles <notifications@benevol.app>` |
| `EMAIL_REPLY_TO` | non | Adresse de réponse par défaut, utilisée quand l'organisation n'a pas défini la sienne dans ses réglages. Doit pointer vers une boîte lue par un humain |
| `ADMIN_NOTIFICATION_EMAIL` | non | Reçoit une copie de chaque nouvelle inscription |

Exemples de réglages SMTP courants dans `.env.example` (Gmail, OVH, Infomaniak, Brevo).

## Notifications push (optionnel)

Sans clés VAPID, aucun push n'est envoyé. Le bouton d'abonnement de la page personnelle reste affiché et disparaît au premier clic. La page Santé du service signale l'absence des clés.

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | Clé publique VAPID |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID |
| `VAPID_EMAIL` | Contact déclaré au service push. Défaut : `EMAIL_FROM`, puis `mailto:admin@benevol.app` |

Générer une paire de clés :

```bash
node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys()))"
```

## Bibliothèque vidéo (optionnel)

`/videos` et `/videos/[id]` (#644) ne sont référencés nulle part (pas de navigation, pas de sitemap, `robots: noindex,nofollow`) : une bibliothèque interne pour l'instant, pas une page publique. Le catalogue (`videos/catalog.json`, les manifestes et les scripts éditoriaux) est toujours dans l'image et la page s'affiche sans `VIDEO_MEDIA_BASE_URL` ; seule la lecture change.

| Variable | Requis | Description |
|----------|--------|-------------|
| `VIDEO_MEDIA_BASE_URL` | non | Base des fichiers rendus : `<base>/<slug>/<slug>.mp4`, `.vtt`, `.txt`. Production (`benevol.app`) : `https://medias.benevol.app` (`k8s/media.yaml`, rendus publiés par `make video-publish`), un domaine séparé réservé par `src/lib/org-subdomain.ts` (`NON_ORG_SUBDOMAINS`, `isReservedOrgSlug`) pour qu'aucune organisation ne puisse jamais prendre ce slug ; écrite en dur par l'étape « Sync k8s secret » de `.github/workflows/deploy.yml` (comme `NEXT_PUBLIC_APP_URL`), qui régénère `benevoles-secret` à chaque déploiement — un `kubectl` manuel sur le secret serait donc écrasé. Sans la variable, ou si le rendu d'une vidéo précise n'existe pas, la page affiche « Vidéo bientôt disponible » sans jamais sonder le réseau côté serveur — voir `videos/README.md` |

Le lecteur (`<video crossOrigin="anonymous">`) charge la vidéo et ses sous-titres (`<track>`) depuis `medias.benevol.app`, une autre origine que `www.benevol.app` : ce domaine doit répondre avec `Access-Control-Allow-Origin: https://www.benevol.app` (et les sous-domaines d'organisation si la page y est un jour servie), et les bons `Content-Type` (`video/mp4`, `text/vtt`). `make video-media-serve` envoie les mêmes en-têtes en local. L'application n'a pas de Content-Security-Policy aujourd'hui : rien à y ajouter pour ce domaine.

## Sentry (optionnel)

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | DSN serveur et edge (`sentry.server.config.ts`, `sentry.edge.config.ts`) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN navigateur (`instrumentation-client.ts`). Argument de build Docker |
| `SENTRY_AUTH_TOKEN` | Upload des source maps au build. Secret de build Docker (`sentry_auth_token`) |

Le client Sentry ignore les erreurs des scripts injectés par les navigateurs et les extensions (`__firefox__` des navigateurs iOS, `DarkReader`, `window.ethereum`, `MetaMask`), le rejet « Object Not Found Matching Id:…, MethodName:…, ParamCount:… » des analyseurs de liens de Microsoft (Outlook Safe Links, Defender), qui ouvrent les liens personnels des emails, et les erreurs des URLs `app://` et `inpage.js`. La liste est `BROWSER_NOISE_ERRORS` (`src/lib/sentry-scrub.ts`). Côté serveur, il ignore « The destination stream closed early » (client déconnecté pendant un flux).

Données envoyées à Sentry (navigateur, serveur et edge) :

- Sentry n'est actif que dans les builds de production (`enabled: NODE_ENV === "production"`). Le développement local et les tests E2E, qui chargent le vrai DSN depuis `.env`, n'envoient rien.
- `dataCollection: NO_PII_DATA_COLLECTION` (`src/lib/sentry-scrub.ts`) : ni informations utilisateur, ni cookies, ni en-têtes, ni corps de requête, ni paramètres d'URL, ni données de requêtes SQL, ni variables locales. `includeLocalVariables` est aussi désactivé côté serveur.
- `src/lib/sentry-scrub.ts` masque les jetons d'accès dans les URLs (`/my/<jeton>`, `/leader/<jeton>`, `/waitlist/<jeton>/confirm`, `/api/public/registrations/<jeton>`, `/api/public/member-invite/<jeton>`, `/api/public/leader/<jeton>`, et les paramètres `token` et `t`) avant l'envoi des événements, transactions, spans et fils d'Ariane. Les enregistrements de session (Session Replay : 10 % des sessions, 100 % de celles avec erreur) masquent tous les textes et les médias ; leurs URLs ne sont pas nettoyées par ce module.
- Région du compte : Union européenne (Allemagne), d'après le DSN public du navigateur (`ingest.de.sentry.io`).

## Seed (`npm run db:seed`)

Lues uniquement par `prisma/seed.ts`, jamais par l'application.

| Variable | Défaut |
|----------|--------|
| `ADMIN_EMAIL` | `admin@localhost` |
| `ADMIN_PASSWORD` | `change-me` |
| `ORG_ADMIN_EMAIL` | `org-admin@localhost` |
| `ORG_ADMIN_PASSWORD` | valeur de `ADMIN_PASSWORD` |

Le seed crée un super admin, une organisation `default` avec son admin, et un événement de démonstration publié dans cette organisation (à archiver en production). Le relancer remet les mots de passe des deux comptes aux valeurs des variables. En production, définir ces quatre variables avant de le lancer. Aucun déploiement ne le lance : sur Kubernetes, `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont présents dans `benevoles-secret` mais ne servent qu'à un seed lancé à la main.

Avec `.env.development.example`, le super admin est `admin@local` / `admin`.

## Scripts et tests

- `npm run screenshots` (`scripts/screenshots.mjs`) : `BASE_URL` (défaut `http://localhost:3200`), `DEMO_ORG` (défaut `default`), `ORG_ADMIN_EMAIL` / `ORG_ADMIN_PASSWORD` (connexion admin), `ONLY` (liste de captures séparées par des virgules), `PUBLIC_ONLY` (pages publiques seules).
- Playwright : `E2E_PORT` (défaut `3100`), `PLAYWRIGHT_BASE_URL` (défaut `http://localhost:$E2E_PORT`), `MAILPIT_URL` (lecture des emails capturés, défaut `http://localhost:8026`), `CI` (une relance en cas d'échec, rapport GitHub, pas de réutilisation d'un serveur existant).
- `npm run test:integration` : `DATABASE_URL` d'un PostgreSQL jetable.

## Secrets Kubernetes

`k8s/secret.yaml` est un modèle incomplet : il n'a pas `AUTH_URL`, `AUTH_TRUST_HOST`, `VAPID_*` ni `SENTRY_DSN`. Le secret réel `benevoles-secret` est régénéré à chaque déploiement par l'étape « Sync k8s secret » de `.github/workflows/deploy.yml` :

| Clé | Origine |
|-----|---------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | secrets GitHub du même nom ; lus aussi par le pod PostgreSQL et la sauvegarde |
| `DATABASE_URL` | construite : `postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/benevoles` |
| `AUTH_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY_ID`, `TOKEN_ENCRYPTION_PREVIOUS_KEYS` | secrets GitHub du même nom |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_NOTIFICATION_EMAIL` | secrets GitHub du même nom |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | secrets GitHub du même nom |
| `SENTRY_DSN` | secret GitHub `SENTRY_DSN`, à défaut `NEXT_PUBLIC_SENTRY_DSN` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | secrets GitHub du même nom ; lus seulement par le seed |
| `NEXT_PUBLIC_APP_URL`, `AUTH_URL` | écrits en dur : `https://www.benevol.app` |
| `AUTH_TRUST_HOST` | écrit en dur : `true` |
| `VIDEO_MEDIA_BASE_URL` | écrit en dur : `https://medias.benevol.app` (#644) |
| `BACKUP_PASSPHRASE` | non géré par le workflow : ajouté à la main dans le cluster, voir [deploiement.md](deploiement.md#backup_passphrase-est-un-point-unique-de-défaillance) |
| `OFFSITE_BUCKET` | secret GitHub du même nom (#524) : container Swiss Backup des copies hors site, obligatoire pour le CronJob `backup-offsite` ; voir [deploiement.md](deploiement.md#copie-hors-site) |

`APP_TIME_ZONE`, `TRUSTED_PROXY_HOPS` et `VAPID_EMAIL` ne sont pas transmis : leurs valeurs par défaut s'appliquent. Le workflow lit aussi `KUBECONFIG_BASE64` (accès au cluster), `GHCR_PULL_TOKEN` (secret de tirage `ghcr-secret`), `NEXT_PUBLIC_SENTRY_DSN` (argument de build) et `SENTRY_AUTH_TOKEN` (secret de build).

Le workflow applique le secret avec `kubectl apply` : une clé qu'il gère, modifiée à la main dans le cluster, est écrasée au déploiement suivant.
