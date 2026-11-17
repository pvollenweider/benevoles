# Vos données et votre événement restent entre vos mains

Cette page explique comment benevol.app protège vos données, comment préparer votre événement pour qu'il ne dépende pas du service le jour même, et ce que le service hébergé ne garantit pas aujourd'hui.

## Vos données sont sauvegardées et restent récupérables

- La base de données est sauvegardée chaque nuit sur le serveur, en France. Chaque sauvegarde est chiffrée.
- Une copie chiffrée part chaque nuit en Suisse. Le prestataire qui la conserve n'a pas la clé et ne peut pas la lire.
- Les sauvegardes sont gardées 30 jours sur le serveur et 90 jours pour la copie en Suisse.
- La restauration de la copie conservée en Suisse est testée régulièrement.
- Une alerte est envoyée automatiquement si une sauvegarde échoue ou n'est pas effectuée dans le délai prévu.

Sans attendre une sauvegarde, vous pouvez exporter vous-même, à tout moment, vos membres, votre journal d'activité et l'archive complète d'un événement. En savoir plus : [exporter et conserver ses données](../guide/exporter-et-conserver-ses-donnees.md).

## Votre planning reste utilisable même si le service ne répond pas

Avant l'événement, deux gestes suffisent :

- imprimer le planning et les feuilles de présence, depuis les [documents à imprimer](../guide/rapports-badges-et-resume.md#documents-a-imprimer) ;
- exporter la liste de vos membres.

Avec ces documents, l'accueil des bénévoles se fait sur papier le jour même.

## Savoir si le service fonctionne

La page [État du service](https://statut.benevol.app) vérifie toutes les 5 minutes, depuis l'extérieur du serveur, que le site, l'application et les vidéos répondent. Elle reste accessible pendant une panne, la signale avec sa durée et garde l'historique des incidents.

## Le logiciel ne vous enferme pas

- Le code est libre, publié sous licence AGPL : chacun peut le lire, le reprendre et le faire évoluer. La page [Logiciel libre](LOGICIEL-LIBRE-BENEVOLES.md) dit ce que cette licence permet.
- Une association ou une fédération peut l'installer sur son propre serveur.
- Vos données s'exportent dans des formats standards et réutilisables. Les membres, les heures, les présences, les réponses et le journal d'activité s'exportent en CSV, un format que tout tableur ouvre. L'archive complète d'un événement s'exporte en JSON, un format lisible par d'autres logiciels.

benevol.app est aujourd'hui conçu et maintenu par Philippe Vollenweider. Le code et vos données ne sont pas enfermés dans ce service pour autant : les données s'exportent, le logiciel est libre et peut être installé sur un autre serveur.

## Les limites actuelles du service hébergé

- Le service hébergé n'offre pas de garantie contractuelle de disponibilité.
- Il n'y a pas de contrat de support. Les questions passent par [contact@benevol.app](mailto:contact@benevol.app).
- Une restauration remet toute la base à l'état d'une nuit donnée ; il n'est pas possible de restaurer les données d'une seule organisation.
- En cas d'arrêt définitif du service hébergé, les organisations seront informées au moins trois mois à l'avance afin de pouvoir exporter leurs données ou préparer une autre solution.

Les [conditions d'utilisation](/legal/terms) font foi.

## Questions fréquentes

### Que faire si le service ne répond pas le jour de mon événement ?

Utilisez le planning et les feuilles de présence imprimés avant l'événement. La page [État du service](https://statut.benevol.app) dit si une panne est en cours.

### Puis-je récupérer mes données si je change d'outil ?

Oui. Vos membres, votre journal d'activité et l'archive complète d'un événement s'exportent à tout moment.

### Une association peut-elle installer benevol.app chez elle ?

Oui, le code est libre. La page [Tarifs](TARIFS.md) explique la différence entre le logiciel et le service hébergé.
