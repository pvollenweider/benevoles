# Rétention des journaux

Deux politiques, fixées dans `src/lib/retention.ts` ([docs/retention.md](../docs/retention.md)) :

- **Journaux d'accès de Traefik** (`accessLogs`, `accessLogFullIp`) : **1 an**, lignes JSON brutes telles que Traefik les écrit, pour tous les sites de ce Traefik. Adresse IP complète et User-Agent pendant **90 jours** ; ensuite l'adresse est réduite à son réseau (IPv4 en /24, IPv6 en /48) et le User-Agent retiré. Décision du propriétaire du 2026-10-22 pour la durée, le User-Agent et l'analyse à la demande ; la réduction après 90 jours est une proposition de minimisation (voir plus bas). Fichier JSON sur le nœud, procédure ci-dessous.
- **Journaux techniques des conteneurs** (`technicalLogs`) : **90 jours**. Sortie standard des pods, lue par `kubectl logs` ; voir « Journaux des conteneurs » plus bas.

Ces réglages vivent sur le nœud k3s (`vol8`, Ubuntu 24.04), hors du workflow de déploiement : rien ici n'est appliqué par `deploy.yml`. Une durée n'est garantie qu'une fois la procédure appliquée et vérifiée sur le serveur (`docs/rgpd/verifications-production.md`). Journaux d'accès de Traefik : procédure appliquée sur `vol8` le 2026-10-23.

## Journaux d'accès de Traefik

### Ce qui change

Avant : Traefik écrit ses journaux d'accès sur sa sortie standard. Kubelet n'en garde que 5 fichiers de 10 Mio (réglages par défaut de k3s), soit **environ 4 heures** de trafic : trop court pour enquêter sur un abus constaté le lendemain, ou pour analyser la fréquentation.

Après :

| Élément | Fichier du dépôt | Sur le nœud |
|---|---|---|
| Traefik écrit en JSON dans un fichier monté depuis le nœud (`hostPath`, `type: Directory`) | `k8s/traefik-config.yaml` | `/var/log/traefik/access.log` |
| Rotation quotidienne vers `/var/log/traefik-archive/`, que seul root peut ouvrir, à côté et non dans le répertoire de Traefik ; 365 fichiers et 365 jours au plus, compression, `copytruncate` (ni redémarrage ni signal à Traefik) | `k8s/node/traefik-access.logrotate` | `/etc/logrotate.d/traefik-access`, fichiers dans `/var/log/traefik-archive/` |
| Réduction des fichiers archivés dont la plus ancienne ligne a 89 jours (aucune ligne ne dépasse 90 jours avec l'adresse complète) : IPv4 en /24 (`203.0.113.57` devient `203.0.113.0`), IPv6 en /48, port du client et User-Agent retirés ; suppression des fichiers dont la plus ancienne ligne a plus de 365 jours ; alerte si le fichier actif n'est plus écrit | `k8s/node/traefik-log-anonymise` | `/usr/local/sbin/traefik-log-anonymise` |
| Lancement quotidien de ce script, à 04:15, après la rotation de la nuit | `k8s/node/traefik-log-anonymise.cron` | `/etc/cron.d/traefik-log-anonymise` |

Les en-têtes restent exclus (`fields.headers.defaultmode: drop`), sauf **User-Agent** (`fields.headers.names.User-Agent: keep`, décision du propriétaire du 2026-10-22), qui sert à séparer les robots des personnes à l'analyse ; `Referer`, cookies et en-têtes d'autorisation ne sont jamais écrits. Réglage global : il vaut aussi pour les autres sites de ce Traefik. Un enregistrement contient la date, le routeur, le site demandé (`RequestHost`), la méthode, le chemin avec sa requête (`RequestPath`), le statut, la durée, la taille, l'adresse du client (`ClientAddr`, `ClientHost`, `ClientPort`) et le User-Agent (`request_User-Agent`).

**Secrets et recherches hors du journal** (revue du 2026-10-22) : tout lien qui porte un secret dans son chemin (`/my/<jeton>`, `/leader/<jeton>`, `/waitlist/<jeton>`, `/api/public/registrations|member-invite|leader|waitlist/<jeton>`) ou dans sa requête (`token=` : invitation d'administrateur, de membre, mot de passe oublié, conservation et réactivation d'un espace, désabonnement des nouveautés ; `t=` : confirmation d'une demande d'espace) passe par le routeur sans journal de `k8s/ingressroute-tokens.yaml`, comme toute requête avec un `q=` non vide (recherche de l'administration, liste des membres, inscriptions d'un événement : souvent un nom ou une adresse), un `deleted=` (nom d'un membre qui vient d'être supprimé), un `tag=` (étiquette saisie par l'organisation) ou un `next=` / `callbackUrl=` (page de retour après connexion ou changement d'organisation, avec sa propre requête). Traefik ne regarde que les clés de premier niveau : c'est pour cela que les adresses de retour, qui en emboîtent une autre, sont exclues en entier. `src/lib/__tests__/no-tokens-in-access-logs.test.ts` échoue si un lien construit dans `src` (`?clé=${…}` ou `searchParams.set("clé", …)`) utilise une clé ni exclue ni déclarée sans secret, et si les routeurs HTTPS et HTTP n'ont pas la même règle ; un lien construit autrement (concaténation) lui échappe, à relire en revue. Restent journalisés, sans secret ni nom ou adresse en clair : identifiants internes (des données pseudonymisées, rattachables à une personne par la base) (`?member=`, `?with=`, `?volunteer=`, `?link=`), filtres (`?shift=`, `?role=`, `?since=`), le code de partage d'un groupe (`?groupe=`, diffusé à tout un club, il ne donne accès à aucune donnée) et le sous-domaine ou `?org=` d'une organisation. Aucun en-tête autre que User-Agent : ni `Authorization`, ni `Cookie`, ni `Referer` (`headers.defaultmode: drop`, vérifié par le test de `traefik-access-log.test.ts`).

La réduction après 90 jours est une **proposition** de minimisation (l'adresse complète suffit à l'enquête pendant 90 jours ; au-delà, le réseau suffit à repérer une source d'abus récurrente). Elle ne bloque pas l'analyse : GoAccess lit aussi les fichiers réduits (vérifié), mais pour eux le nombre de visiteurs uniques est approximatif (adresses regroupées par réseau) et la répartition navigateurs et robots n'existe plus (User-Agent retiré). Le propriétaire peut l'abandonner : lancer alors le script avec `--days 366` (il garde la suppression au bout d'un an et l'alerte), et retirer avant fusion la mention des 90 jours de `src/lib/retention.ts` et de la politique de confidentialité, qui l'annoncent. Traefik ne sait pas tronquer une adresse lui-même : il peut seulement garder, retirer ou masquer entièrement un champ (`fields.names`), d'où le script sur le nœud. Même réduite, une adresse reste une donnée personnelle (un /48 peut désigner le réseau d'un seul abonné) : les fichiers réduits restent sous la politique d'un an.

Le script ne lit que la bibliothèque standard de Python 3, présente sur Ubuntu. Il date un fichier par l'horodatage de sa première ligne (la plus ancienne), ou par son nom à défaut, pour qu'une rotation en retard ne fasse pas dépasser les 90 jours ; il est idempotent (une adresse réduite se réduit en elle-même) et note les fichiers traités dans `/var/lib/traefik-log-anonymise/done` pour ne pas les relire chaque nuit ; il conserve le propriétaire, les droits et la date de modification de chaque fichier, ne suit jamais un lien symbolique, et réduit aussi les adresses d'une ligne qui ne serait pas du JSON. Il ne réécrit jamais le fichier actif (Traefik le tient ouvert), mais échoue si sa première ligne a déjà 89 jours (la rotation s'est arrêtée), ou si le fichier manque ou si aucune ligne nouvelle n'est arrivée depuis 26 heures, d'après l'horodatage de la dernière ligne du fichier actif ou, juste après une rotation, de l'archive de la veille (Traefik n'écrit plus son journal, ce qu'il fait sans bruit quand il ne peut pas ouvrir le fichier). Il supprime aussi chaque fichier archivé dès que sa plus ancienne ligne a plus de 365 jours, parce que logrotate n'applique `maxage` qu'au moment d'une rotation. La première ligne sert de plus ancienne : Traefik écrit une ligne à la fin de la requête, horodatée de son début, donc une requête longue (30 minutes au plus) peut précéder de quelques minutes la première ligne ; la marge d'un jour (89 jours) la couvre. Ses messages et ses échecs vont au journal système : `journalctl -t traefik-log-anonymise`.

### Analyse à la demande

Pas d'agrégation automatique : l'opérateur analyse le fichier brut quand il en a besoin (fréquentation, pages en erreur, performances, robots), avec un outil standard, sans balise JavaScript ni cookie. Règles :

- l'analyse se fait **sur le poste de l'opérateur**, jamais sur un service tiers, à partir d'une **copie récente** (moins de 90 jours) ;
- la copie et le rapport sont **supprimés après usage** ; le rapport n'est **jamais publié** (ni sur le site, ni sur `medias.benevol.app`, ni partagé) ; pas de rapport en temps réel (`--real-time-html` ouvre un serveur WebSocket) ;
- l'analyse ne sert qu'aux finalités annoncées (sécurité, abus, débogage, fréquentation, erreurs, performances), jamais à suivre une personne ;
- pour benevol.app, filtrer d'abord sur `RequestHost` : les autres sites du fichier relèvent de leur propre information ;
- la fréquentation mesurée est **partielle** : les requêtes du routeur sans journal (liens personnels, jetons, recherches, adresses de retour) n'y figurent jamais, pas plus que les pages servies sans passer par Traefik ;
- n'activer ni résolution des adresses (`-d` / `--with-output-resolver`, et `--no-term-resolver` pour le terminal), ni liste des User-Agent par adresse (`-a` / `--agent-list`), ni base persistante (`--persist`), ni base GeoIP ; ne pas charger de configuration globale (`--no-global-config`) qui en activerait.

**GoAccess** (<https://goaccess.io>, version 1.12 du 2026-09-16, commande ci-dessous testée le 2026-10-22 avec l'image officielle `allinurl/goaccess:1.12` sur des lignes fictives au format de Traefik 3.6, fichiers bruts et réduits : toutes les lignes lues, aucune rejetée). GoAccess lit nativement les journaux JSON : le `--log-format` est un modèle JSON dont chaque valeur est un spécificateur (`%h` adresse, `%v` site, `%m` méthode, `%U` chemin avec sa requête, `%H` protocole, `%s` statut, `%b` taille, `%n` durée en nanosecondes, `%u` User-Agent) ; `StartUTC` (`2026-10-21T10:00:00.123456789Z`) se lit avec `%dT%t.%^` et les formats de date et d'heure ci-dessous (heures en UTC). `--anonymize-ip` affiche les adresses sans leur dernier nombre, `--no-query-string` retire la requête des chemins.

```bash
# Sur le poste de l'opérateur, dans un répertoire de travail
umask 077                                  # copie et rapport lisibles par vous seul
mkdir -p ~/analyse-traefik && cd ~/analyse-traefik
ssh vol8 'sudo cat /var/log/traefik-archive/access.log-20261021' > access.json        # ou le .gz d'un jour récent
# benevol.app seulement
grep -E '"RequestHost":"([a-z0-9-]+\.)?benevol\.app"' access.json > benevol.json      # zcat pour un .gz
LOGFMT='{"ClientHost":"%h","DownstreamContentSize":"%b","DownstreamStatus":"%s","Duration":"%n","RequestHost":"%v","RequestMethod":"%m","RequestPath":"%U","RequestProtocol":"%H","StartUTC":"%dT%t.%^","request_User-Agent":"%u"}'
goaccess benevol.json --no-global-config --no-term-resolver --log-format="$LOGFMT" \
  --date-format=%Y-%m-%d --time-format=%H:%M:%S --anonymize-ip --no-query-string \
  --html-report-title="benevol.app" -o rapport.html
# ou sans installation : docker run --rm -v "$PWD":/w allinurl/goaccess:1.12 /w/benevol.json [mêmes options] -o /w/rapport.html
open rapport.html          # rapport HTML autonome, lu en local
# Après usage
rm -f access.json benevol.json rapport.html && cd .. && rmdir analyse-traefik
```

**lnav** (<https://lnav.org>, version 0.14.1) convient mieux aux questions ponctuelles (filtrer une adresse, suivre les erreurs 5xx d'une heure, requêtes SQL sur les lignes). Il lit le JSON ligne à ligne avec un petit fichier de format (`"file-type": "json"`, `"timestamp-field": "StartUTC"`, voir « Defining a New Format » dans sa documentation) ; non testé ici. Mêmes règles : copie récente, sur le poste de l'opérateur, supprimée après usage.

### Autres sites du même Traefik

Ce Traefik est celui du cluster entier : le fichier reçoit aussi les requêtes de **gallerypack.app** et de **deck.altsessions.ch** (Ingress présent dans le cluster ; le 2026-10-22, son nom de domaine pointe vers un autre hébergeur, seules les requêtes qui arrivent quand même sur ce serveur sont journalisées), avec leur User-Agent. La politique de benevol.app ne couvre que les requêtes de benevol.app. Pour les autres sites, leur exploitant (le même propriétaire) applique la même durée et la même réduction, l'annonce dans leurs propres textes d'information, et vérifie leurs propres routes à jeton ou à secret dans l'URL : les exclusions de `k8s/ingressroute-tokens.yaml` ne protègent que benevol.app. Une violation touchant ce fichier concerne les trois sites. Pour séparer un jour les durées, filtrer sur `RequestHost` ou `RouterName`.

### Volume attendu

Constaté en octobre 2026, tous sites : environ 17 000 lignes et 5 Mo par jour au format texte actuel (environ 210 octets par ligne). Estimation, à confirmer après une semaine : une ligne JSON avec User-Agent est 3 à 4 fois plus longue, soit 10 à 15 Mo par jour avant compression et de l'ordre de 1 à 2 Mo compressés, donc **moins de 1 Go pour une année**, sur le disque système du nœud (`/var/log`). Ce n'est pas une limite : à surveiller, surtout si le trafic change d'ordre de grandeur (`sudo du -sh /var/log/traefik /var/log/traefik-archive`, `df -h /var/log`).

### Mise en place (sur le nœud, dans cet ordre)

Le répertoire et le fichier doivent exister **avant** d'appliquer la configuration de Traefik : avec `type: Directory`, un répertoire absent bloque le nouveau pod en `ContainerCreating` pendant que l'ancien continue de servir ; un fichier absent ou non inscriptible par l'utilisateur de Traefik (65532) le laisse démarrer **sans aucun journal d'accès** (« Unable to create access logger » dans ses messages) : la vérification ci-dessous le montre tout de suite, et `traefik-log-anonymise` le signale ensuite à son passage de 04:15 (fichier absent ou aucune ligne depuis 26 heures, donc au plus deux jours après la panne).

```bash
# 1. Répertoires et fichier actif : le répertoire appartient à root (groupe de Traefik, 65532,
#    en lecture seule) ; Traefik écrit seulement dans le fichier créé d'avance (0640), sans pouvoir
#    créer, renommer ni supprimer quoi que ce soit ; les archives, à côté, sont réservées à root
sudo install -d -o root -g 65532 -m 0750 /var/log/traefik
sudo test -e /var/log/traefik/access.log || sudo install -o 65532 -g 65532 -m 0640 /dev/null /var/log/traefik/access.log
sudo install -d -o root -g root -m 0700 /var/log/traefik-archive

# 2. Rotation (depuis une copie du dépôt sur le nœud, ou en collant le contenu des fichiers)
sudo install -o root -g root -m 0644 k8s/node/traefik-access.logrotate /etc/logrotate.d/traefik-access
sudo logrotate -d /etc/logrotate.d/traefik-access      # simulation : aucune erreur attendue

# 3. Réduction après 90 jours, suppression après un an, alerte : script et tâche quotidienne
sudo install -o root -g root -m 0755 k8s/node/traefik-log-anonymise /usr/local/sbin/traefik-log-anonymise
sudo install -o root -g root -m 0644 k8s/node/traefik-log-anonymise.cron /etc/cron.d/traefik-log-anonymise
sudo /usr/local/sbin/traefik-log-anonymise --dry-run    # aucun fichier encore : ne dit rien
```

Le nom installé dans `/etc/cron.d` ne doit pas contenir de point : cron ignore ces fichiers.

**Droits** : `/var/log/traefik` root:65532 0750 ; `access.log` 65532:65532 0640 (Traefik l'ouvre en ajout, sans pouvoir créer d'autre fichier ni toucher au répertoire) ; `/var/log/traefik-archive` root:root 0700, les fichiers tournés gardent 0640 ; `/var/lib/traefik-log-anonymise` root, fichiers 0640 au plus. Personne d'autre que root et Traefik ne lit ces journaux. Si `access.log` disparaît, Traefik ne peut pas le recréer : le recréer avec la commande de l'étape 1 (l'échec quotidien de `traefik-log-anonymise` le signale).

Puis, depuis un poste avec `kubectl` :

```bash
# 4. Traefik écrit dans le fichier ; le pod Traefik est remplacé (rolling update : l'ancien sert
#    jusqu'à ce que le nouveau soit prêt ; les connexions ouvertes se reconnectent, tous sites)
kubectl apply -f k8s/traefik-config.yaml
kubectl -n kube-system rollout status deploy/traefik
```

**Fichier de manifeste de k3s** : le `HelmChartConfig` `traefik` appartient aussi à l'Addon `traefik-config` de k3s, dont la source est `/var/lib/rancher/k3s/server/manifests/traefik-config.yaml` sur le nœud. Si ce fichier existe encore, k3s peut le réappliquer (au redémarrage de k3s, ou dès qu'il change) et revenir à l'ancienne configuration. Le comparer à `k8s/traefik-config.yaml` et l'aligner (copie du fichier du dépôt) dans la même intervention, ou le retirer si `kubectl apply` reste la seule source.

> **En production** : appliqué le 2026-10-23 en installant `k8s/traefik-config.yaml` comme `/var/lib/rancher/k3s/server/manifests/traefik-config.yaml` (k3s l'applique lui-même ; l'ancienne version est gardée dans `/root/traefik-config.yaml.avant-1095`). C'est désormais **ce fichier du nœud** qui fait foi : toute modification de `k8s/traefik-config.yaml` s'y recopie, un `kubectl apply` seul serait écrasé au prochain redémarrage de k3s. Le retour arrière remet l'ancienne version à cet endroit.

### Vérification

```bash
# Traefik a pris les réglages
kubectl -n kube-system get deploy traefik -o jsonpath='{.spec.template.spec.containers[0].args}' | tr , '\n' | grep accesslog
#   --accesslog.format=json, --accesslog.filepath=/var/log/traefik/access.log,
#   --accesslog.fields.headers.defaultmode=drop, --accesslog.fields.headers.names.User-Agent=keep
kubectl -n kube-system logs deploy/traefik | grep -i 'access logger'   # rien attendu

# Le site répond
curl -s -o /dev/null -w '%{http_code}\n' https://www.benevol.app/          # 200

# Sur le nœud : le fichier grossit, une ligne JSON par requête ; droits 0640, répertoire root
sudo ls -la /var/log/traefik/ /var/log/traefik-archive/
sudo tail -n 1 /var/log/traefik/access.log | python3 -m json.tool | grep -E 'ClientHost|RequestHost|request_|downstream_'
#   ClientHost, RequestHost et request_User-Agent ; aucune autre clé request_ ni downstream_ (en-têtes)

# Jeton factice : toujours aucune ligne (routeur sans journal d'accès)
curl -s -o /dev/null "https://www.benevol.app/my/verif-$(date +%s)"
sudo grep -c 'verif-' /var/log/traefik/access.log                          # 0

# Le lendemain : la rotation a tourné, le script ne signale rien
sudo ls -l /var/log/traefik-archive/            # access.log-AAAAMMJJ, puis .gz le jour suivant
sudo logrotate -d /etc/logrotate.d/traefik-access
journalctl -t traefik-log-anonymise --since -2d # aucun « error »

# Après 90 jours : réduction appliquée
sudo zcat "/var/log/traefik-archive/access.log-$(date -d '-90 days' +%Y%m%d).gz" | head -n 1   # ClientHost en x.y.z.0, sans request_User-Agent
```

Après un an, `sudo ls /var/log/traefik-archive/ | wc -l` se stabilise autour de 366 fichiers (celui de la veille non compressé, 365 compressés au plus).

### Retour arrière

```bash
# Traefik revient à la sortie standard (journaux visibles par kubectl logs, quelques heures seulement)
git show <commit-précédent>:k8s/traefik-config.yaml > /tmp/traefik-config.yaml
kubectl apply -f /tmp/traefik-config.yaml       # ou retirer logs.access.format/filePath/fields, deployment.additionalVolumes et additionalVolumeMounts
# en production, la source est le fichier du nœud : y remettre l'ancienne version (sauvegardée le 2026-10-23)
# sudo cp /root/traefik-config.yaml.avant-1095 /var/lib/rancher/k3s/server/manifests/traefik-config.yaml
```

Garder ou supprimer les fichiers déjà écrits est une décision à part : tant qu'ils existent, la politique annoncée (1 an, adresses réduites après 90 jours) doit continuer de s'appliquer, donc garder logrotate et `traefik-log-anonymise` jusqu'à la suppression du dernier fichier ; Traefik n'écrivant plus le fichier, l'alerte « not written » du script devient alors attendue chaque nuit, jusqu'au retrait de la tâche. Pour tout retirer d'un coup, sur le nœud : supprimer `/etc/cron.d/traefik-log-anonymise`, `/etc/logrotate.d/traefik-access`, le script de `/usr/local/sbin`, puis les répertoires `/var/log/traefik`, `/var/log/traefik-archive` et `/var/lib/traefik-log-anonymise`. Revenir aussi sur `src/lib/retention.ts` et la politique de confidentialité si ce qui est annoncé change.

Pour revenir aux en-têtes tous exclus (sans User-Agent) : retirer `fields.headers.names` de `k8s/traefik-config.yaml` et l'appliquer ; l'analyse ne sépare alors plus les robots des personnes.

## Journaux des conteneurs

> **État constaté en production le 2026-09-30** : rien de cette section n'est appliqué. Le nœud tourne avec les réglages par défaut de k3s (`containerLogMaxSize: 10Mi`, `containerLogMaxFiles: 5`), sans limite de durée. Voir `docs/rgpd/verifications-production.md`.

> **À vérifier sur le serveur** : les réglages ci-dessous suivent les conventions de k3s (kubelet intégré au binaire `k3s`, configuré par `/etc/rancher/k3s/config.yaml`). Ils n'ont pas pu être vérifiés depuis le dépôt : les tester sur le nœud avant de les considérer comme appliqués.

Une fois les journaux d'accès dans leur fichier, la sortie standard de Traefik ne contient plus que ses messages de fonctionnement : elle suit cette règle comme les autres conteneurs.

### Option A : kubelet de k3s (taille des journaux des conteneurs)

Sur k3s, il n'y a ni `/etc/kubernetes/kubelet-config.yaml` ni service `kubelet` : les options du kubelet passent par `kubelet-arg` dans `/etc/rancher/k3s/config.yaml`, sur chaque nœud :

```yaml
kubelet-arg:
  - "container-log-max-size=10Mi"
  - "container-log-max-files=5"
```

Puis redémarrer k3s (les pods continuent de tourner) :

```bash
systemctl restart k3s
```

Vérifier la configuration effective du kubelet :

```bash
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
kubectl get --raw "/api/v1/nodes/$NODE/proxy/configz" | jq '.kubeletconfig | {containerLogMaxSize, containerLogMaxFiles}'
```

> Ces options limitent la taille, pas la durée : un conteneur peu bavard garde ses journaux jusqu'à la suppression du pod. Pour une durée de 90 jours, compléter avec l'option B.

### Option B : logrotate sur le nœud (fichiers de `/var/log/pods`, ceux que lit `kubectl logs`)

Les journaux des conteneurs sont dans `/var/log/pods/<namespace>_<pod>_<uid>/<conteneur>/0.log`. Créer `/etc/logrotate.d/kubernetes` sur chaque nœud :

```
/var/log/pods/*/*/*.log {
    daily
    rotate 90
    compress
    missingok
    notifempty
    delaycompress
    copytruncate
}
```

Tester : `logrotate -d /etc/logrotate.d/kubernetes`

> Le kubelet fait déjà sa propre rotation dans ces dossiers et peut supprimer les copies de logrotate au-delà de `containerLogMaxFiles` : vérifier sur le nœud, après quelques jours, quels fichiers restent avant de compter sur cette option.

### Option C : Loki

Sans objet tant que Loki n'est pas installé : aucun Loki n'est déployé sur le cluster (`docs/rgpd/verifications-production.md`).

S'il l'est un jour, activer la rétention dans sa configuration (d'après la documentation de Loki 3, à confirmer selon la version installée) :

```yaml
# loki-config.yaml
limits_config:
  retention_period: 2160h   # 90 jours = 90 * 24h

compactor:
  working_directory: /loki/compactor
  delete_request_store: filesystem
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
```

Redéployer Loki après modification.

### Vérification

Après 90 jours ou plus, vérifier qu'aucun journal antérieur n'est accessible :

```bash
# Fichiers du nœud
find /var/log/pods -name "*.log*" -mtime +90

# Loki, s'il est installé : via logcli
logcli query '{namespace="benevoles"}' --from="$(date -d '91 days ago' --iso-8601=seconds)" --limit=1
```
