# Déploiement

Trois modes : développement local, Docker Compose, Kubernetes. Les variables d'environnement sont décrites dans [configuration.md](configuration.md).

## Développement local

```bash
make dev-setup   # .env, npm install, postgres + mailpit, migrations, seed
make dev
```

`docker-compose.dev.yml` fournit PostgreSQL et Mailpit (capture des emails sur http://localhost:8025). Voir le [README](../README.md) pour les comptes de démonstration.

## Image Docker

Le `Dockerfile` est multi-étapes (`node:26-alpine`) :

1. `deps` : `npm ci`
2. `prisma-cli` : installe la CLI Prisma pour les migrations à l'exécution
3. `builder` : `prisma generate` puis `npm run build`. `DATABASE_URL` et `AUTH_SECRET` reçoivent des valeurs factices pendant le build. `NEXT_PUBLIC_SENTRY_DSN` et `GIT_SHA` (affiché sur la page Santé du service) sont des arguments de build, `SENTRY_AUTH_TOKEN` un secret de build (`sentry_auth_token`)
4. `runner` : sortie `standalone` de Next.js, utilisateur non root, port 3000. Copie aussi `prisma/`, `prisma.config.ts` et les sources des pages de contenu (`GUIDE_ADMIN.md`, `FEATURES.md`, `ACCESSIBILITE.md`) et les pages de documentation (`guide/`), lues à la requête, ainsi que `doc-lastmod.json` (`{}` si le build ne l'a pas reçu) : toute nouvelle page de contenu s'ajoute au `Dockerfile`

Au démarrage, `docker-entrypoint.sh` attend PostgreSQL, exécute `prisma migrate deploy` sauf si `MIGRATE_ON_START=false`, puis lance `node server.js` et, en arrière-plan, le préchauffage de ses pages publiques (voir [Préchauffage avant la mise en service](#préchauffage-avant-la-mise-en-service)). Avec Docker Compose, les migrations s'appliquent donc au démarrage de l'application. Sur Kubernetes, les pods de l'application ont `MIGRATE_ON_START=false` : c'est le Job de migration qui les applique, une seule fois par déploiement (voir ci-dessous).

## Docker Compose

```bash
export AUTH_SECRET="$(openssl rand -base64 48)"
export TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # à conserver : voir « Mise à jour depuis 1.x »
docker compose up -d
```

`docker-compose.yml` lance PostgreSQL 16 et l'application (`build: .`) sur le port 3000. Ce qu'il ne fait pas :

- Il ne transmet pas `AUTH_URL`, `AUTH_TRUST_HOST`, `CRON_SECRET`, `EMAIL_REPLY_TO`, `APP_TIME_ZONE`, `TRUSTED_PROXY_HOPS`, `TOKEN_ENCRYPTION_KEY_ID`, `TOKEN_ENCRYPTION_PREVIOUS_KEYS` ni les variables VAPID et Sentry : à ajouter dans la section `environment` si nécessaire.
- Sans `AUTH_SECRET` exporté, il démarre sans erreur avec la valeur connue `change-me-in-production-32chars` : toujours l'exporter.
- Il n'inclut aucun planificateur. Sans `CRON_SECRET`, les endpoints `/api/cron/*` refusent toute requête en production : ajouter ce secret et appeler les endpoints depuis un cron de l'hôte (voir [Tâches planifiées](../README.md#tâches-planifiées-cron) dans le README).
- Il n'exécute pas le seed, et l'image ne contient pas `tsx` : lancer le seed depuis un checkout, sur l'hôte, avec les variables `ADMIN_*` et `ORG_ADMIN_*` pour créer les premiers comptes :

  ```bash
  DATABASE_URL=postgresql://benevoles:benevoles@localhost:5432/benevoles \
  ADMIN_EMAIL=… ADMIN_PASSWORD=… ORG_ADMIN_EMAIL=… ORG_ADMIN_PASSWORD=… npm run db:seed
  ```

- Les identifiants PostgreSQL du fichier sont ceux du développement : les changer. PostgreSQL est publié sur le port 5432 de l'hôte, comme la stack de développement : les deux ne tournent pas ensemble, et le port est exposé.

## Kubernetes

Manifestes dans `k8s/`, namespace `benevoles` :

| Fichier | Objets | Appliqué par `deploy.yml` | Contenu |
|---------|--------|---------------------------|---------|
| `namespace.yaml` | Namespace `benevoles` | oui | |
| `secret.yaml` | Secret `benevoles-secret` | non | Modèle incomplet ; le secret réel est régénéré par le workflow (voir [configuration.md](configuration.md#secrets-kubernetes)) |
| `postgres.yaml` | PVC `postgres-pvc` (5 Gi), Deployment et Service `postgres` | oui | PostgreSQL 16 |
| `job-migrate.yaml` | Job `benevoles-migrate` | oui, avant l'application | `prisma migrate deploy` avec l'image déployée ; `backoffLimit: 0`, 300 s au plus |
| `deployment.yaml` | Deployment `benevoles-app` | oui, en dernier | 1 réplica, mise à jour progressive sans indisponibilité, secret injecté avec `envFrom`, limites 500m CPU et 512 Mi, sonde de disponibilité sur `/api/health/ready` (après le préchauffage), sonde de vie sur `/api/health` |
| `service.yaml`, `ingress.yaml` | Service et Ingress `benevoles-app` | oui | Exposition via Traefik pour `*.benevol.app`, `benevol.app` et `www.benevol.app`, TLS `benevol-app-wildcard-tls`, avec les middlewares de compression de `middleware-compress.yaml` |
| `middleware-compress.yaml` | Middlewares `benevoles-compress` et `benevoles-identity-upstream` | oui, avant `ingress.yaml` | Compression des réponses texte par Traefik (zstd, Brotli ou gzip selon le navigateur) ; l'application reçoit la requête sans `Accept-Encoding` et répond donc sans compression, ce que Traefik exige pour compresser. Voir « Compression » ci-dessous |
| `ingressroute-tokens.yaml` | IngressRoute `benevoles-app-tokens` et `benevoles-app-tokens-http`, Middleware `benevoles-https-redirect` | oui | Routeur prioritaire, **sans journal d'accès**, pour les requêtes qui portent un jeton personnel (chemins `/my/`, `/leader/`… et requêtes `token`, `t`) et la recherche admin, en HTTPS et en HTTP (redirigé). Un jeton ne doit jamais être journalisé ; limité à benevol.app, le Traefik partagé n'est pas modifié. Toute nouvelle route à jeton s'y ajoute (vérifié par `no-tokens-in-access-logs.test.ts`) |
| `ingressroute-http.yaml` | IngressRoute `benevoles-app-http` | oui | Route de dernière priorité sur l'entrée `web` : toute adresse `http://` de benevol.app (apex et sous-domaines) est redirigée de façon permanente vers `https://`, avec le Middleware de `ingressroute-tokens.yaml` (à appliquer avant). Sans elle, Traefik répondait « 404 page not found » |
| `traefik-config.yaml` | HelmChartConfig `traefik` (`kube-system`) | non | Réglage du Traefik fourni par k3s : `externalTrafficPolicy: Local` pour conserver l'adresse réelle des visiteurs (voir ci-dessous), journaux d'accès activés, délais de lecture et d'écriture de 30 min sur `web` et `websecure` |
| `certificate-wildcard.yaml` | Certificate `benevol-app-wildcard` | non | Certificat wildcard (cert-manager, `ClusterIssuer` `letsencrypt-prod`, hors dépôt) |
| `gandi-webhook.yaml` | Deployment `cert-manager-webhook-gandi`, APIService `v1alpha1.acme.bwolf.me`… (`cert-manager`) | non | Webhook DNS Gandi pour la validation DNS-01 du certificat wildcard ; lit le secret `gandi-api-key` |
| `cronjob-reminders.yaml` | CronJob `app-reminders` | oui | Rappels, toutes les heures |
| `cronjob-cleanup.yaml` | CronJob `app-cleanup` | oui | Purge RGPD, 02:00 UTC |
| `cronjob-release-check.yaml` | CronJob `app-release-check` | oui | Vérification de nouvelle version GitHub (#612), 03:00 UTC ; sans effet ici, `benevol.app` est déployé depuis `main` |
| `cronjob-backup.yaml` | PVC `backup-pvc` (5 Gi), CronJob `postgres-backup` | oui | `pg_dump` chiffré (AES-256), 01:00 UTC, rétention 30 jours |
| `cronjob-backup-offsite.yaml` | CronJob `backup-offsite` | oui | Copie des fichiers déjà chiffrés hors site (`rclone`), 01:30 UTC, rétention 90 jours chez le fournisseur ; vers Infomaniak Swiss Backup (#524) ; demande le secret `rclone-config` et la clé `OFFSITE_BUCKET` de `benevoles-secret` |
| `log-rotation.md` | | | Rotation des journaux du nœud : procédure manuelle, la durée de 90 jours n'est pas encore garantie |

### Adresse des visiteurs et limites de débit

Les limites de débit (inscription, lien personnel, invitation, mot de passe oublié…) comptent les requêtes par adresse de visiteur, lue dans `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, 1 par défaut). Avec le réglage par défaut de k3s (`externalTrafficPolicy: Cluster`), le répartiteur de charge interne remplace l'adresse de chaque visiteur par celle du nœud (`10.42.0.1`) : toutes les limites deviennent alors un seul compteur partagé par tout le monde, et une heure chargée bloque tous les visiteurs. `traefik-config.yaml` règle `externalTrafficPolicy: Local` ; sur ce cluster à un seul nœud, cela n'a pas d'inconvénient. Ce Traefik sert aussi les autres sites du cluster.

Vérifier après application :

```bash
kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'   # Local
```

Dans la table `RateLimit`, les clés doivent ensuite contenir des adresses publiques, plus `10.42.0.1`.

### Compression

- **Compression** : Traefik compresse les réponses texte (HTML, charges RSC, CSS, JavaScript, JSON, XML, SVG, CSV, agendas) avec le meilleur encodage proposé par le navigateur, dans l'ordre zstd, Brotli, gzip quand il n'indique pas de préférence (`encodings`, Traefik 3.2 ou plus ; 3.6.10 en production), via `k8s/middleware-compress.yaml`. L'application ne compresse qu'en gzip et Traefik ne recompresse jamais une réponse déjà compressée : le second middleware retire `Accept-Encoding` de la requête transmise à l'application, après que le premier l'a lu. Sans Traefik (Docker Compose), l'application garde son gzip. Vérifier après application : `curl -sI -H 'Accept-Encoding: br' https://www.benevol.app/doc | grep -i content-encoding` doit donner `br`, et avec `Accept-Encoding: gzip, deflate, br, zstd` (Chrome), `zstd`. Un routeur qui nomme un middleware absent est désactivé par Traefik : appliquer `middleware-compress.yaml` avant `ingress.yaml` et `ingressroute-tokens.yaml`.
- `X-Powered-By` n'est plus envoyé (`poweredByHeader: false`).

### Ordre de déploiement

À chaque push sur `main`, `deploy.yml` enchaîne trois jobs et applique les migrations **avant** de mettre à jour l'application :

1. **check** : type-check, lint, tests unitaires ;
2. **build-push** : `scripts/doc-lastmod.mjs` écrit `doc-lastmod.json` (date du dernier commit de chaque source de la documentation, sur un clone complet `fetch-depth: 0`), le `lastmod` du sitemap ; puis image `ghcr.io/<dépôt>:sha-<7 premiers caractères du commit>` (et `:latest`), avec `NEXT_PUBLIC_SENTRY_DSN` et `GIT_SHA` en arguments de build et `sentry_auth_token` en secret de build ;
3. **deploy** (environnement GitHub `production`) :
   1. applique `k8s/namespace.yaml` et régénère le secret de tirage `ghcr-secret` ;
   2. s'arrête, avant de toucher au reste, si le secret GitHub `TOKEN_ENCRYPTION_KEY` est vide ;
   3. régénère `benevoles-secret` (« Sync k8s secret ») ;
   4. applique `k8s/postgres.yaml` et attend PostgreSQL (120 s au plus) ;
   5. supprime le Job de migration précédent, applique `k8s/job-migrate.yaml` avec la nouvelle image et attend sa réussite (300 s au plus). En cas d'échec, le déploiement s'arrête, la version en cours continue de servir, et les journaux du Job s'affichent dans le workflow ;
   6. applique `service.yaml`, `middleware-compress.yaml`, `ingress.yaml`, `ingressroute-tokens.yaml`, `ingressroute-http.yaml` et les cinq CronJobs ;
   7. seulement ensuite, applique `k8s/deployment.yaml` et attend la fin du remplacement (300 s au plus). Le nouveau pod démarre avant l'arrêt de l'ancien (`maxSurge: 1`, `maxUnavailable: 0`), et ne reçoit le trafic qu'une fois préchauffé.

Le workflow n'applique pas `secret.yaml` (modèle), `traefik-config.yaml`, `certificate-wildcard.yaml` ni `gandi-webhook.yaml`.

Entre la migration et la fin du remplacement, l'ancienne version du code tourne sur le nouveau schéma : chaque migration doit rester compatible avec la version précédente (règles *expand/contract* dans [CONTRIBUTING.md](../CONTRIBUTING.md), vérifiées par la CI).

### Changer un secret en production

Les secrets de production sont les secrets GitHub du dépôt (Settings → Secrets and variables → Actions, ou `gh secret set`). Ils arrivent dans l'application en trois temps, et chacun peut être vérifié :

1. **Secret GitHub** : `gh secret set NOM --repo <dépôt> --body "valeur"` (une valeur seule, sans guillemets dans la valeur, sans espace ni retour à la ligne autour). `gh secret list` montre la date de mise à jour, jamais la valeur.
2. **Secret Kubernetes `benevoles-secret`** : recopié depuis GitHub à chaque déploiement (« Sync k8s secret »). Un secret GitHub nouveau ou modifié n'agit qu'au déploiement suivant. Un nouveau secret doit aussi figurer dans la commande `kubectl create secret` de `deploy.yml`, sinon il n'est jamais recopié.
3. **Pod** : le pod lit `benevoles-secret` (`envFrom`) **à son démarrage seulement**. Un pod qui tourne garde l'ancienne valeur.

Conséquence : pour qu'un secret modifié prenne effet,

- un push sur `main` suffit (nouvelle image `sha-…`, donc nouveau pod) ;
- relancer un déploiement du **même** commit (`gh run rerun <id>`) recopie le secret mais ne redémarre pas le pod (même image, spécification inchangée). Il faut alors redémarrer le pod après la relance :

```bash
kubectl -n benevoles rollout restart deployment/benevoles-app
kubectl -n benevoles rollout status deployment/benevoles-app --timeout=300s
```

`deploy.yml` ne se lance pas à la main (pas de `workflow_dispatch`) : seulement par un push sur `main` ou par la relance d'une exécution existante.

Vérifications, sans afficher les valeurs (sous zsh, les crochets doivent rester entre guillemets) :

```bash
# Version déployée : sha-<commit> attendu
kubectl -n benevoles get deploy benevoles-app -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
# Pods, image et heure de démarrage
kubectl -n benevoles get pods -l app=benevoles-app -o 'custom-columns=POD:.metadata.name,IMAGE:.spec.containers[0].image,START:.status.startTime'
# Valeur vue par le pod : seulement le début d'une URL, ou le domaine d'une adresse email
kubectl -n benevoles exec deploy/benevoles-app -- sh -c 'printf "%s\n" "$NTFY_URL" | cut -c1-30'
kubectl -n benevoles exec deploy/benevoles-app -- sh -c 'printf "%s\n" "${OPERATOR_ALERT_EMAIL#*@}"'
```

**Valeur invalide** : `src/lib/env.ts` vérifie les variables au démarrage. Une valeur refusée (par exemple une clé de chiffrement de la mauvaise taille) empêche le nouveau pod de démarrer : ses journaux disent « Variables d'environnement manquantes ou invalides » et nomment la variable, le pod redémarre en boucle (`CrashLoopBackOff`). L'ancien pod continue de servir le site (`maxUnavailable: 0`), et le déploiement échoue à « Wait for rollout » au bout de 300 s. Corriger le secret GitHub, puis relancer le déploiement : le pod en échec relit le secret à son prochain redémarrage. Comme l'attente entre deux redémarrages s'allonge, le déploiement peut encore se dire en échec alors que le pod finit par démarrer : vérifier l'image et l'état des pods plutôt que le seul statut du workflow. Les réglages facultatifs des alertes (`NTFY_URL`, `OPERATOR_ALERT_EMAIL`) ne bloquent jamais le démarrage : une valeur invalide est signalée à Sentry et ignorée.

### Mise en place manuelle

Même ordre que `deploy.yml`, sans quoi une nouvelle version pourrait démarrer sur un schéma pas encore migré :

```bash
IMAGE=ghcr.io/pvollenweider/benevoles:sha-<7 premiers caractères du commit>

# 0. Prérequis hors dépôt : k3s avec Traefik 3.1 ou plus récent, cert-manager, ClusterIssuer
#    letsencrypt-prod qui utilise le webhook Gandi (k8s/gandi-webhook.yaml, secret gandi-api-key
#    dans cert-manager). Une fois par cluster, voir « Mise à jour depuis 1.x », étape 5 :
kubectl apply -f k8s/traefik-config.yaml

# 1. Namespace et secrets (secret.yaml est un modèle incomplet : remplacer les valeurs et ajouter
#    les clés qui manquent, voir configuration.md « Secrets Kubernetes »)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl -n benevoles create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io --docker-username=<utilisateur> --docker-password=<jeton read:packages>
kubectl -n benevoles create secret generic rclone-config \
  --from-file=rclone.conf=$HOME/.config/rclone/rclone.conf

# 2. PostgreSQL, puis attendre qu'il soit prêt
kubectl apply -f k8s/postgres.yaml
kubectl -n benevoles rollout status deploy/postgres

# 3. Migrations avec la nouvelle image, et attendre leur réussite
kubectl -n benevoles delete job benevoles-migrate --ignore-not-found --wait=true
APP_IMAGE=$IMAGE envsubst < k8s/job-migrate.yaml | kubectl apply -f -
kubectl -n benevoles wait --for=condition=complete job/benevoles-migrate --timeout=300s
kubectl -n benevoles logs job/benevoles-migrate

# 4. Exposition et tâches planifiées
kubectl apply -f k8s/service.yaml -f k8s/middleware-compress.yaml -f k8s/ingress.yaml -f k8s/ingressroute-tokens.yaml -f k8s/ingressroute-http.yaml -f k8s/certificate-wildcard.yaml
kubectl apply -f k8s/cronjob-reminders.yaml -f k8s/cronjob-cleanup.yaml -f k8s/cronjob-release-check.yaml -f k8s/cronjob-backup.yaml -f k8s/cronjob-backup-offsite.yaml

# 5. Seulement ensuite, l'application
APP_IMAGE=$IMAGE envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl -n benevoles rollout status deploy/benevoles-app
```

Si l'étape 3 échoue, ne pas passer à la suite : lire les journaux du Job, corriger, relancer. Un Job en échec ne remplit jamais la condition `complete` : `kubectl wait` ne rend la main qu'à l'expiration du délai (300 s, comme `activeDeadlineSeconds`), et `kubectl -n benevoles logs job/benevoles-migrate` peut être lu sans attendre.

Points d'attention :

- Le secret `benevoles-secret` réel n'est pas appliqué depuis `k8s/secret.yaml` (simple modèle) : l'étape « Sync k8s secret » de `deploy.yml` le régénère à chaque déploiement à partir des secrets GitHub (clés et origines : [configuration.md](configuration.md#secrets-kubernetes)). Une clé qu'il gère, modifiée à la main, est écrasée ; une clé qu'il ne gère pas, comme `BACKUP_PASSPHRASE`, est conservée. Le DSN navigateur, lui, est injecté au build.
- La sonde `readiness` interroge `/api/health/ready` (503 pendant le préchauffage, puis une requête `SELECT 1`) toutes les 5 s, avec un délai de 3 s ; la sonde `liveness` interroge `/api/health` (une requête `SELECT 1`) toutes les 30 s, avec un délai de 5 s.

### Préchauffage avant la mise en service

Les pages sont rendues à chaque requête : sur un serveur qui vient de démarrer, la première visite de chaque page paie le chargement et la compilation de son code et le remplissage des caches internes. Pour qu'elle ne tombe pas sur un visiteur juste après un déploiement, `docker-entrypoint.sh` lance, à côté de `node server.js`, le script `scripts/warmup.mjs` (Node seul, sans dépendance) :

1. il demande `http://127.0.0.1:$PORT/sitemap.xml` avec l'en-tête `Host` du site (celui de `NEXT_PUBLIC_APP_URL`, `www.benevol.app` en production), en réessayant tant que le serveur ne répond pas ;
2. il en garde les pages du site lui-même, accueil en tête : fonctionnalités, nouveautés, accessibilité, pages légales, documentation et chacune de ses fiches, bibliothèque et pages des vidéos. Jamais une page d'administration, une route d'API, une page à lien personnel ni une adresse avec paramètres. Sitemap vide (hôte de préproduction) ou illisible : l'accueil seul ;
3. il les demande 4 à la fois, 15 s au plus par page et 60 s au total, avec l'agent `benevoles-warmup/1` ; chaque page et un bilan sont écrits dans les journaux du conteneur (`[warmup] …`). Une erreur est journalisée puis ignorée : le préchauffage ne fait jamais échouer le conteneur.

Ces requêtes passent par `localhost`, pas par Traefik : elles n'apparaissent pas dans ses journaux d'accès. Les pages préchauffées n'écrivent rien, n'envoient aucun email et ne comptent aucune visite.

Quand le script se termine, échoue ou atteint sa limite, l'entrée écrit le fichier `/tmp/benevoles-ready` (`WARMUP_READY_FILE`). `/api/health/ready` répond 503 tant qu'il n'existe pas, puis vérifie la base comme `/api/health`. Pendant ce temps, l'ancien pod garde tout le trafic (`maxUnavailable: 0`) ; la sonde de vie, elle, reste sur `/api/health` et ne dépend pas du préchauffage, qui ne peut donc pas faire redémarrer le pod. Au pire, un pod est disponible un peu plus d'une minute après son démarrage, loin des 300 s qu'attend `deploy.yml`.

| Variable | Défaut | Rôle |
|----------|--------|------|
| `WARMUP` | `true` | `false` : pas de préchauffage, le pod est disponible dès le démarrage du serveur |
| `WARMUP_TIMEOUT_MS` | `60000` | Durée totale maximale, attente du serveur comprise |
| `WARMUP_REQUEST_TIMEOUT_MS` | `15000` | Délai par page |
| `WARMUP_CONCURRENCY` | `4` | Pages demandées en parallèle |
| `WARMUP_READY_FILE` | `/tmp/benevoles-ready` | Fichier qui marque la fin du préchauffage |

Avec Docker Compose, le préchauffage tourne de la même façon (sur l'hôte de `NEXT_PUBLIC_APP_URL`, `localhost` par défaut) ; rien n'attend `/api/health/ready`, le serveur répond dès son démarrage. Le préchauffage ne se lance que pour la commande `node server.js` : le Job de migration, qui utilise la même image, n'est pas concerné.
- Les cron jobs de rappels et de purge lisent `NEXT_PUBLIC_APP_URL` et `CRON_SECRET` dans `benevoles-secret`.

## Mise à jour depuis 1.x

La version 2.0 ne se met pas à jour sans préparation :

- `TOKEN_ENCRYPTION_KEY` est **obligatoire en production** : sans elle, le serveur refuse de démarrer. Une clé mal formée, ou une valeur invalide de `APP_TIME_ZONE`, bloque aussi le démarrage.
- Sur Kubernetes, les pods de l'application ne migrent plus la base au démarrage (`MIGRATE_ON_START=false`) : les migrations passent par le Job `k8s/job-migrate.yaml`, **avant** la mise à jour du Deployment.
- Deux nouveaux manifestes : `k8s/ingressroute-tokens.yaml` (liens personnels exclus des journaux d'accès) et `k8s/traefik-config.yaml` (adresse réelle des visiteurs).

### 1. Sauvegarder

Cette sauvegarde est le seul retour arrière possible (étape 9).

```bash
# Kubernetes
kubectl -n benevoles create job --from=cronjob/postgres-backup backup-avant-2-0
kubectl -n benevoles wait --for=condition=complete job/backup-avant-2-0 --timeout=600s

# Docker Compose
docker compose exec -T postgres pg_dump -U benevoles benevoles | gzip > benevoles-avant-2.0.sql.gz
```

### 2. Vérifier que les migrations passeront

Deux migrations s'arrêtent sur des données qu'elles ne savent pas traiter. Chacune de ces requêtes doit renvoyer 0 ligne :

```sql
-- Emails qui ne diffèrent que par la casse ou des espaces : fusionner les fiches d'abord
SELECT "organizationId", lower(trim(email)) FROM "Volunteer" WHERE email IS NOT NULL AND "organizationId" IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;
SELECT lower(trim(email)) FROM "AdminUser" GROUP BY 1 HAVING count(*) > 1;
SELECT "eventId", "roleName", lower(trim(email)) FROM "SectorLeader" GROUP BY 1, 2, 3 HAVING count(*) > 1;
-- Valeurs de statut hors liste
SELECT id, status FROM "Registration" WHERE status NOT IN ('active', 'waiting', 'offered', 'cancelled', 'deleted');
SELECT id, source FROM "Registration" WHERE source NOT IN ('public_form', 'admin_manual');
SELECT id, status FROM "Shift" WHERE status NOT IN ('open', 'full', 'closed', 'cancelled');
SELECT id, "publicStatus" FROM "Event" WHERE "publicStatus" NOT IN ('draft', 'published', 'archived');
SELECT id, role FROM "AdminUser" WHERE role NOT IN ('admin', 'super_admin');
```

La recherche sans accents demande l'extension PostgreSQL `unaccent` (`CREATE EXTENSION IF NOT EXISTS unaccent`) : l'utilisateur de la base doit avoir le droit de la créer. Les images officielles `postgres` la fournissent.

### 3. Générer la clé et la conserver

```bash
openssl rand -base64 32
```

La ranger **d'abord** dans un gestionnaire de mots de passe, hors du serveur et hors du dépôt. Perdue, elle ne casse pas les liens déjà envoyés (ils sont reconnus par leur empreinte), mais l'application ne peut plus les renvoyer : rappels, « renvoyer le lien », notifications aux responsables. Pour la changer plus tard, suivre [Rotation de la clé de chiffrement](configuration.md#rotation-de-la-clé-de-chiffrement). `TOKEN_ENCRYPTION_KEY_ID` et `TOKEN_ENCRYPTION_PREVIOUS_KEYS` ne servent qu'aux rotations : les laisser vides.

### 4. Installer la clé

- **Avec `deploy.yml`** : `gh secret set TOKEN_ENCRYPTION_KEY`. Le workflow s'arrête avant de toucher au cluster si ce secret manque, et il régénère `benevoles-secret` à chaque déploiement : une modification manuelle d'une clé qu'il gère serait écrasée (liste des clés : [configuration.md](configuration.md#secrets-kubernetes)).
- **Kubernetes à la main** : ajouter `TOKEN_ENCRYPTION_KEY` dans `benevoles-secret` (modèle : `k8s/secret.yaml`). Vérifier aussi que ce secret contient `CRON_SECRET` et `NEXT_PUBLIC_APP_URL` : les CronJobs de sauvegarde les lisent, et sans eux leur pod ne démarre pas.
- **Docker Compose** : `TOKEN_ENCRYPTION_KEY` dans le fichier `.env` à côté de `docker-compose.yml`, et `CRON_SECRET` dans la section `environment` : sans lui, la tâche de nettoyage est refusée et les anciens liens ne sont jamais chiffrés.

### 5. Kubernetes

Avec `deploy.yml`, un push sur `main` applique tout dans le bon ordre. À la main, suivre [Mise en place manuelle](#mise-en-place-manuelle) : migrations d'abord, et ne pas continuer si le Job échoue (`backoffLimit: 0`).

`k8s/traefik-config.yaml` n'est **pas** appliqué par `deploy.yml` : il règle le Traefik de k3s partagé par tous les sites du cluster (`kube-system`) : adresse réelle des visiteurs, journaux d'accès, délais de lecture et d'écriture de 30 min. Un `HelmChartConfig` `traefik` existant serait remplacé : fusionner d'abord ses réglages. À appliquer une fois :

```bash
kubectl apply -f k8s/traefik-config.yaml
kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'   # Local
```

`ingressroute-tokens.yaml` demande Traefik 3.1 ou plus récent, et ses domaines (`benevol.app`) et son secret TLS sont écrits en dur, comme les domaines de `ingressroute-http.yaml` : les adapter pour un autre domaine.

**Pendant le remplacement du pod**, le code 1.x tourne sur le schéma 2.0 et ne peut plus créer d'inscription, de responsable de secteur ni d'invitation (nouvelle colonne obligatoire qu'il ne remplit pas). Déployer hors période d'inscriptions, ou passer ponctuellement la `strategy` du Deployment à `Recreate` (courte coupure au lieu d'erreurs).

### 6. Docker Compose

```bash
git pull
docker compose up -d --build
docker compose logs -f app   # « ✓ Migrations appliquées », puis démarrage du serveur
```

Avec Compose, les migrations tournent au démarrage du conteneur (`MIGRATE_ON_START` vaut `true` par défaut).

### 7. Vérifier

- Journaux de l'application : sur Kubernetes, « ↷ Migrations ignorées (MIGRATE_ON_START=false…) », et aucune erreur `TOKEN_ENCRYPTION_KEY` ni `APP_TIME_ZONE`.
- `/api/health` répond `200`.
- Page **Santé du service** (super admin) : « Migrations de la base » sans migration en attente, « Chiffrement des liens personnels » à « Configuré. », et le lendemain « Nettoyage nocturne » à jour.

### 8. Liens des bénévoles existants

Aucun lien envoyé n'est cassé : la migration calcule l'empreinte de chaque lien existant. Les nouveaux liens sont chiffrés dès la mise en service ; les anciens le sont au passage suivant de la tâche de nettoyage (02:00 UTC), par lots. Pour le lancer tout de suite :

```bash
# Kubernetes
kubectl -n benevoles create job --from=cronjob/app-cleanup cleanup-manuel
kubectl -n benevoles logs -f job/cleanup-manuel

# Docker Compose
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup
```

Ce passage fait aussi la purge habituelle des données arrivées en fin de durée de conservation.

### 9. Retour arrière

Revenir à une image 1.x sur une base migrée ne fonctionne pas : le code 1.x ne peut plus créer d'inscription, et il ne retrouve pas les liens chiffrés. Le seul retour arrière est la restauration de la sauvegarde de l'étape 1, en perdant ce qui a été saisi depuis.

## Référencement et aperçus de liens

Les adresses absolues des pages (canonique, Open Graph, données structurées, sitemaps) viennent de
`NEXT_PUBLIC_APP_URL`, lue à chaque requête : l'image est construite sans elle, et aucune page n'est
générée au build (`connection()` dans `src/app/layout.tsx`). Elle doit donc être définie dans
l'environnement du conteneur, pas comme argument de build.

Le domaine principal sert :

- `/robots.txt` : moteurs de recherche et assistants IA autorisés sur les pages publiques
  (`src/lib/crawlers.ts`), zones privées exclues, et l'adresse de l'index des sitemaps ;
- `/sitemap-index.xml` : le sitemap de `www` (accueil, fonctionnalités, documentation, pages
  légales), puis celui de chaque organisation active (`<slug>.benevol.app/sitemap.xml`) ;
- `/llms.txt` et `/llms-full.txt` : le site résumé pour les assistants IA ;
- `/og-image.png/<chemin>` : l'image d'aperçu de chaque page publique.

Une fois, après le premier déploiement qui les contient :

1. **Google Search Console**, propriété de domaine `benevol.app` (elle couvre `www` et tous les
   sous-domaines) : **Sitemaps**, soumettre `https://www.benevol.app/sitemap-index.xml`. Les
   sitemaps des organisations, sur d'autres sous-domaines, sont acceptés parce que la propriété de
   domaine les couvre. L'ancien `sitemap.xml` soumis peut rester.
2. **Bing Webmaster Tools** (son index sert aussi à d'autres moteurs, dont DuckDuckGo) : importer
   le site depuis la Search Console, ou vérifier `benevol.app` par DNS, puis soumettre le même index.
3. Vérifier un aperçu : l'outil d'inspection d'URL de la Search Console, le
   [Rich Results Test](https://search.google.com/test/rich-results) sur une fiche (`TechArticle`,
   `BreadcrumbList`) et le [Sharing Debugger](https://developers.facebook.com/tools/debug/) de Meta
   sur `/doc` (image, titre, description, adresse en `https://www.benevol.app`). Ce dernier vide aussi
   le cache des aperçus déjà partagés avec l'ancienne adresse `localhost`.

## Serveur de médias (vidéos)

`k8s/media.yaml` sert les tutoriels vidéo sur `https://medias.benevol.app` : un nginx, un volume
`local-path` de 2 Go, un Service et un Ingress de priorité Traefik 200, au-dessus de la règle joker
de `k8s/ingress.yaml` (100) pour que ce sous-domaine n'atteigne jamais l'application. Le TLS vient du
certificat joker existant. Il n'est pas appliqué par le workflow de déploiement :

```bash
kubectl apply -f k8s/media.yaml
kubectl -n benevoles rollout status deploy/benevoles-media
```

Les fichiers s'envoient depuis un poste qui a les rendus (`videos/output`) avec
`make video-publish KUBE_CONTEXT=<contexte> APPLY=1` (voir `videos/README.md`). Le volume ne contient
aucune donnée personnelle et n'est pas sauvegardé : les vidéos se régénèrent depuis les sources.
`medias` est réservé et ne peut pas devenir le slug d'une organisation.

## Webhook DNS Gandi

`gandi-webhook/` est un programme Go (`main.go`, `gandiclient.go`) construit par son propre `Dockerfile`. Il implémente le webhook cert-manager qui crée les enregistrements DNS-01 chez Gandi, nécessaire au certificat wildcard.

Le workflow `gandi-webhook.yml` construit l'image à chaque pull request touchant `gandi-webhook/` (sans la publier) et la publie sur GHCR (`:latest` et `:<sha du commit>`) à chaque push sur `main`. Le déploiement Kubernetes de ce webhook n'est pas appliqué par `deploy.yml` : il se met à jour à la main.

Le manifeste `k8s/gandi-webhook.yaml` référence le tag du commit et non `:latest`, avec `imagePullPolicy: IfNotPresent` : avec `:latest`, un redémarrage réutiliserait l'image en cache sur le nœud et ne chargerait jamais la nouvelle. Pour mettre à jour après un changement de `gandi-webhook/` :

```bash
# 1. Attendre la fin du workflow « Build Gandi Webhook » sur main, puis :
SHA=$(git rev-parse origin/main)
kubectl -n cert-manager set image deploy/cert-manager-webhook-gandi \
  cert-manager-webhook-gandi=ghcr.io/pvollenweider/benevoles/gandi-webhook:$SHA
kubectl -n cert-manager rollout status deploy/cert-manager-webhook-gandi
kubectl get apiservice v1alpha1.acme.bwolf.me   # AVAILABLE doit être True
# 2. Reporter le tag dans k8s/gandi-webhook.yaml (image:) et commiter.
```

Retour arrière : `set image` avec l'empreinte de l'image précédente (`kubectl -n cert-manager get pod <pod> -o jsonpath='{.status.containerStatuses[0].imageID}'`, à noter avant la mise à jour). Le renouvellement du certificat wildcard (visible avec `kubectl -n benevoles get certificate benevol-app-wildcard`) est le seul test réel du webhook contre l'API Gandi.

## Alertes à l'opérateur

L'opérateur de l'instance est prévenu par une notification ntfy sur son téléphone et par un email (#810, `src/lib/operator-alerts.ts`) :

| Alerte | Quand | Priorité ntfy |
|---|---|---|
| « Nouvelle demande d'espace » | une association confirme son inscription en libre-service ; le message reprend le nom de l'espace et le début de sa description, sans lien | 4 |
| « plafond d'envoi atteint » | un plafond d'envoi d'emails est atteint (au plus une fois par heure, par plafond et par organisation) | 4 |
| « espaces en attente » | récapitulatif quotidien, tant que des espaces attendent une validation (cron de nettoyage) | 3 |

**Deux canaux, de rôles différents.** La notification ntfy prévient vite ; l'email est la garantie (iOS peut retenir une notification plusieurs minutes, et ntfy.sh peut ne pas répondre). Les deux partent en même temps : l'email n'attend jamais la notification. La notification est tentée trois fois (tout de suite, après 2 s, puis après 10 s) en cas de coupure réseau, de réponse 429 ou d'erreur 5xx de ntfy, une seule fois si ntfy refuse la demande ; un échec final est signalé une fois à Sentry (`operator_alert.ntfy`).

**Destinataire de l'email** : `OPERATOR_ALERT_EMAIL` si elle est définie, sinon chaque super admin actif à son adresse de connexion. L'adresse de connexion d'un super admin n'est pas forcément une vraie boîte : dans ce cas, définir `OPERATOR_ALERT_EMAIL`. Ce n'est pas un compte, juste un destinataire : elle peut être une adresse déjà utilisée pour se connecter ailleurs sur l'instance.

### Mise en place

1. Choisir un sujet ntfy long et aléatoire : sur ntfy.sh, le nom du sujet tient lieu de mot de passe (quiconque le connaît peut lire et écrire). Ne jamais l'écrire dans le dépôt, un ticket ou une page publique.
2. S'abonner au sujet dans l'application ntfy du téléphone, et vérifier qu'une notification de priorité 4 passe le mode « Ne pas déranger » si on le souhaite.
3. Secrets GitHub (voir « Changer un secret en production ») :

```bash
gh secret set NTFY_URL --repo <dépôt> --body "https://ntfy.sh/<sujet>"
gh secret set OPERATOR_ALERT_EMAIL --repo <dépôt> --body "operateur@exemple.org"
```

4. Déployer (push sur `main`), ou relancer le dernier déploiement puis redémarrer le pod.

### Tester

- La sortie réseau et le sujet, depuis le pod, sans passer par le code des alertes (envoie une vraie notification) :

```bash
kubectl -n benevoles exec deploy/benevoles-app -- node -e 'fetch(process.env.NTFY_URL,{method:"POST",headers:{Title:"Test depuis le pod",Priority:"4"},body:"Test"}).then(r=>console.log(r.status)).catch(e=>console.log("FAIL",e.cause?.code||e.name))'
```

- Le parcours complet : une demande sur `/inscription` avec une adresse jamais utilisée, puis « Confirmer » dans l'email reçu. La notification et l'email « Nouvelle demande d'espace » doivent arriver. Une demande confirmée avant la mise en place n'envoie rien de plus.
- En cas d'absence : `kubectl -n benevoles logs deploy/benevoles-app | grep operator_alert` montre les échecs (par exemple `ConnectTimeoutError` si ntfy.sh n'a pas répondu, ou un statut HTTP de refus).

## CI/CD

| Workflow | Déclencheur | Étapes |
|----------|-------------|--------|
| `ci.yml` | pull request vers `main` | type-check, lint, tests Vitest avec couverture, `check-security-md.mjs`, `check-migrations.mjs` (migrations compatibles avec la version précédente) ; job E2E : base migrée et seedée, tests d'intégration (`npm run test:integration`), tests Playwright |
| `deploy.yml` | push sur `main` | type-check, lint, tests ; construction et publication de l'image sur GHCR ; Job de migration, puis déploiement Kubernetes (voir « Ordre de déploiement ») |
| `gandi-webhook.yml` | pull request ou push sur `main` touchant `gandi-webhook/` | construction de l'image du webhook ; publication sur GHCR seulement sur push |

L'analyse CodeQL (JavaScript/TypeScript, Go, Actions) ne figure pas dans `.github/workflows/` : elle est configurée côté GitHub (paramètres de sécurité du dépôt).

Chaque push sur `main` déploie donc en production. Les versions sont marquées par un commit `release: vX.Y.Z` (checklist dans [CONTRIBUTING.md](../CONTRIBUTING.md#publier-une-nouvelle-version)), un tag `vX.Y.Z` et une release GitHub.

## Corriger d'anciens horaires hors plage

L'application borne les horaires à `00:00`–`23:59`. Une base créée avant la version 1.13.0 peut contenir des heures comme `24:00`, `26:00` ou `25:30` (créneaux de nuit saisis en prolongeant la journée, ou créés en faisant glisser une barre sur le planning administrateur), et même des heures négatives (`-2:-15`). L'affichage les lit modulo 24, mais il est préférable de les convertir.

La requête ci-dessous, testée sur une base locale, fait deux choses : un créneau qui commence à `24:00` ou plus passe au **jour suivant** avec l'horloge remise à zéro (vendredi `24:00`–`26:00` devient samedi `00:00`–`02:00`), et un créneau qui commence avant minuit et finit à `24:00` ou plus garde sa date avec une fin qui repart à zéro (`23:00`–`25:00` devient `23:00`–`01:00`). L'instant réel du créneau ne change pas, donc les rappels non plus. Les valeurs qui restent invalides (heures négatives) sont listées pour être corrigées à la main, ou supprimées si le créneau est annulé.

```sql
BEGIN;

UPDATE "Shift" s SET
  date = s.date + INTERVAL '1 day',
  "startTime" = lpad((split_part(s."startTime", ':', 1)::int - 24)::text, 2, '0') || ':' || split_part(s."startTime", ':', 2),
  "endTime" = CASE
    WHEN split_part(s."endTime", ':', 1)::int >= 24
    THEN lpad((split_part(s."endTime", ':', 1)::int - 24)::text, 2, '0') || ':' || split_part(s."endTime", ':', 2)
    ELSE s."endTime" END
WHERE s."startTime" ~ '^[0-9]{2}:[0-9]{2}$' AND s."endTime" ~ '^[0-9]{2}:[0-9]{2}$'
  AND split_part(s."startTime", ':', 1)::int >= 24;

UPDATE "Shift" s SET
  "endTime" = lpad((split_part(s."endTime", ':', 1)::int - 24)::text, 2, '0') || ':' || split_part(s."endTime", ':', 2)
WHERE s."startTime" ~ '^[0-9]{2}:[0-9]{2}$' AND s."endTime" ~ '^[0-9]{2}:[0-9]{2}$'
  AND split_part(s."startTime", ':', 1)::int < 24
  AND split_part(s."endTime", ':', 1)::int >= 24;

-- Ce qui reste hors format, à corriger à la main :
SELECT s.id, s.date::date AS jour, s."roleName", s."startTime", s."endTime", s.status
FROM "Shift" s
WHERE s."startTime" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR s."endTime" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

-- Vérifier, puis COMMIT; (ou ROLLBACK; pour annuler)
```

Ne la lancer qu'après avoir listé les lignes concernées avec le `SELECT` final seul, et de préférence en dehors d'un événement en cours : les créneaux déplacés changent de colonne de jour sur le planning. La sauvegarde chiffrée de la nuit (`k8s/cronjob-backup.yaml`) permet de revenir en arrière.

## Sauvegarde et restauration

`cronjob-backup.yaml` produit chaque nuit, à 01:00 UTC, un `pg_dump` chiffré avec `BACKUP_PASSPHRASE`, sur le volume `backup-pvc`, conservé 30 jours. Les fichiers s'appellent `/backups/benevoles_YYYY-MM-DD_HH-MM.sql.gz.enc`.

> **Les fichiers antérieurs au 22/09/2026 sont vides (0 octet) et ne sont pas restaurables : les ignorer.** Le script installe `openssl` au démarrage, écrit chaque étape dans un fichier, vérifie que le dump dépasse 1 Ko et re-déchiffre le fichier produit avant de le garder ; toute anomalie fait échouer le job.

Déchiffrement (commande donnée en en-tête du manifeste) :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass pass:<PASSPHRASE> \
  -in benevoles_<date>.sql.gz.enc -out dump.sql.gz && gunzip dump.sql.gz
```

**Restaurer dans la base de production ramène les données des bénévoles effacés depuis la sauvegarde (#516).** Avant la restauration, exporter le registre des effacements de la base actuelle ; après, le rejouer. Procédure complète : [rgpd/procedure-effacement.md](rgpd/procedure-effacement.md).

### `BACKUP_PASSPHRASE` est un point unique de défaillance

Elle n'existe qu'à un seul endroit : la clé `BACKUP_PASSPHRASE` du secret `benevoles-secret`, sur ce cluster. Elle n'est **pas** synchronisée depuis les secrets GitHub Actions (`deploy.yml` ne la gère pas, contrairement au reste de `benevoles-secret`) — elle a été ajoutée directement dans le cluster, à la main.

Conséquence : si le cluster est perdu **et** que personne n'a cette valeur ailleurs, la copie hors site sur Swiss Backup (voir ci-dessous) ne sert à rien : elle ne contient que du binaire chiffré, pour toujours illisible sans elle. La copie hors site protège contre « le fichier a disparu », pas contre « la clé a disparu » ; les deux protections sont indépendantes.

**À faire une fois, en dehors du cluster** : récupérer la valeur et la noter dans un gestionnaire de mots de passe (jamais dans ce dépôt, ni dans un fichier sur ce même serveur) :

```bash
kubectl -n benevoles get secret benevoles-secret -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d; echo
```

### Copie hors site

`cronjob-backup-offsite.yaml` copie chaque nuit à 01h30 UTC (30 min après le dump) les fichiers déjà chiffrés du volume `backup-pvc` hors site avec `rclone`. Comme les fichiers sont déjà chiffrés AES-256 avant d'être lus par ce job, le fournisseur ne voit jamais rien de lisible sans `BACKUP_PASSPHRASE`.

- Envoi avec `rclone copy` (upload seulement, ne touche jamais aux fichiers déjà présents chez le fournisseur) puis purge des fichiers de plus de **90 jours** avec `rclone delete --min-age`. Volontairement plus long que la rétention locale de 30 jours du PVC : le but est de pouvoir revenir à un état antérieur à une erreur découverte tard, indépendamment de ce que la rotation locale a déjà supprimé.
- Ce n'est pas un `rclone sync` : un `sync` effacerait chez le fournisseur tout fichier que le PVC a déjà purgé, ce qui viderait la copie hors site en même temps que le volume local en cas de perte du cluster — exactement le scénario que la copie hors site est censée couvrir.

**Fournisseur : Infomaniak Swiss Backup** (#524), stockage OpenStack Swift en Suisse, remote rclone `swissbackup`, container donné par `OFFSITE_BUCKET`. Jusqu'au 2026-10-05, la copie partait vers un compte Dropbox individuel (États-Unis) ; ce fournisseur est retiré du CronJob et des scripts (#697), et ses copies sont en cours de suppression.

**Mise en place du remote Swiss Backup** (à faire une fois, en local, jamais dans ce dépôt) :

1. Dans le Manager Infomaniak, créer un appareil Swiss Backup pour rclone et lui donner un mot de passe. Le Manager fournit un bloc `rclone.conf` de type `swift` (`user`, `auth = https://swiss-backup02.infomaniak.com/identity/v3`, `tenant`, `region = RegionOne`, `key = [password]`).
2. Coller ce bloc dans un fichier `rclone.conf` local, renommer sa section en `[swissbackup]` (nom attendu par le CronJob) et remplacer `[password]` par le mot de passe de l'appareil (en clair : rclone ne le chiffre pas pour Swift). Vérifier : `rclone lsd swissbackup:`.
3. Créer le container des sauvegardes : `rclone mkdir swissbackup:benevol-backups`. Son nom devient le secret GitHub `OFFSITE_BUCKET` (repris dans `benevoles-secret` au déploiement suivant, voir [configuration.md](configuration.md#secrets-kubernetes)).
4. Créer ou mettre à jour le secret `rclone-config` :

```bash
kubectl create secret generic rclone-config -n benevoles \
  --from-file=rclone.conf=$HOME/.config/rclone/rclone.conf \
  --save-config --dry-run=client -o yaml | kubectl apply -f -
```

À refaire si le mot de passe de l'appareil Swiss Backup change. Tant que ce secret n'existe pas, le CronJob échoue simplement (pod bloqué faute de volume) ; ça n'affecte pas le dump local (`cronjob-backup.yaml`), qui est un job séparé. Sans `OFFSITE_BUCKET`, le job s'arrête avant d'appeler rclone.

**`DRY_RUN`** (variable d'environnement du CronJob, `"false"` par défaut) : à `"true"`, `rclone copy` et `rclone delete` reçoivent `--dry-run` (rien n'est envoyé ni supprimé, seul l'inventaire est réel), et le job ne signale pas de réussite à la page santé. Utile pour un test manuel du nouveau remote avant de lui faire confiance (`kubectl create job --from=cronjob/backup-offsite ... ` avec la variable modifiée dans le Job généré).

**Restauration / test.** `scripts/restore-test-offsite.sh` liste le remote, télécharge le dernier fichier, le déchiffre avec `BACKUP_PASSPHRASE` et vérifie qu'il redonne un `pg_dump` gzippé valide — sans jamais rien modifier côté distant (uniquement `lsf`/`lsl`/`copy` en lecture) ni restaurer dans une base :

```bash
OFFSITE_BUCKET=<container> \
RCLONE_CONFIG=$HOME/.config/rclone/rclone.conf \
BACKUP_PASSPHRASE=<valeur du cluster> \
./scripts/restore-test-offsite.sh
```

Le script affiche à la fin la commande `curl` à lancer pour enregistrer le test sur la page de santé (voir « Checklist opérationnelle » ci-dessous) ; il ne l'envoie pas lui-même, pour qu'un essai local contre un `rclone.conf` personnel ne signale jamais un faux succès en production.

`scripts/test-offsite-backup.sh` est le test de régression (hors ligne, faux `rclone`/`wget`) du script du CronJob et du script de restauration ; voir son en-tête. `make test-offsite-backup` le lance, et `make restore-test-offsite OFFSITE_BUCKET=… BACKUP_PASSPHRASE=…` lance le test de restauration réel.

**Retrait de Dropbox (#697), côté opérateur**, une fois ce changement déployé :

1. Supprimer les anciennes copies : `rclone purge dropbox:/benevol-backups`, puis vider la corbeille Dropbox et révoquer rclone dans les applications connectées du compte Dropbox.
2. Retirer la section `[dropbox]` de `rclone.conf` et recréer le secret `rclone-config` (commande ci-dessus).
3. Si ce n'est pas déjà fait, supprimer l'ancien CronJob : `kubectl delete cronjob backup-offsite-dropbox -n benevoles`.

Restauration depuis le remote actuel : `rclone lsf <remote>:<chemin>` pour lister, `rclone copy <remote>:<chemin>/<fichier> .` pour télécharger, puis déchiffrer comme ci-dessus (ou utiliser `scripts/restore-test-offsite.sh` qui fait tout cela et vérifie le résultat).

### Limites actuelles

Le volume de sauvegarde local est sur le même cluster que la base : une panne de cluster emporte les deux, d'où la copie hors site ci-dessus.

**Surveillance.** Chaque CronJob de sauvegarde envoie un signal de vie (`/api/cron/heartbeat`) quand il réussit. La page `/super-admin/health` affiche le dernier succès de chaque tâche : rappels (signalés au-delà de 2 h sans passage), nettoyage, sauvegarde chiffrée et copie hors site (au-delà de 26 h), test de restauration (avertissement après 45 jours, erreur après 90). Une sauvegarde qui échoue sans bruit y apparaît donc le lendemain, sans consulter `kubectl`.

**Encore manuel.** Aucune alerte n'est envoyée d'elle-même (ni email ni notification) : il faut ouvrir la page de santé. Le test de restauration complète se fait à la main (voir la checklist ci-dessous) ; il envoie son propre signal de vie, que la page de santé réclame après 45 jours et passe en erreur après 90.

## Checklist opérationnelle

Ce que rien n'automatise encore (voir « Limites actuelles ») et qu'il faut donc vérifier à la main.

**Avant une mise en production** (premier déploiement ou nouveau cluster) :

- [ ] `TOKEN_ENCRYPTION_KEY` et `BACKUP_PASSPHRASE` notées dans un gestionnaire de mots de passe, hors du cluster et hors de ce dépôt ;
- [ ] secret `rclone-config` et clé `OFFSITE_BUCKET` créés, et une première copie Swiss Backup constatée le lendemain ;
- [ ] le Job de migration a réussi (`kubectl -n benevoles logs job/benevoles-migrate`) ;
- [ ] `/super-admin/health` (connecté en super admin) est tout vert : base, file d'emails, rappels, nettoyage, sauvegarde, copie hors site, migrations, configuration (sur un cluster neuf, le nettoyage et les sauvegardes restent « Jamais exécuté » jusqu'à leur première nuit, et le test de restauration en avertissement jusqu'au premier test) ;
- [ ] `/api/health` répond `200` ;
- [ ] un appel manuel de `/api/cron/reminders` et `/api/cron/cleanup` avec `CRON_SECRET` répond `200`.

**Chaque mois** :

- [ ] les derniers CronJobs de sauvegarde ont réussi : `kubectl -n benevoles get jobs` (dump et copie hors site) ;
- [ ] le dernier fichier sur `backup-pvc` et sur Swiss Backup a une taille plausible (pas 0 octet) ;
- [ ] **test de restauration** : télécharger un dump, le déchiffrer et le charger dans une base PostgreSQL jetable (`psql -f dump.sql`), puis vérifier quelques comptages (organisations, événements, inscriptions) ;
  puis le signaler à la page de santé (avertissement après 45 jours sans test, erreur après 90) :

  ```bash
  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
    -d '{"job":"restore-test","ok":true,"summary":{"dump":"benevoles_2026-09-30_01-00"}}' \
    https://www.benevol.app/api/cron/heartbeat
  ```

  Les CronJobs de sauvegarde et de copie hors site envoient le même battement de cœur (`backup`, `backup-offsite`) à la fin de chaque exécution réussie ; les rappels et le nettoyage s'enregistrent eux-mêmes.
- [ ] certificat wildcard valide (`kubectl -n benevoles get certificate benevol-app-wildcard`) ;
- [ ] pas d'alerte en attente dans Sentry, en particulier sur la file d'envoi des emails.

## Supprimer une organisation

Il n'y a pas de suppression immédiate : le super admin **désactive** l'organisation (`/super-admin/organizations`), ce qui coupe l'accès admin et public tout de suite, et `/api/cron/cleanup` l'efface définitivement (événements, créneaux, inscriptions, membres, invitations en cascade ; comptes admin de l'organisation effacés avec elle) **30 jours après la désactivation**. Avant de désactiver, rappeler à l'organisation d'exporter ce qu'elle veut garder (`guide/exporter-et-conserver-ses-donnees.md`, « Exporter et conserver ses données »). Une réactivation dans les 30 jours annule la suppression. Les sauvegardes chiffrées contenant ces données expirent selon leur propre rétention (30 jours sur le serveur, 90 jours hors site).

## Journaux

[`k8s/log-rotation.md`](../k8s/log-rotation.md) décrit comment limiter la rétention des journaux à 90 jours sur le nœud k3s (kubelet, logrotate ; Loki s'il est installé).
