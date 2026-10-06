---
roles: [admin]
group: jour-j
order: 20
summary: Les plannings et listes à imprimer, les badges des bénévoles, le résumé pour faire le bilan et l'archive complète d'un événement.
related: [presences-le-jour-j, exporter-et-conserver-ses-donnees, questions-aux-benevoles]
legacy: [admin#exports, admin#rapports, admin#badges, admin#resume-de-l-evenement]
aliases: []
---

# Rapports, badges et résumé

<!-- video: EVENT_REPORTS -->

## Rapports

**`/admin/events/[id]/print`**, depuis la page de l'événement (**Rapports**). Des documents à imprimer ou enregistrer en PDF depuis le navigateur, chacun ouvert dans un nouvel onglet ; l'archive de l'événement se télécharge :

![Page « Rapports » d'un événement : les plannings à remettre aux bénévoles (par jour, par poste, individuel), puis la section réservée aux organisateurs, qui commence par l'export complet](/doc-img/admin-print.png)

| Document | Contenu | Pour qui |
|---|---|---|
| Planning par jour | pour chaque jour, la frise des postes avec les prénoms dans les créneaux, puis le détail avec les places libres | affichage, bénévoles |
| Planning par poste | une page par poste : sa frise, ses créneaux, ses bénévoles, son responsable de secteur | chaque responsable |
| Planning individuel | une page par bénévole : sa journée en frise, puis chaque créneau avec lieu de rendez-vous, contact (celui du créneau, sinon le contact le jour J de l'événement, avec la phrase sur les numéros d'urgence) et consignes | à remettre à l'arrivée |
| Export complet | le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles avec leurs coordonnées (en couleur) | organisateurs seulement (téléphones et emails) |
| Feuille de présence | par créneau, une case à cocher par bénévole (déjà cochée si la présence a été marquée dans l'application), heure d'arrivée, remarque, et des lignes vides pour les arrivées imprévues | organisateurs |
| Liste avec téléphones | tous les bénévoles par ordre alphabétique, téléphone, email et créneaux | organisateurs seulement |
| Synthèse des réponses | par question posée aux bénévoles, le nombre de réponses des confirmés et des personnes en attente, sans nom ni coordonnées (voir [Synthèse des réponses](questions-aux-benevoles.md#synthese-des-reponses)) | organisateurs, ou pour passer commande |
| Archive de l'événement (JSON) | un fichier téléchargé avec toutes les données de l'événement : réglages, créneaux, inscriptions, pages, responsables, jalons et journal | vos archives, ou pour changer d'outil |

Sauf l'export complet, ces documents sont conçus pour le noir et blanc ; le logo de l'organisation, s'il y en a un, figure en gris à côté du titre. La feuille de présence en CSV se télécharge depuis les inscriptions (voir [Présences le jour J](presences-le-jour-j.md)). Les heures planifiées des membres n'y figurent jamais ; les documents avec téléphones portent la mention « ne pas afficher ni distribuer ».

## Badges

Depuis **Rapports**, la section **Badges** imprime un badge d'identification par bénévole inscrit : prénom en grand et poste(s), toujours imprimés ; nom de famille et créneaux, cochés par défaut, peuvent être retirés. **Couleur du bandeau** : celle du poste (à défaut celle de l'événement), celle de l'événement, ou noir et blanc. Le logo de l'organisation, s'il y en a un, figure dans un coin de chaque badge (en gris avec le bandeau noir et blanc). Dix badges par feuille A4, à découper sur les pointillés. Filtre par **Poste**, et liste **Bénévole (réimpression)** pour réimprimer un badge perdu (deux homonymes y sont distingués par leur email) ; avec un poste choisi, seuls ses créneaux sur ce poste figurent sur le badge. Pas de photo ni de code QR : un badge peut être photographié ou perdu, il ne porte donc aucun lien vers les données du bénévole.

## Résumé de l'événement

Toujours depuis **Rapports**, la section **Résumé de l'événement** (juste avant l'archive) donne de quoi faire le bilan et préparer la prochaine édition :

- nombre de bénévoles distincts avec un créneau confirmé, dont ceux de retour et ceux pour la première fois (pas d'inscription active sur un événement antérieur de l'organisation) ;
- nombre de créneaux confirmés avec une présence enregistrée sur le total, avec une phrase explicite si le pointage n'a pas été utilisé ou seulement en partie ;
- heures planifiées (le total des créneaux confirmés) et, parmi elles, les heures attestées (présence enregistrée), par exemple « 46 h planifiées, dont 38 h attestées » ;
- taux de remplissage global puis par poste, chiffres à l'appui (« 46 places occupées sur 52 ») ;
- la liste des créneaux restés incomplets.

Tant que l'événement n'est pas terminé, un bandeau rappelle que ces chiffres sont provisoires. Mêmes règles de comptage que l'attestation de bénévolat et l'export « Heures par bénévole » (voir [Gérer les membres](gerer-les-membres.md)) : seules les inscriptions actives sur un créneau jamais annulé comptent.
