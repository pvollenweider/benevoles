# Rétention des journaux : 90 jours

La politique de conservation fixe à 90 jours les journaux techniques des conteneurs ([docs/retention.md](../docs/retention.md), `technicalLogs` dans `src/lib/retention.ts`). Ce document décrit comment l'appliquer sur le nœud k3s. Les journaux d'accès de Traefik (`kubectl -n kube-system logs deploy/traefik`) sont des journaux de conteneur comme les autres et suivent la même rotation.

> **État constaté en production le 2026-09-30** : rien de ce document n'est appliqué. Le nœud tourne avec les réglages par défaut de k3s (`containerLogMaxSize: 10Mi`, `containerLogMaxFiles: 5`), sans limite de durée. Voir `docs/rgpd/verifications-production.md`.

> **À vérifier sur le serveur** : les réglages ci-dessous suivent les conventions de k3s (kubelet intégré au binaire `k3s`, configuré par `/etc/rancher/k3s/config.yaml`). Ils n'ont pas pu être vérifiés depuis le dépôt : les tester sur le nœud avant de les considérer comme appliqués.

## Option A : kubelet de k3s (taille des journaux des conteneurs)

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

## Option B : logrotate sur le nœud (fichiers de `/var/log/pods`, ceux que lit `kubectl logs`)

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

## Option C : Loki

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

## Vérification

Après 90 jours ou plus, vérifier qu'aucun journal antérieur n'est accessible :

```bash
# Fichiers du nœud
find /var/log/pods -name "*.log*" -mtime +90

# Loki, s'il est installé : via logcli
logcli query '{namespace="benevoles"}' --from="$(date -d '91 days ago' --iso-8601=seconds)" --limit=1
```
