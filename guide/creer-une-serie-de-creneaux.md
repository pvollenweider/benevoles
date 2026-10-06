---
roles: [admin]
group: preparer
order: 40
summary: Couvrir une plage horaire avec des créneaux qui se suivent, de même durée, en une seule saisie avec un aperçu.
related: [configurer-les-creneaux, horaires-et-nuit]
legacy: [admin#creer-une-serie-de-creneaux]
aliases: []
---

# Créer une série de créneaux

<!-- video: SHIFT_CREATE_SERIES -->

Pour couvrir une plage horaire avec des créneaux qui se suivent (une buvette de 10 h à 22 h par créneaux de deux heures, trois personnes à chaque fois), cliquez sur **Créer une série** dans la page des créneaux au lieu de saisir chaque créneau.

| Champ | Description |
|-------|-------------|
| Poste, libellé | Comme pour un créneau seul (voir [Configurer les créneaux](configurer-les-creneaux.md)) |
| Date, début, fin | La plage à couvrir ; une fin plus petite que le début passe minuit |
| Durée d'un créneau | Choix courant (30 min à 4 h) ou saisie en minutes (15 au minimum) |
| Pause entre deux créneaux | Facultative, en minutes |
| Personnes par créneau, **Activer la liste d'attente**, **Sur validation** | Appliqués à chaque créneau |

L'aperçu se met à jour au fur et à mesure : nombre de créneaux, horaires de chacun. Si la plage ne se divise pas exactement, le dernier créneau est plus court (indiqué dans l'aperçu) ; supprimez-le ensuite s'il ne sert pas. Les créneaux qui commencent après minuit sont datés du lendemain. Une série compte au plus 48 créneaux.

Une fois créés, ce sont des créneaux ordinaires : chacun se modifie ou se supprime séparément.
