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
3. `builder` : `prisma generate` puis `npm run build`. `DATABASE_URL` et `AUTH_SECRET` reçoivent des valeurs factices pendant le build. `NEXT_PUBLIC_SENTRY_DSN` est un argument de build et `SENTRY_AUTH_TOKEN` un secret de build (`sentry_auth_token`)
4. `runner` : sortie `standalone` de Next.js, utilisateur non root, port 3000

Au démarrage, `docker-entrypoint.sh` attend PostgreSQL, exécute `prisma migrate deploy` sauf si `MIGRATE_ON_START=false`, puis lance `node server.js`. Avec Docker Compose, les migrations s'appliquent donc au démarrage de l'application. Sur Kubernetes, les pods de l'application ont `MIGRATE_ON_START=false` : c'est le Job de migration qui les applique, une seule fois par déploiement (voir ci-dessous).

## Docker Compose

```bash
export AUTH_SECRET="$(openssl rand -base64 48)"
export TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # à conserver : voir « Mise à jour depuis 1.x »
docker compose up -d
```

`docker-compose.yml` lance PostgreSQL 16 et l'application (`build: .`) sur le port 3000. Ce qu'il ne fait pas :

- Il ne transmet pas `AUTH_URL`, `AUTH_TRUST_HOST`, `CRON_SECRET`, `EMAIL_REPLY_TO` ni les variables VAPID et Sentry : à ajouter dans la section `environment` si nécessaire.
- Il n'inclut aucun planificateur. Sans `CRON_SECRET`, les endpoints `/api/cron/*` refusent toute requête en production : ajouter ce secret et appeler les endpoints depuis un cron de l'hôte (voir le README).
- Il n'exécute pas le seed : lancer `npm run db:seed` avec les variables `ADMIN_*` pour créer le premier super admin.
- Les identifiants PostgreSQL du fichier sont ceux du développement : les changer.

## Kubernetes

Manifestes dans `k8s/`, namespace `benevoles` :

| Fichier | Contenu |
|---------|---------|
| `namespace.yaml` | Namespace |
| `secret.yaml` | Modèle du secret `benevoles-secret` (toutes les valeurs à remplacer) |
| `postgres.yaml` | PostgreSQL |
| `job-migrate.yaml` | Job de migration (`prisma migrate deploy` avec l'image déployée), exécuté avant la mise à jour de l'application |
| `deployment.yaml` | Application : 1 réplica, mise à jour progressive sans indisponibilité, secret injecté avec `envFrom`, limites 500m CPU et 512 Mi |
| `service.yaml`, `ingress.yaml` | Exposition via Traefik pour `*.benevol.app`, `benevol.app` et `www.benevol.app`, TLS |
| `ingressroute-tokens.yaml` | Routeur prioritaire, **sans journal d'accès**, pour les requêtes qui portent un jeton personnel (chemins `/my/`, `/leader/`… et requêtes `token`, `t`) et la recherche admin, en HTTPS et en HTTP (redirigé). Un jeton ne doit jamais être journalisé ; limité à benevol.app, le Traefik partagé n'est pas modifié. Toute nouvelle route à jeton s'y ajoute (vérifié par `no-tokens-in-access-logs.test.ts`) |
| `traefik-config.yaml` | Réglage du Traefik fourni par k3s (`HelmChartConfig`) : `externalTrafficPolicy: Local` pour conserver l'adresse réelle des visiteurs (voir ci-dessous) |
| `certificate-wildcard.yaml` | Certificat wildcard (cert-manager, `ClusterIssuer` `letsencrypt-prod`) |
| `gandi-webhook.yaml` | Webhook DNS Gandi pour la validation DNS-01 du certificat wildcard |
| `cronjob-reminders.yaml` | Rappels, toutes les heures |
| `cronjob-cleanup.yaml` | Purge RGPD, 02:00 UTC |
| `cronjob-backup.yaml` | `pg_dump` chiffré (AES-256) vers un volume, 01:00 UTC, rétention 30 jours |
| `cronjob-backup-offsite.yaml` | Copie des fichiers déjà chiffrés vers Dropbox (`rclone`), 01:30 UTC, rétention 90 jours côté Dropbox |
| `log-rotation.md` | Rotation des journaux du nœud : procédure manuelle, la durée de 90 jours n'est pas encore garantie |

### Adresse des visiteurs et limites de débit

Les limites de débit (inscription, lien personnel, invitation, mot de passe oublié…) comptent les requêtes par adresse de visiteur, lue dans `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, 1 par défaut). Avec le réglage par défaut de k3s (`externalTrafficPolicy: Cluster`), le répartiteur de charge interne remplace l'adresse de chaque visiteur par celle du nœud (`10.42.0.1`) : toutes les limites deviennent alors un seul compteur partagé par tout le monde, et une heure chargée bloque tous les visiteurs. `traefik-config.yaml` règle `externalTrafficPolicy: Local` ; sur ce cluster à un seul nœud, cela n'a pas d'inconvénient. Ce Traefik sert aussi les autres sites du cluster.

Vérifier après application :

```bash
kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'   # Local
```

Dans la table `RateLimit`, les clés doivent ensuite contenir des adresses publiques, plus `10.42.0.1`.

### Ordre de déploiement

À chaque push sur `main`, `deploy.yml` applique les migrations **avant** de mettre à jour l'application :

1. supprime le Job de migration précédent, puis applique `k8s/job-migrate.yaml` avec la nouvelle image ;
2. attend sa réussite ; en cas d'échec, le déploiement s'arrête et la version en cours continue de servir (journaux du Job affichés dans le workflow) ;
3. seulement ensuite, applique `k8s/deployment.yaml` : Kubernetes remplace l'ancien pod progressivement.

Entre l'étape 1 et la fin du remplacement, l'ancienne version du code tourne sur le nouveau schéma : chaque migration doit rester compatible avec la version précédente (règles *expand/contract* dans [CONTRIBUTING.md](../CONTRIBUTING.md), vérifiées par la CI).

### Mise en place manuelle

Même ordre que `deploy.yml`, sans quoi une nouvelle version pourrait démarrer sur un schéma pas encore migré :

```bash
IMAGE=ghcr.io/<org>/benevoles:<tag>

# 1. Namespace et secrets (secret.yaml est un modèle : remplacer les valeurs ; secret de tirage : ghcr-secret)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml

# 2. PostgreSQL, puis attendre qu'il soit prêt
kubectl apply -f k8s/postgres.yaml
kubectl -n benevoles rollout status deploy/postgres

# 3. Migrations avec la nouvelle image, et attendre leur réussite
kubectl -n benevoles delete job benevoles-migrate --ignore-not-found --wait=true
APP_IMAGE=$IMAGE envsubst < k8s/job-migrate.yaml | kubectl apply -f -
kubectl -n benevoles wait --for=condition=complete job/benevoles-migrate --timeout=300s
kubectl -n benevoles logs job/benevoles-migrate

# 4. Seulement ensuite, l'application
APP_IMAGE=$IMAGE envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl -n benevoles rollout status deploy/benevoles-app

# 5. Exposition et tâches planifiées
kubectl apply -f k8s/service.yaml -f k8s/ingress.yaml -f k8s/ingressroute-tokens.yaml -f k8s/certificate-wildcard.yaml
kubectl apply -f k8s/cronjob-reminders.yaml -f k8s/cronjob-cleanup.yaml -f k8s/cronjob-backup.yaml -f k8s/cronjob-backup-offsite.yaml
```

Si l'étape 3 échoue (`kubectl wait` en erreur), ne pas passer à l'étape 4 : lire les journaux du Job, corriger, relancer.

Points d'attention :

- Le secret `benevoles-secret` réel n'est pas appliqué depuis `k8s/secret.yaml` (simple modèle) : l'étape « Sync k8s secret » de `deploy.yml` le régénère à chaque déploiement à partir des secrets GitHub, avec `AUTH_URL`, `AUTH_TRUST_HOST`, `VAPID_*` et `SENTRY_DSN` (secret GitHub `SENTRY_DSN`, à défaut `NEXT_PUBLIC_SENTRY_DSN`). Le DSN navigateur, lui, est injecté au build.
- Les sondes `readiness` et `liveness` interrogent `/api/health` (requête `SELECT 1`, délais de 3 et 5 s). Elles interrogeaient auparavant `/api/public/events`, plus lourd ; des événements Kubernetes « Readiness probe failed (Client.Timeout exceeded) » ont été observés sur plusieurs pods lors des déploiements du 20 septembre 2026.
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

La ranger **d'abord** dans un gestionnaire de mots de passe, hors du serveur et hors du dépôt. Perdue, elle ne casse pas les liens déjà envoyés (ils sont reconnus par leur empreinte), mais l'application ne peut plus les renvoyer : rappels, « renvoyer le lien », notifications aux responsables. Pour la changer plus tard, suivre « Rotation de la clé de chiffrement » dans le README. `TOKEN_ENCRYPTION_KEY_ID` et `TOKEN_ENCRYPTION_PREVIOUS_KEYS` ne servent qu'aux rotations : les laisser vides.

### 4. Installer la clé

- **Avec `deploy.yml`** : `gh secret set TOKEN_ENCRYPTION_KEY`. Le workflow s'arrête avant de toucher au cluster si ce secret manque, et il régénère `benevoles-secret` à chaque déploiement : une modification manuelle du secret serait écrasée.
- **Kubernetes à la main** : ajouter `TOKEN_ENCRYPTION_KEY` dans `benevoles-secret` (modèle : `k8s/secret.yaml`). Vérifier aussi que ce secret contient `CRON_SECRET` et `NEXT_PUBLIC_APP_URL` : les CronJobs de sauvegarde les lisent, et sans eux leur pod ne démarre pas.
- **Docker Compose** : `TOKEN_ENCRYPTION_KEY` dans le fichier `.env` à côté de `docker-compose.yml`, et `CRON_SECRET` dans la section `environment` : sans lui, la tâche de nettoyage est refusée et les anciens liens ne sont jamais chiffrés.

### 5. Kubernetes

Avec `deploy.yml`, un push sur `main` applique tout dans le bon ordre. À la main, suivre [Mise en place manuelle](#mise-en-place-manuelle) : migrations d'abord, et ne pas continuer si le Job échoue (`backoffLimit: 0`).

`k8s/traefik-config.yaml` n'est **pas** appliqué par `deploy.yml` : il règle le Traefik de k3s partagé par tous les sites du cluster (`kube-system`). Un `HelmChartConfig` `traefik` existant serait remplacé : fusionner d'abord ses réglages. À appliquer une fois :

```bash
kubectl apply -f k8s/traefik-config.yaml
kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'   # Local
```

`ingressroute-tokens.yaml` demande Traefik 3.1 ou plus récent, et ses domaines (`benevol.app`) et son secret TLS sont écrits en dur : les adapter pour un autre domaine.

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

## CI/CD

| Workflow | Déclencheur | Étapes |
|----------|-------------|--------|
| `ci.yml` | pull request vers `main` | type-check, lint, tests Vitest ; tests E2E Playwright (base migrée et seedée) |
| `deploy.yml` | push sur `main` | type-check, lint, tests ; construction et publication de l'image sur GHCR ; Job de migration, puis déploiement Kubernetes (voir « Ordre de déploiement ») |
| `gandi-webhook.yml` | pull request ou push sur `main` touchant `gandi-webhook/` | construction de l'image du webhook ; publication sur GHCR seulement sur push |

L'analyse CodeQL (JavaScript/TypeScript, Go, Actions) ne figure pas dans `.github/workflows/` : elle est configurée côté GitHub (paramètres de sécurité du dépôt).

Chaque push sur `main` déploie donc en production. Les versions sont marquées par un commit `chore: release X.Y.Z` (mise à jour de `CHANGELOG.md` et de la version de `package.json`), un tag `vX.Y.Z` et une release GitHub.

## Corriger d'anciens horaires hors plage

Avant la version qui borne les horaires à `00:00`–`23:59`, l'application a pu enregistrer des heures comme `24:00`, `26:00` ou `25:30` (créneaux de nuit saisis en prolongeant la journée, ou créés en faisant glisser une barre sur le planning administrateur), et même des heures négatives (`-2:-15`). L'affichage les lit modulo 24, mais il est préférable de les convertir.

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

> **Incident (corrigé le 2026-09-22)** : de la création du CronJob (début mai 2026) jusqu'à cette date, chaque exécution a échoué silencieusement. L'image `postgres:16-alpine` ne fournit pas de CLI `openssl` ; l'ancien script (`pg_dump | gzip | openssl enc > fichier`) ne vérifiait que le code retour de la dernière commande du pipe, et la redirection `>` crée le fichier de sortie avant même que le pipe échoue. Résultat : 144 jours de fichiers `.sql.gz.enc` de 0 octet, sans qu'aucune alerte ne se déclenche. **Aucun fichier antérieur au 22/09/2026 n'est restaurable — ignorer les backups datés d'avant cette correction.** Le script installe maintenant `openssl` au démarrage, écrit chaque étape dans un fichier (plus de pipe qui masque un échec), vérifie que le dump dépasse 1 Ko, et re-déchiffre le fichier produit pour confirmer qu'il redonne la même taille avant de le garder ; toute anomalie fait échouer le job au lieu de produire un fichier silencieusement vide.

Déchiffrement (commande donnée en en-tête du manifeste) :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass pass:<PASSPHRASE> \
  -in benevoles_<date>.sql.gz.enc -out dump.sql.gz && gunzip dump.sql.gz
```

### `BACKUP_PASSPHRASE` est un point unique de défaillance

Elle n'existe qu'à un seul endroit : la clé `BACKUP_PASSPHRASE` du secret `benevoles-secret`, sur ce cluster. Elle n'est **pas** synchronisée depuis les secrets GitHub Actions (`deploy.yml` ne la gère pas, contrairement au reste de `benevoles-secret`) — elle a été ajoutée directement dans le cluster, à la main.

Conséquence : si le cluster est perdu **et** que personne n'a cette valeur ailleurs, la copie hors site sur Dropbox (voir ci-dessous) ne sert à rien — elle ne contient que du binaire chiffré, pour toujours illisible sans elle. La copie Dropbox protège contre « le fichier a disparu », pas contre « la clé a disparu » ; les deux protections sont indépendantes.

**À faire une fois, en dehors du cluster** : récupérer la valeur et la noter dans un gestionnaire de mots de passe (jamais dans ce dépôt, ni dans un fichier sur ce même serveur) :

```bash
kubectl -n benevoles get secret benevoles-secret -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d; echo
```

### Copie hors site (Dropbox)

`cronjob-backup-offsite.yaml` copie chaque nuit à 01h30 UTC (30 min après le dump) les fichiers déjà chiffrés du volume `backup-pvc` vers Dropbox avec `rclone`. Comme les fichiers sont déjà chiffrés AES-256 avant d'être lus par ce job, Dropbox ne voit jamais rien de lisible sans `BACKUP_PASSPHRASE`.

- Envoi avec `rclone copy` (upload seulement, ne touche jamais aux fichiers déjà présents côté Dropbox) puis purge côté Dropbox des fichiers de plus de **90 jours** avec `rclone delete --min-age`. Volontairement plus long que la rétention locale de 30 jours du PVC : le but est de pouvoir revenir à un état antérieur à une erreur découverte tard, indépendamment de ce que la rotation locale a déjà supprimé.
- Ce n'est pas un `rclone sync` : un `sync` effacerait côté Dropbox tout fichier que le PVC a déjà purgé, ce qui viderait la copie hors site en même temps que le volume local en cas de perte du cluster — exactement le scénario que la copie hors site est censée couvrir.

**Mise en place du remote Dropbox** (à faire une fois, en local — jamais dans ce dépôt, le jeton produit est un secret) :

```bash
rclone config
# Nouveau remote → nom "dropbox" → type "dropbox" → autoriser dans le navigateur
# Produit ~/.config/rclone/rclone.conf
```

```bash
kubectl create secret generic rclone-config -n benevoles \
  --from-file=rclone.conf=$HOME/.config/rclone/rclone.conf
```

À refaire si le jeton est révoqué côté Dropbox (Dropbox ne fait pas expirer les jetons rclone par défaut). Tant que ce secret n'existe pas, le CronJob échoue simplement (pod bloqué faute de volume) ; ça n'affecte pas le dump local (`cronjob-backup.yaml`), qui est un job séparé.

Restauration depuis Dropbox : télécharger le fichier voulu (`rclone copy dropbox:/benevol-backups/<fichier> .`), puis déchiffrer comme ci-dessus.

### Limites actuelles

Le volume de sauvegarde local est sur le même cluster que la base : une panne de cluster emporte les deux, d'où la copie Dropbox ci-dessus.

**Surveillance.** Chaque CronJob de sauvegarde envoie un signal de vie (`/api/cron/heartbeat`) quand il réussit. La page `/super-admin/health` affiche le dernier succès de la sauvegarde chiffrée et de la copie hors site, et les passe en erreur au-delà de 26 heures sans succès : un échec silencieux comme celui du 22/09/2026 y apparaît le lendemain, sans consulter `kubectl`.

**Encore manuel.** Aucune alerte n'est envoyée d'elle-même (ni email ni notification) : il faut ouvrir la page de santé. Le test de restauration complète se fait à la main (voir la checklist ci-dessous) ; il envoie son propre signal de vie, et la page de santé le signale s'il date de plus de 90 jours.

## Checklist opérationnelle

Ce que rien n'automatise encore (voir « Limites actuelles ») et qu'il faut donc vérifier à la main.

**Avant une mise en production** (premier déploiement ou nouveau cluster) :

- [ ] `TOKEN_ENCRYPTION_KEY` et `BACKUP_PASSPHRASE` notées dans un gestionnaire de mots de passe, hors du cluster et hors de ce dépôt ;
- [ ] secret `rclone-config` créé, et une première copie Dropbox constatée le lendemain ;
- [ ] le Job de migration a réussi (`kubectl -n benevoles logs job/benevoles-migrate`) ;
- [ ] `/super-admin/health` (connecté en super admin) est tout vert : base, file d'emails, rappels, nettoyage, sauvegarde, copie hors site, migrations, configuration ;
- [ ] `/api/health` répond `200` ;
- [ ] un appel manuel de `/api/cron/reminders` et `/api/cron/cleanup` avec `CRON_SECRET` répond `200`.

**Chaque mois** :

- [ ] les derniers CronJobs de sauvegarde ont réussi : `kubectl -n benevoles get jobs` (dump et copie hors site) ;
- [ ] le dernier fichier sur `backup-pvc` et sur Dropbox a une taille plausible (pas 0 octet) ;
- [ ] **test de restauration** : télécharger un dump, le déchiffrer et le charger dans une base PostgreSQL jetable (`psql -f dump.sql`), puis vérifier quelques comptages (organisations, événements, inscriptions) ;
  puis le signaler à la page de santé (elle réclame ce test tous les 45 jours) :

  ```bash
  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
    -d '{"job":"restore-test","ok":true,"summary":{"dump":"benevoles_2026-09-30_01-00"}}' \
    https://www.benevol.app/api/cron/heartbeat
  ```

  Les CronJobs de sauvegarde et de copie hors site envoient le même battement de cœur (`backup`, `backup-offsite`) à la fin de chaque exécution réussie ; les rappels et le nettoyage s'enregistrent eux-mêmes.
- [ ] certificat wildcard valide (`kubectl -n benevoles get certificate benevol-app-wildcard`) ;
- [ ] pas d'alerte en attente dans Sentry, en particulier sur la file d'envoi des emails.

## Supprimer une organisation

Il n'y a pas de suppression immédiate : le super admin **désactive** l'organisation (`/super-admin/organizations`), ce qui coupe l'accès admin et public tout de suite, et `/api/cron/cleanup` l'efface définitivement (événements, créneaux, inscriptions, membres, invitations en cascade ; comptes admin détachés puis effacés) **30 jours après la désactivation**. Avant de désactiver, rappeler à l'organisation d'exporter ce qu'elle veut garder (GUIDE_ADMIN, « Exporter et conserver ses données »). Une réactivation dans les 30 jours annule la suppression. Les sauvegardes chiffrées contenant ces données expirent selon leur propre rétention (30 jours sur le serveur, 90 jours hors site).

## Journaux

`k8s/log-rotation.md` décrit trois options pour limiter la rétention des journaux à 90 jours (kubelet, logrotate, Loki).
