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

- **Créneau qui passe minuit** : saisissez une heure de fin plus petite que le début, par exemple `22:00` à `02:00`. Il est affiché « 22h–02h +1 » sur le planning public, et « 22:00–02:00 (jusqu'au lendemain) » dans la vue Liste des créneaux.
- **Créneau qui commence après minuit** : il appartient au jour suivant. Créez-le à la date du lendemain, à `00:00`, `01:00`, etc.
- Un créneau qui se termine exactement à minuit s'écrit avec `00:00` comme fin (`22:00` à `00:00`).
- Changer l'heure de début d'un créneau de nuit garde sa fin du lendemain : `22:00` à `02:00` passé à `23:00` finit toujours à `02:00`. La fin ne change que si elle tomberait à l'heure du nouveau début, ou si un créneau de jour passerait minuit seulement parce que son début a dépassé sa fin : elle devient alors une heure après le début.
- Les heures invalides (`26:00`, `-2:30`, `12:75`) sont refusées avec un message. Sur le planning des organisateurs, glisser une barre ne permet pas de sortir de la journée, sauf la fin d'un créneau qui passe déjà minuit : elle se glisse jusqu'au lendemain matin.

Dans une série de créneaux, une fin plus petite que le début passe aussi minuit, et les créneaux qui commencent après minuit sont datés du lendemain (voir [Créer une série de créneaux](creer-une-serie-de-creneaux.md)).
