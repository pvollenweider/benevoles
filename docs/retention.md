# Conservation des données

La politique de conservation, avec pour chaque donnée sa finalité, sa durée, ce qui la déclenche et ce qui l'efface. Source unique : `src/lib/retention.ts`. Le nettoyage quotidien (`/api/cron/cleanup`) lit ses durées dans ce fichier, et un test vérifie que ce tableau, celui du guide administrateur, la politique de confidentialité et la rotation des sauvegardes (`k8s/cronjob-backup*.yaml`) disent la même chose. Pour régénérer les tableaux : `npm run retention:docs`.

Une durée annoncée est reliée à un traitement automatique, ou à une procédure manuelle explicitement signalée comme telle. Une donnée effacée de la base reste dans les sauvegardes jusqu'à leur rotation : elle n'en disparaît pas immédiatement.

<!-- retention:start (généré depuis src/lib/retention.ts, npm run retention:docs) -->
| Données | Finalité | Durée | Déclencheur | Mécanisme | Dans les sauvegardes |
|---|---|---|---|---|---|
| Membres, événements, créneaux, inscriptions, pages, journaux d'activité | Organiser les événements de l'organisation | tant que l'organisation est active ; effacés 30 jours après sa désactivation | désactivation de l'organisation | nettoyage quotidien (cron cleanup), suppression en cascade | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Événement supprimé par un administrateur | — | effacé immédiatement, avec ses créneaux, inscriptions et invitations | suppression définitive d'un événement archivé | suppression en cascade | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Emails en file d'envoi (destinataire et contenu) | Envoyer les emails | effacés chaque nuit une fois partis ; ceux en échec après 30 jours | envoi, ou échec définitif | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Messages ciblés (objet, texte, public, nombres) | Historique des communications de l'événement | 365 jours, ou avec l'événement | envoi du message | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Comptes administrateurs désactivés | Permettre une réactivation | effacés après 30 jours | désactivation ou retrait du compte | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Bénévoles sans organisation ni inscription | — | effacés au nettoyage suivant | plus aucune inscription ni organisation | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Jetons de réinitialisation de mot de passe expirés | Sécurité | effacés dès leur expiration, au nettoyage suivant | expiration | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Compteurs de limitation de fréquence (adresse IP ou identifiant) | Protéger contre les abus | effacés à la fin de leur fenêtre (au plus 1 heure) | fin de la fenêtre | nettoyage quotidien (cron cleanup) | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Abonnements aux notifications du navigateur | Envoyer les rappels et messages sur l'appareil | jusqu'au désabonnement, ou dès que le service de notification signale l'appareil disparu | désabonnement ou réponse 404/410 du service | suppression à l'envoi | oui, jusqu'à 30 jours sur le serveur et 90 jours hors site |
| Sauvegardes chiffrées de la base | Restaurer après un incident | 30 jours sur le serveur, 90 jours en copie hors site | création de la sauvegarde | rotation par les CronJobs de sauvegarde (k8s/cronjob-backup*.yaml) | — |
| Journaux techniques des conteneurs | Sécurité et débogage | 90 jours | écriture du journal | procédure manuelle : rotation sur les nœuds (k8s/log-rotation.md), à vérifier sur le serveur | non |
| Exports (CSV, JSON, PDF, calendrier) | Sortir ses données | rien n'est conservé : générés à la demande | — | — | non |
<!-- retention:end -->
