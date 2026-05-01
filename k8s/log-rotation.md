# Rétention des logs — 90 jours (conformité politique de confidentialité)

## Option A — Kubelet (logs containers stdout/stderr)

Configurer sur chaque nœud dans `/etc/kubernetes/kubelet-config.yaml` :

```yaml
containerLogMaxSize: "50Mi"   # taille max par fichier de log
containerLogMaxFiles: 5       # nombre de fichiers rotatifs par container
```

Puis redémarrer kubelet :
```bash
systemctl restart kubelet
```

> ⚠️ Ces options limitent la taille, pas la durée. Pour un TTL de 90 jours,
> complémenter avec logrotate (Option B) ou un stack de logs centralisé (Option C).

---

## Option B — logrotate sur les nœuds (logs kubectl)

Créer `/etc/logrotate.d/kubernetes` sur chaque nœud :

```
/var/log/pods/*/*.log {
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

---

## Option C — Loki (recommandé si déjà déployé)

Dans la ConfigMap de Loki, activer la rétention :

```yaml
# loki-config.yaml
limits_config:
  retention_period: 2160h   # 90 jours = 90 * 24h

compactor:
  working_directory: /loki/compactor
  shared_store: filesystem
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
```

Redéployer Loki après modification.

---

## Vérification

Après 90+ jours, vérifier qu'aucun log antérieur n'est accessible :

```bash
# Loki : via logcli
logcli query '{namespace="benevoles"}' --from="$(date -d '91 days ago' --iso-8601=seconds)" --limit=1

# Fichiers directs
find /var/log/pods -name "*.log" -mtime +90
```
