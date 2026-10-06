---
roles: [admin]
group: preparer
order: 50
summary: Saisir les horaires d'un créneau de 00:00 à 23:59, et poser un créneau qui passe minuit ou commence après minuit.
related: [configurer-les-creneaux, creer-une-serie-de-creneaux]
legacy: [admin#horaires-et-nuit]
aliases: []
---

# Horaires et créneaux de nuit

<!-- video: SHIFT_NIGHT_DST -->

L'horloge va de `00:00` à `23:59` : on ne saisit jamais `24:00`, `25:00` ou `26:00`, l'horloge repart à zéro après minuit.

- **Créneau qui passe minuit** : saisissez une heure de fin plus petite que le début, par exemple `22:00` à `02:00`. Il est affiché « 22h–02h +1 » sur le planning.
- **Créneau qui commence après minuit** : il appartient au jour suivant. Créez-le à la date du lendemain, à `00:00`, `01:00`, etc.
- Un créneau qui se termine exactement à minuit s'écrit avec `00:00` comme fin (`22:00` à `00:00`).
- Les heures invalides (`26:00`, `-2:30`, `12:75`) sont refusées avec un message. Sur le planning administrateur, glisser une barre ne permet pas de sortir de la journée.

Dans une série de créneaux, une fin plus petite que le début passe aussi minuit, et les créneaux qui commencent après minuit sont datés du lendemain (voir [Créer une série de créneaux](creer-une-serie-de-creneaux.md)).
