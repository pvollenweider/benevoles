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
| `SITE_NAME` | non | Nom de l'instance (#760) dans les titres, les emails, l'en-tête et le pied de page, les images de partage. Sans elle : le domaine de `NEXT_PUBLIC_APP_URL` sans `www.` (`benevol.app` sur l'instance du projet). `src/lib/site.ts`. Les textes publics écrits pour benevol.app (page Fonctionnalités, guides, llms.txt) prennent aussi ce nom, le domaine de l'instance et `CONTACT_EMAIL` (`localizeInstanceText`). Un test (`src/__tests__/security/no-hard-coded-instance.test.ts`) refuse tout nouveau « benevol.app » écrit en dur hors d'une liste justifiée. |
| `CONTACT_EMAIL` | non | Adresse de contact publique (#760) : accueil, données structurées, message « inscriptions fermées ». Sans elle : `contact@benevol.app` sur l'instance du projet, sinon `EMAIL_REPLY_TO`, sinon aucune adresse affichée. |
| `SUPPORT_URL` | non | Lien « Soutenir le projet » du pied de page (#760), en `https://`. Sans elle : la page du projet sur l'instance benevol.app, sinon le lien n'apparaît pas. |
| `HOSTED_SERVICE` | non | `true` : cette instance est le service hébergé benevol.app (#760) et montre ses pages propres (politique de confidentialité, CGU, accord et liste des sous-traitants, déclaration d'accessibilité, page « Logiciel de planning pour bénévoles », accueil commercial). `false` : elle les cache (404, hors du sitemap) et montre « Exploitant de cette instance » (`/legal/exploitant`) et un accueil court. Sans valeur : `true` pour benevol.app et une instance sans adresse (développement, tests, captures vidéo), `false` pour tout autre domaine. Posée à `true` par `deploy.yml`. |
| `ORG_INACTIVITY` | non | Vérification périodique des espaces inactifs (#811). `report` (par défaut) : liste dans « Organisations bientôt inactives » et dans le nettoyage quotidien les organisations qui recevraient bientôt « Souhaitez-vous conserver votre espace ? » (18 mois sans activité ni événement à venir), sans rien envoyer, désactiver ni supprimer. `off` : rien. Les rappels et la désactivation (`on`) ne sont pas encore livrés ; `on` vaut `report`. |
| `CRON_SECRET` | en production | Secret des endpoints `/api/cron/*`. Vide : refus de toute requête en production, `localhost` seul accepté en développement |
| `RELEASE_CHECK` | non | Vérification quotidienne de la dernière release GitHub publique (#612), instances auto-hébergées. Défaut actif ; `off` la désactive complètement : aucune requête sortante, utile sur un intranet sans accès web. La requête (sans jeton) ne révèle que l'adresse IP de l'instance à GitHub, rien sur les organisations ni les bénévoles. `benevol.app` garde le défaut actif : déployé depuis `main`, sa version n'est jamais en retard sur la dernière release, la bannière ne s'affiche donc jamais |
| `SIGNUP` | non | `off` ferme l'inscription en libre-service (#810, `/inscription`) : la page et l'API répondent « Les inscriptions sont fermées », aucune demande n'est enregistrée ni confirmée. Ouverte par défaut. Secret GitHub du même nom ; pour fermer sans attendre un déploiement, voir [inscription-libre-service.md](inscription-libre-service.md#fermer-linscription). |
| `EMAIL_LIMIT_SIGNUP_PER_HOUR` | non | Plafond de toute la plateforme pour les emails de confirmation d'inscription, par heure (#810). Au-delà, ces emails sont abandonnés, pas retenus, et l'opérateur est alerté. Compromis assumé : quelqu'un peut l'épuiser exprès et retarder les vraies inscriptions d'au plus une heure, au-delà des limites par adresse IP et par adresse email. Défaut 60 |
| `NTFY_URL` | non | Alertes à l'opérateur par notification ntfy (#810, `src/lib/operator-alerts.ts`) : URL du sujet, en `https://`, par exemple `https://ntfy.sh/<sujet aléatoire>` (le nom du sujet tient lieu de secret : aléatoire et long). Sans elle, seule l'alerte par email aux super admins part. Aucune donnée personnelle dans une alerte : un titre, une phrase et un lien vers l'espace super admin. Secret GitHub du même nom, synchronisé par `deploy.yml` |
| `OPERATOR_ALERT_EMAIL` | non | Adresse qui reçoit les alertes email de l'opérateur (#810 : nouvel espace à valider, plafond d'envoi atteint, espaces en attente). Sans elle, chaque super admin actif les reçoit à son adresse de connexion. Une adresse invalide n'empêche pas le démarrage : elle est signalée à Sentry et les alertes vont aux super admins. |
| `NTFY_TOKEN` | non | Jeton d'accès au sujet ntfy, si le sujet est protégé (envoyé en `Authorization: Bearer`). Secret GitHub du même nom |
| `EMAIL_LIMIT_ORG_PER_MINUTE` | non | Plafond d'emails par organisation et par minute, tous types et tous destinataires confondus (#810). Défaut 120. Au-delà, un email de la file reste en attente et repart à la fin de la minute ; un envoi direct échoue avec la raison `limit:org_per_minute`. Seuls les emails réellement envoyés sont comptés : un email retenu, puis réessayé, ne consomme rien. Une alerte Sentry (`email.limit.*`) au premier email retenu de la fenêtre |
| `EMAIL_LIMIT_ORG_PER_DAY` | non | Plafond d'emails par organisation et par jour (fenêtre de 24 h). Défaut 5000 |
| `EMAIL_LIMIT_ORG_BULK_PER_DAY` | non | Plafond par organisation et par jour des envois en masse : messages ciblés, invitations de membres, créneaux à compléter, rappel manuel. Défaut 2000 |
| `EMAIL_LIMIT_ORG_ACCOUNT_PER_DAY` | non | Plafond par organisation et par jour des emails de compte envoyés par un administrateur connecté ou le super admin : invitation et bienvenue d'un administrateur. Défaut 50 |
| `EMAIL_LIMIT_RECIPIENT_PER_HOUR` | non | Plafond par adresse et par heure des emails que n'importe qui peut déclencher depuis une page publique : réinitialisation de mot de passe, confirmation d'inscription, lien perdu. Vérifié en premier : une avalanche de demandes pour une adresse s'arrête là, sans épuiser les plafonds de l'organisation ni bloquer la réinitialisation des autres administrateurs. Au-delà, l'email est abandonné (« Annulé »), pas mis en attente : une file de demandes ne s'égrène pas pendant des heures devant la vraie. L'adresse n'est conservée que sous forme d'empreinte. Défaut 5 |
| `EMAIL_LIMIT_GLOBAL_PER_MINUTE` | non | Plafond de toute la plateforme par minute, emails sans organisation compris (communications produit, alerte de version) : filet de sécurité pour la réputation du domaine d'envoi. Défaut 600 |
| `TOKEN_ENCRYPTION_KEY` | en production | Chiffrement en base des liens personnels des bénévoles, responsables et invitations (32 octets en base64, `openssl rand -base64 32`). Le serveur refuse de démarrer sans elle en production ; en développement, les jetons restent en clair. Avec la clé, les nouveaux jetons sont chiffrés et la tâche de nettoyage chiffre les anciens. Ne doit jamais être perdue : pour la changer, voir [Rotation de la clé de chiffrement](#rotation-de-la-clé-de-chiffrement) |
| `TOKEN_ENCRYPTION_KEY_ID` | non | Identifiant de la clé courante, enregistré dans chaque valeur chiffrée (défaut `k1`, sans `:`) |
| `TOKEN_ENCRYPTION_PREVIOUS_KEYS` | non | Anciennes clés encore nécessaires pendant une rotation : `id:base64,id:base64`. Une entrée mal formée empêche le démarrage |
| `APP_TIME_ZONE` | non | Fuseau horaire par défaut des événements (nom IANA, défaut `Europe/Zurich`), pour les organisations qui n'ont pas choisi le leur dans leurs paramètres. Les heures des créneaux sont des heures locales : ce fuseau sert à calculer les rappels et à afficher les heures dans les emails, le journal et l'export PDF. Une valeur invalide empêche le démarrage |
| `TRUSTED_PROXY_HOPS` | non | Nombre de proxies qui ajoutent une entrée à `X-Forwarded-For` devant l'application (défaut `1` : Traefik). L'adresse client utilisée pour les limites de débit est la n-ième en partant de la droite ; à augmenter seulement si un autre proxy ou répartiteur ajoute sa propre entrée devant Traefik |
| `MIGRATE_ON_START` | non | Toute valeur autre que `false` : `docker-entrypoint.sh` applique `prisma migrate deploy` avant de lancer le serveur (défaut, Docker Compose). `false` dans `k8s/deployment.yaml`, où le Job `k8s/job-migrate.yaml` (qui la met à `true`) les applique une seule fois par déploiement |
| `WARMUP` | non | Toute valeur autre que `false` : au démarrage, `docker-entrypoint.sh` préchauffe les pages publiques avant que `/api/health/ready` réponde 200 (défaut). Réglages fins (`WARMUP_TIMEOUT_MS`, `WARMUP_REQUEST_TIMEOUT_MS`, `WARMUP_CONCURRENCY`, `WARMUP_READY_FILE`) : voir [Préchauffage avant la mise en service](deploiement.md#préchauffage-avant-la-mise-en-service) |
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

`/videos` et `/videos/[id]` (#644) sont la bibliothèque publique des tutoriels vidéo. Le catalogue (`videos/catalog.json`, `videos/renders.json`, les manifestes et les scripts éditoriaux) est toujours dans l'image et la page s'affiche sans `VIDEO_MEDIA_BASE_URL` ; seule la lecture change, et avec elle le référencement : sans la variable, aucune vidéo n'est jouable, donc aucune n'est indexée ni listée dans `/video-sitemap.xml` (voir `videos/README.md`). Les adresses canoniques et le sitemap vidéo sont construits sur `NEXT_PUBLIC_APP_URL`, lu à l'exécution.

| Variable | Requis | Description |
|----------|--------|-------------|
| `VIDEO_MEDIA_BASE_URL` | non | Base des fichiers rendus : `<base>/<slug>/<slug>.mp4`, `.vtt`, `.txt`. Production (`benevol.app`) : `https://medias.benevol.app` (`k8s/media.yaml`, rendus publiés par `make video-publish`), un domaine séparé réservé par `src/lib/org-subdomain.ts` (`NON_ORG_SUBDOMAINS`, `isReservedOrgSlug`) pour qu'aucune organisation ne puisse jamais prendre ce slug ; écrite en dur par l'étape « Sync k8s secret » de `.github/workflows/deploy.yml` (comme `NEXT_PUBLIC_APP_URL`), qui régénère `benevoles-secret` à chaque déploiement — un `kubectl` manuel sur le secret serait donc écrasé. Sans la variable, ou si le rendu d'une vidéo précise n'existe pas, la page affiche « Vidéo bientôt disponible » sans jamais sonder le réseau côté serveur — voir `videos/README.md` |

Le lecteur (`<video crossOrigin="anonymous">`) charge la vidéo et ses sous-titres (`<track>`) depuis `medias.benevol.app`, une autre origine que `www.benevol.app` : ce domaine doit répondre avec `Access-Control-Allow-Origin: https://www.benevol.app` (et les sous-domaines d'organisation si la page y est un jour servie), et les bons `Content-Type` (`video/mp4`, `text/vtt`). `make video-media-serve` envoie les mêmes en-têtes en local. L'application n'a pas de Content-Security-Policy aujourd'hui : rien à y ajouter pour ce domaine.

## Sentry (optionnel)

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | DSN serveur et edge (`sentry.server.config.ts`, `sentry.edge.config.ts`) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN navigateur (`src/lib/sentry-client-init.ts`). Argument de build Docker |
| `SENTRY_AUTH_TOKEN` | Upload des source maps au build. Secret de build Docker (`sentry_auth_token`) |

Le client Sentry ignore les erreurs des scripts injectés par les navigateurs et les extensions (`__firefox__` des navigateurs iOS, `DarkReader`, `window.ethereum`, `MetaMask`), le rejet « Object Not Found Matching Id:…, MethodName:…, ParamCount:… » des analyseurs de liens de Microsoft (Outlook Safe Links, Defender), qui ouvrent les liens personnels des emails, et les erreurs des URLs `app://` et `inpage.js`. La liste est `BROWSER_NOISE_ERRORS` (`src/lib/sentry-scrub.ts`). Il écarte aussi les rejets de promesse dont la raison est un événement DOM sans pile (« Event `Event` (type=error) captured as promise rejection », vus depuis des clients automatisés), par `beforeSendClient`. Côté serveur, il ignore « The destination stream closed early » (client déconnecté pendant un flux).

Données envoyées à Sentry (navigateur, serveur et edge) :

- Sentry n'est actif que dans les builds de production (`enabled: NODE_ENV === "production"`). Le développement local et les tests E2E, qui chargent le vrai DSN depuis `.env`, n'envoient rien.
- `dataCollection: NO_PII_DATA_COLLECTION` (`src/lib/sentry-scrub.ts`) : ni informations utilisateur, ni cookies, ni en-têtes, ni corps de requête, ni paramètres d'URL, ni données de requêtes SQL, ni variables locales. `includeLocalVariables` est aussi désactivé côté serveur.
- `src/lib/sentry-scrub.ts` masque les jetons d'accès dans les URLs (`/my/<jeton>`, `/leader/<jeton>`, `/waitlist/<jeton>/confirm`, `/api/public/registrations/<jeton>`, `/api/public/member-invite/<jeton>`, `/api/public/leader/<jeton>`, et les paramètres `token` et `t`) avant l'envoi des événements, transactions, spans et fils d'Ariane. Les enregistrements de session (Session Replay : 10 % des sessions, 100 % de celles avec erreur) ne concernent que l'espace d'administration (`/admin`, `/super-admin`) ; ils masquent tous les textes et les médias, et leurs URLs ne sont pas nettoyées par ce module.
- Navigateur (`src/lib/sentry-client-policy.ts`) : les erreurs sont envoyées depuis toutes les pages ; les traces de performance (10 %) seulement depuis l'espace d'administration ; aucune session de suivi de version (`BrowserSession`). Une page publique sans erreur n'envoie donc rien à `/monitoring`.
- Le SDK navigateur se charge quand la page est inactive, ou dès la première erreur (`src/lib/sentry-client-loader.ts`) ; les erreurs survenues avant sont conservées puis envoyées.
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
