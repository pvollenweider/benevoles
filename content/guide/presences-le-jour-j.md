---
roles: [admin]
group: jour-j
order: 10
summary: Le jour J, suivre sur téléphone les créneaux en cours et à venir, et marquer les présences à l'arrivée des bénévoles.
related: [suivre-les-inscriptions, rapports-badges-et-resume]
legacy: [admin#presences-le-jour-j]
aliases: []
---

# Présences le jour J

> « Le jour de la manifestation, j'ai surtout besoin de savoir qui arrive, à quelle heure et pour quel poste. »
>
> Noah, responsable d'équipe

<!-- video: ATTENDANCE_CHECK_IN -->

De la veille du premier jour au dernier jour de l'événement, ses pages affichent un onglet **Jour J** et, pour un événement publié, le bouton principal **Ouvrir le jour J** en haut. Cette page est faite pour le téléphone, sur place :

- **En cours** : les créneaux commencés et pas encore terminés, y compris un créneau de nuit commencé la veille. **Dans les 3 prochaines heures** : ceux qui commencent bientôt, même après minuit. Les heures sont celles du fuseau de l'organisation. Les créneaux sont regroupés par heure de début, puis par poste.
- **Plus tôt aujourd'hui** : les créneaux déjà terminés, repliés ; touchez la ligne pour les afficher, par exemple pour marquer une arrivée oubliée.
- Pour chaque créneau : les horaires, « N présents sur M attendus », les places encore libres (« Il manque 1 personne ») et, s'il est renseigné, le contact du créneau avec son téléphone.
- Pour chaque personne attendue (inscriptions confirmées seulement) : son nom, son état (**Présent** ou **Pas encore marqué**), son téléphone, qu'un toucher appelle, et un bouton **Marquer présent**, qui devient **Annuler la présence** une fois la marque posée. C'est la même action que **Marquer présents** dans les inscriptions : même règle, même ligne dans le journal. Ni email, ni réponses aux questions, ni notes sur cette page.
- **Rechercher un bénévole ou un poste** filtre la page sans se soucier des accents ni des majuscules (« zoe » trouve Zoé) : un poste trouvé garde toutes ses personnes.
- La page se met à jour seule toutes les 25 secondes environ tant qu'elle est ouverte à l'écran, et dès que vous y revenez ou que le réseau revient : une présence marquée sur un autre téléphone y apparaît sans rien toucher. Votre recherche, la personne que vous êtes en train de marquer et votre position dans la page restent en place. L'heure de la dernière mise à jour réussie est affichée au-dessus ; sans réseau, ou si la mise à jour n'aboutit pas, un encadré le dit et rappelle l'heure de la liste affichée. **Actualiser** relit la liste tout de suite.
- En bas, des liens vers les inscriptions, « Où manque-t-il du monde ? » et l'écriture aux bénévoles.

![Page « Jour J » sur un téléphone : l'heure de mise à jour avec le bouton « Actualiser », la recherche, puis « En cours » : le créneau Comptage en rayon de 16 h à 19 h, « 1 présent sur 2 attendus. Il manque 1 personne. », le contact du créneau, Aline Dupraz, avec son téléphone, puis David Pasche « Pas encore marqué » avec le bouton « Marquer présent » et Céline Ruchet « Présent » avec le bouton « Annuler la présence », chacun avec son téléphone](/doc-img/admin-day-of.png)

La page reste accessible en dehors des dates, par exemple depuis un favori enregistré sur le téléphone : elle le signale et n'affiche que ce qui tombe dans la fenêtre du moment. Elle est ouverte aux propriétaires et aux organisateurs, pas aux responsables de secteur.

Dans un événement organisé par secteurs (bêta), le champ **Secteur**, au-dessus de la recherche, limite la page aux postes d'un secteur, ou à « Autres postes » : pratique quand chaque responsable suit son secteur sur son téléphone. La mise à jour automatique garde ce choix, et les liens du bas aussi. Le choix figure dans l'adresse de la page, à garder en favori.

## Depuis les inscriptions

Sans terminal ni badge : dans les [inscriptions](suivre-les-inscriptions.md), sélectionnez les lignes des personnes arrivées et cliquez **Marquer présents**. Un badge **Présent** apparaît sur la ligne, le compteur « N présents sur M inscrits » se met à jour, et l'action est notée dans le journal. **Annuler la présence** retire la marque (sélection de lignes déjà marquées). Seules les inscriptions confirmées peuvent être marquées.

**Exporter les présences (CSV)**, en haut de la page des inscriptions, télécharge la feuille de présence : une ligne par inscription confirmée avec prénom, nom, email, téléphone, poste, créneau, date, horaires, présent oui/non, la date et l'heure du pointage (fuseau de l'organisation), puis une colonne par question de l'événement. Elle s'ouvre directement dans Excel ou LibreOffice.

Les présences enregistrées font les heures attestées des membres (voir [Gérer les membres](gerer-les-membres.md)).
