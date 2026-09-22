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

Au démarrage, `docker-entrypoint.sh` attend PostgreSQL, exécute `prisma migrate deploy`, puis lance `node server.js`.

## Docker Compose

```bash
export AUTH_SECRET="$(openssl rand -base64 48)"
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
| `deployment.yaml` | Application : 1 réplica, mise à jour progressive sans indisponibilité, secret injecté avec `envFrom`, limites 500m CPU et 512 Mi |
| `service.yaml`, `ingress.yaml` | Exposition via Traefik pour `*.benevol.app`, `benevol.app` et `www.benevol.app`, TLS |
| `certificate-wildcard.yaml` | Certificat wildcard (cert-manager, `ClusterIssuer` `letsencrypt-prod`) |
| `gandi-webhook.yaml` | Webhook DNS Gandi pour la validation DNS-01 du certificat wildcard |
| `cronjob-reminders.yaml` | Rappels, toutes les heures |
| `cronjob-cleanup.yaml` | Purge RGPD, 02:00 UTC |
| `cronjob-backup.yaml` | `pg_dump` chiffré (AES-256) vers un volume, 01:00 UTC, rétention 30 jours |
| `cronjob-backup-offsite.yaml` | Copie des fichiers déjà chiffrés vers Dropbox (`rclone`), 01:30 UTC, rétention 90 jours côté Dropbox |
| `log-rotation.md` | Rétention des logs sur 90 jours |

Mise en place manuelle :

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml        # après avoir remplacé les valeurs
APP_IMAGE=ghcr.io/<org>/benevoles:<tag> envsubst < k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml -f k8s/ingress.yaml
```

Les migrations sont appliquées par l'entrypoint de l'image à chaque démarrage. Le secret de tirage d'image s'appelle `ghcr-secret`.

Points d'attention :

- Le secret `benevoles-secret` réel n'est pas appliqué depuis `k8s/secret.yaml` (simple modèle) : l'étape « Sync k8s secret » de `deploy.yml` le régénère à chaque déploiement à partir des secrets GitHub, avec `AUTH_URL`, `AUTH_TRUST_HOST`, `VAPID_*` et `SENTRY_DSN` (secret GitHub `SENTRY_DSN`, à défaut `NEXT_PUBLIC_SENTRY_DSN`). Le DSN navigateur, lui, est injecté au build.
- Les sondes `readiness` et `liveness` interrogent `/api/health` (requête `SELECT 1`, délais de 3 et 5 s). Elles interrogeaient auparavant `/api/public/events`, plus lourd ; des événements Kubernetes « Readiness probe failed (Client.Timeout exceeded) » ont été observés sur plusieurs pods lors des déploiements du 20 septembre 2026.
- Les cron jobs de rappels et de purge lisent `NEXT_PUBLIC_APP_URL` et `CRON_SECRET` dans `benevoles-secret`.

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
| `deploy.yml` | push sur `main` | type-check, lint, tests ; construction et publication de l'image sur GHCR ; déploiement Kubernetes |
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

Le volume de sauvegarde local est sur le même cluster que la base : une panne de cluster emporte les deux, d'où la copie Dropbox ci-dessus. Pas encore fait : alerte en cas d'échec d'un des deux CronJobs (ni l'un ni l'autre n'envoie de notification — un échec silencieux comme celui du 22/09/2026 resterait invisible sans consulter `kubectl` manuellement) ; test de restauration complète, jamais effectué.

## Journaux

`k8s/log-rotation.md` décrit trois options pour limiter la rétention des journaux à 90 jours (kubelet, logrotate, Loki).
