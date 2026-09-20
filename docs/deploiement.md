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
| `gandi-webhook.yml` | push sur `main` touchant `gandi-webhook/` | construction et publication de l'image du webhook sur GHCR |

L'analyse CodeQL (JavaScript/TypeScript, Go, Actions) ne figure pas dans `.github/workflows/` : elle est configurée côté GitHub (paramètres de sécurité du dépôt).

Chaque push sur `main` déploie donc en production. Les versions sont marquées par un commit `chore: release X.Y.Z` (mise à jour de `CHANGELOG.md` et de la version de `package.json`), un tag `vX.Y.Z` et une release GitHub.

## Sauvegarde et restauration

`cronjob-backup.yaml` produit chaque nuit, à 01:00 UTC, un `pg_dump` chiffré avec `BACKUP_PASSPHRASE`, sur le volume `backup-pvc`, conservé 30 jours. Les fichiers s'appellent `/backups/benevoles_YYYY-MM-DD_HH-MM.sql.gz.enc`.

Déchiffrement (commande donnée en en-tête du manifeste) :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:<PASSPHRASE> \
  -in benevoles_<date>.sql.gz.enc | gunzip > dump.sql
```

Le volume de sauvegarde est sur le même cluster que la base : prévoir une copie hors cluster. Tester une restauration complète avant d'en dépendre : ce test n'a pas été fait pour cette documentation.

## Journaux

`k8s/log-rotation.md` décrit trois options pour limiter la rétention des journaux à 90 jours (kubelet, logrotate, Loki).
