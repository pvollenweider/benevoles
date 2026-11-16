# Auto-hébergement avec Docker Compose

> **Non testé sur machine vierge.** Ce guide est un squelette (#761) : il rassemble ce que le dépôt fait aujourd'hui, mais personne ne l'a encore suivi de bout en bout sur une machine neuve. Les étapes marquées « à vérifier » n'ont pas été exécutées. Le critère d'acceptation de #761 (instance en HTTPS avec un sous-domaine d'organisation, email de test reçu, sauvegarde restaurée sur une seconde machine, mise à jour depuis la version précédente) reste à remplir, par quelqu'un d'autre que l'auteur, en notant le système et les versions utilisés.

Ce guide s'adresse à une association ou à une collectivité qui veut faire tourner sa propre instance sur un serveur, avec Docker Compose, sans Kubernetes. L'instance benevol.app, elle, tourne sur Kubernetes ([deploiement.md](deploiement.md#kubernetes)).

## Prérequis

- Un serveur Linux avec Docker Engine et le plugin Compose v2 (`docker compose`). Versions minimales : à vérifier.
- Assez de mémoire pour construire l'image (`docker compose up --build` lance `next build`) : à mesurer. À défaut, partir de l'image publiée `ghcr.io/pvollenweider/benevoles` (amd64 seulement, voir [Images publiées](deploiement.md#images-publiées)) en épinglant un tag `sha-…` ; le fichier Compose construit depuis les sources, l'adapter à une image publiée est à vérifier.
- Un nom de domaine dont vous gérez la zone DNS, avec un enregistrement wildcard possible (voir [DNS et sous-domaines](#dns-et-sous-domaines)).
- Un compte SMTP pour l'envoi des emails.
- Un checkout du dépôt sur le serveur (`git clone`) : le fichier Compose construit l'image depuis les sources et monte `scripts/compose-cron.sh` dans le service `cron`.

## Variables

Toutes les variables sont décrites dans [configuration.md](configuration.md). Elles vont dans un fichier `.env` à côté de `docker-compose.yml` : Docker Compose le lit tout seul. Créer le fichier avec les quatre secrets, tirés au hasard ([deploiement.md](deploiement.md#docker-compose)) :

```bash
umask 077
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 48)
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -base64 32)
EOF
```

Puis y ajouter le reste :

| Variable | Pourquoi |
|----------|----------|
| `POSTGRES_PASSWORD` | Mot de passe de la base, lu à la création du volume (voir [Base de données](#base-de-données)). Sans lui, Compose refuse de démarrer. |
| `AUTH_SECRET` | Secret des sessions. Sans lui, Compose refuse de démarrer ; une valeur d'exemple ou trop simple est refusée au démarrage de l'application. |
| `TOKEN_ENCRYPTION_KEY` | Chiffrement des liens personnels. Obligatoire en production, à ne jamais perdre (voir [Secrets](#secrets)). |
| `CRON_SECRET` | Partagé par l'application et le service `cron`. Sans lui, Compose refuse de démarrer. |
| `NEXT_PUBLIC_APP_URL` | Adresse publique du site principal, par exemple `https://www.exemple.org` ; donne aussi le domaine des organisations (`<slug>.exemple.org`). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Le premier compte, créé au démarrage (voir [Premier super admin](#premier-super-admin)). |
| `SMTP_*`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Envoi des emails (voir [SMTP](#smtp)). |
| `SITE_NAME`, `CONTACT_EMAIL`, `SUPPORT_URL` | Le nom et le contact de votre instance, à la place de ceux de benevol.app (#760). |

`docker-compose.yml` transmet à l'application les variables de `.env` qu'il nomme ; une variable optionnelle absente de `.env` n'est pas transmise et garde sa valeur par défaut. Une variable de [configuration.md](configuration.md) que le fichier ne nomme pas est à ajouter dans sa section `environment`. Dans `.env`, entourer de guillemets simples une valeur qui contient `$`, `#` ou une espace.

## Base de données

Le fichier Compose lance PostgreSQL 16 avec un volume nommé (`benevoles_postgres_data`). Les migrations s'appliquent au démarrage de l'application (`MIGRATE_ON_START`, actif par défaut).

- `POSTGRES_PASSWORD` n'est lu qu'à la création du volume. Le changer ensuite dans `.env` ne change pas le mot de passe de la base existante : la marche à suivre est dans [deploiement.md](deploiement.md#mettre-à-jour-une-installation-compose-existante). Ne jamais supprimer le volume pour cela, il contient toutes les données.
- PostgreSQL n'est joignable que par l'application, sur le réseau interne de Compose : aucun port n'est publié sur le serveur. Une requête SQL passe par `docker compose exec postgres psql -U benevoles benevoles` ; pour un outil installé sur le serveur, voir [Accès ponctuel à la base](deploiement.md#accès-ponctuel-à-la-base).

## Stockage des fichiers

L'application n'écrit pas de fichier sur disque pour vos données : le logo d'une organisation est enregistré en base (table `OrganizationLogo`), et les imports CSV ou Excel sont lus en mémoire. Sauvegarder la base suffit donc. À vérifier à chaque nouvelle version.

## SMTP

Sans `SMTP_HOST`, aucun email ne part ; la page **Santé du service** (super admin) le signale. Les variables sont décrites dans [configuration.md](configuration.md). Pour tester : créer un événement de test, s'y inscrire avec votre propre adresse et vérifier la confirmation (à vérifier : délivrabilité, SPF et DKIM du domaine d'envoi selon votre fournisseur).

## DNS et sous-domaines

Chaque organisation a son adresse, `<slug>.exemple.org`, et le site principal répond sur `www.exemple.org` (#760 : il n'y a pas aujourd'hui de mode à une seule organisation sans sous-domaines). Il faut donc :

- un enregistrement `A` (et `AAAA` si besoin) pour `exemple.org` et `www.exemple.org` vers le serveur ;
- un enregistrement wildcard `*.exemple.org` vers le même serveur ;
- un certificat TLS qui couvre `*.exemple.org`. Let's Encrypt ne délivre un certificat wildcard que par un défi DNS-01 : votre reverse proxy doit pouvoir créer un enregistrement TXT chez votre fournisseur DNS (module ou plugin propre à chaque fournisseur). Sur Kubernetes, benevol.app le fait avec cert-manager et un webhook Gandi ; ici, c'est le rôle du reverse proxy.

## HTTPS et reverse proxy

L'application écoute en HTTP sur `127.0.0.1:3000`, la boucle locale du serveur seulement ; un reverse proxy installé sur le même serveur termine TLS pour le domaine principal et tous les sous-domaines. Exemple avec Caddy, non testé (le module DNS dépend de votre fournisseur et demande une version de Caddy construite avec lui) :

```caddyfile
exemple.org, *.exemple.org {
	tls {
		dns <fournisseur> <jeton>
	}
	reverse_proxy 127.0.0.1:3000
}
```

Points à respecter quel que soit le proxy :

- transmettre l'en-tête `Host` d'origine : l'organisation se déduit du sous-domaine ;
- ajouter l'adresse du visiteur à `X-Forwarded-For`, et régler `TRUSTED_PROXY_HOPS` sur le nombre de proxies qui l'ajoutent (défaut `1`) : les limites de débit en dépendent ([deploiement.md](deploiement.md#exposition-et-adresse-des-visiteurs)) ;
- `AUTH_URL` prend par défaut la valeur de `NEXT_PUBLIC_APP_URL` ; `AUTH_TRUST_HOST` n'est pas activé par défaut. Avec des sous-domaines d'organisation, le réglage qui permet la connexion sur chaque sous-domaine est à vérifier lors du premier passage ;
- ne jamais publier le port 3000 sur une interface publique. Pour un proxy installé sur une autre machine, voir [Exposition et adresse des visiteurs](deploiement.md#exposition-et-adresse-des-visiteurs) ;
- ne pas écrire les liens personnels (`/my/…`, `/leader/…`, `/waitlist/…`) dans les journaux d'accès du proxy : ils donnent accès aux données d'un bénévole. benevol.app les exclut sur Kubernetes (`k8s/ingressroute-tokens.yaml`) ; l'équivalent pour votre proxy est à écrire.

## Tâches planifiées

Le service `cron` du fichier Compose (`scripts/compose-cron.sh`) appelle l'application aux mêmes heures (UTC) que les CronJobs Kubernetes : `/api/cron/outbox` toutes les 5 minutes, `/api/cron/reminders` toutes les heures, `/api/cron/cleanup` à 02:00 et `/api/cron/release-check` à 03:00. Il démarre quand l'application est en bonne santé et écrit une ligne par appel dans son journal (`docker compose logs cron`). Sans `CRON_SECRET` dans `.env`, Compose refuse de démarrer.

Ne pas faire appeler les mêmes adresses par le cron du serveur en plus : une seule source suffit. Si vous préférez le cron du serveur, retirez le service `cron` et suivez [Tâches planifiées](../README.md#tâches-planifiées-cron) dans le README. Les sauvegardes ne font pas partie de ces tâches (voir [Sauvegarde et restauration](#sauvegarde-et-restauration)).

## Premier super admin

Définir `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans `.env` (et `ADMIN_NAME` pour le nom affiché) avant le premier `docker compose up -d` : l'application crée le compte au démarrage, sans organisation, puis vous vous connectez par la page habituelle. Le mot de passe suit les règles de tous les mots de passe (10 caractères, majuscule, minuscule, chiffre, caractère spécial). Le compte n'est créé qu'une fois, tant qu'aucun super admin n'existe : changer `ADMIN_PASSWORD` ensuite n'a plus d'effet, le mot de passe se change depuis « Mon profil ». Détails : [configuration.md](configuration.md#premier-super-admin-auto-hébergement).

La première organisation se crée ensuite depuis l'espace super admin (parcours à vérifier lors du premier passage). L'organisation `default` et l'événement de démonstration du seed ne sont pas nécessaires ; pour les avoir, voir le seed dans [deploiement.md](deploiement.md#docker-compose).

## Sauvegarde et restauration

Le fichier Compose ne sauvegarde rien. Une sauvegarde quotidienne depuis le cron de l'hôte, par exemple (à vérifier, et à copier hors du serveur) :

```bash
docker compose exec -T postgres pg_dump -U benevoles benevoles | gzip > benevoles-$(date +%F).sql.gz
```

Restauration dans une base vide, à vérifier sur une seconde machine avant d'en avoir besoin :

```bash
gunzip -c benevoles-<date>.sql.gz | docker compose exec -T postgres psql -U benevoles benevoles
```

La sauvegarde ne contient pas `TOKEN_ENCRYPTION_KEY` : sans la même clé, les liens personnels restaurés ne fonctionnent plus. **Restaurer ramène aussi les données des bénévoles effacés depuis la sauvegarde** : exporter le registre des effacements avant, le rejouer après ([rgpd/procedure-effacement.md](rgpd/procedure-effacement.md)).

## Mise à jour et migrations

1. Lire la section de la version visée dans le [CHANGELOG](../CHANGELOG.md) et dans [deploiement.md](deploiement.md) (« Mise à jour depuis… »).
2. Sauvegarder la base (ci-dessus) : c'est le retour arrière.
3. Mettre à jour le checkout sur le tag de la version (`git fetch --tags && git checkout v<version>`), puis `docker compose up -d --build --wait`, qui rend la main quand l'application est saine.
4. Suivre `docker compose logs -f app` jusqu'à « ✓ Migrations appliquées » et le démarrage du serveur.

Le service `cron` prévient aussi les super admins d'une nouvelle version publiée (`RELEASE_CHECK`, #612). La mise à jour depuis la version précédente reste à tester une fois (#761).

## Journaux

`docker compose logs app` et `docker compose logs cron`. Les journaux de Docker grandissent sans limite par défaut : régler la rotation du pilote de journalisation (`max-size`, `max-file`) dans la configuration de Docker, à vérifier.

## Surveillance

- `GET /api/health` répond `200` (`{"ok":true}`) quand le serveur répond et joint la base, `503` sinon. C'est le healthcheck du fichier Compose : `docker compose ps` montre l'application `healthy`.
- `GET /api/health/ready` répond `200` une fois le préchauffage terminé, `503` avant.
- La page **Santé du service** (`/super-admin/health`) rassemble l'état des migrations, du chiffrement, de l'envoi des emails, des tâches planifiées et de la dernière version connue.

## Secrets

- `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `POSTGRES_PASSWORD` et le mot de passe SMTP vivent dans `.env` : le garder hors du dépôt, lisible par le seul utilisateur qui lance Docker, et en garder une copie à part, avec les sauvegardes mais séparée d'elles.
- `TOKEN_ENCRYPTION_KEY` perdue, c'est la perte de tous les liens personnels déjà envoyés. Pour la changer : [Rotation de la clé de chiffrement](configuration.md#rotation-de-la-clé-de-chiffrement).
- `AUTH_SECRET` sert aussi aux empreintes du registre des effacements : avant de le changer, lire [configuration.md](configuration.md#application).

## Retour arrière

Revenir à l'image précédente sur une base déjà migrée n'est pas garanti : une migration n'a pas de retour en arrière automatique. Le retour arrière sûr est la restauration de la sauvegarde prise avant la mise à jour, avec le checkout de la version précédente (`git checkout v<précédente>`, `docker compose up -d --build`), en perdant ce qui a été saisi depuis.
