---
roles: [admin]
group: preparer
order: 45
summary: Une permanence qui revient chaque semaine se décrit une fois ; toutes ses dates sont créées, jours fériés et fermetures exclus.
related: [creer-une-serie-de-creneaux, configurer-les-creneaux]
legacy: []
aliases: []
---

# Permanences récurrentes

Pour une activité qui revient toute l'année (l'accueil du mercredi après-midi, la distribution du samedi matin, la caisse d'une épicerie participative), cliquez sur **Répéter chaque semaine** dans la page des créneaux : vous décrivez la permanence une fois, et toutes ses dates sont créées.

L'événement porte la période : pour une saison de septembre à juin, donnez à l'événement ces dates de début et de fin, puis ajoutez-y vos permanences.

| Champ | Description |
|-------|-------------|
| Poste, libellé | Comme pour un créneau seul (voir [Configurer les créneaux](configurer-les-creneaux.md)) |
| Du, au | La période de la permanence, à l'intérieur de celle de l'événement |
| Jours | Un ou plusieurs jours de la semaine |
| Rythme | Chaque semaine, ou une semaine sur deux (à partir de la semaine de la date de début) |
| Début, fin, découpage | La plage horaire de chaque jour : un seul créneau sur toute la plage, ou des créneaux d'une heure à quatre heures qui se suivent |
| Personnes par créneau, **Activer la liste d'attente**, **Sur validation** | Appliqués à chaque créneau |
| Jours fériés exclus | France (jours fériés nationaux) ou Suisse (jours fériés communs à la plupart des cantons) ; ceux d'un seul canton ou d'une seule région s'ajoutent comme fermetures |
| Fermetures | Les dates sans permanence (vacances, fermeture du local) |

L'aperçu donne le nombre de dates et de créneaux, les premières dates, et chaque date exclue avec sa raison (jour férié ou fermeture). Une permanence compte au plus 500 créneaux : pour plus, raccourcissez la période ou espacez les créneaux.

Une fois créés, ce sont des créneaux ordinaires : les bénévoles s'y inscrivent comme aux autres, les rappels partent avant chacun, et chaque date se modifie ou se supprime séparément.

## Modifier ou arrêter une permanence

Les permanences de l'événement sont listées sous **Permanences récurrentes**, avec leur rythme, leur période et le nombre de dates à venir.

- **Modifier à partir d'une date** : le nombre de personnes par créneau, et les horaires pour une permanence d'un seul créneau par jour, changent sur toutes les dates à partir du jour choisi. Les dates précédentes et les créneaux annulés ne bougent pas. Les bénévoles inscrits reçoivent un email si l'horaire change. Un nombre de personnes plus petit que les inscrits d'une date est refusé, et ces dates sont listées.
- **Arrêter à partir d'une date** : les dates sans inscrit sont supprimées. Si des dates ont déjà des inscrits, elles sont d'abord listées avec leur nombre d'inscrits, et rien ne change ; elles ne sont annulées, avec un email à chaque personne, que si vous confirmez. Arrêter à partir de la première date retire la permanence de la liste.

Pour changer une seule date, modifiez ou supprimez son créneau comme n'importe quel autre.

## Ce que voient les bénévoles

Un événement qui dure quatre semaines ou plus (une saison) n'affiche plus les jours passés, et personne ne peut s'inscrire à une date déjà passée. À partir de huit dates, la page les présente mois par mois : un bouton par mois indique le nombre de dates, et le premier mois avec des dates à venir s'affiche d'abord.

## Dupliquer une saison

En dupliquant l'événement avec ses créneaux, chaque permanence est recréée pour la nouvelle période sur les mêmes jours de la semaine, avec les jours fériés de la nouvelle année. Les fermetures, propres à une année, ne sont pas reprises : ajoutez celles de la nouvelle saison.

