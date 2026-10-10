---
roles: [admin]
group: preparer
order: 30
summary: Poser les créneaux d'un événement sur le planning : poste, horaires, places, infos pratiques et notes internes.
related: [creer-une-serie-de-creneaux, horaires-et-nuit, modifier-vite-depuis-le-planning, gerer-les-postes]
legacy: [admin#configurer-les-creneaux, admin#ajouter-un-creneau]
aliases: []
---

# Configurer les créneaux

<!-- video: SHIFTS_ROLES_VIEWS -->

**Événements**, puis l'événement, puis **Gérer les créneaux**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

![Frise des créneaux d'un événement, un bloc par jour, avec les postes en lignes et les créneaux en barres colorées par poste](/doc-img/admin-shifts.png)

## Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. |
| Libellé | Intitulé spécifique (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin, de `00:00` à `23:59` (voir [Horaires et créneaux de nuit](horaires-et-nuit.md)) |
| Capacité | Nombre maximum de bénévoles |
| Description | Texte court, qui n'est affiché ni sur la page publique ni dans les emails. Ce n'est pas un champ confidentiel : pour ce qui doit rester à l'organisation, utilisez les notes internes ; pour ce que les bénévoles doivent savoir, les infos pratiques |
| Infos pratiques pour les bénévoles | Lieu de rendez-vous et consigne pratique, visibles sur la page publique d'inscription et dans les emails ; personne de contact (nom, téléphone), envoyée seulement aux inscrits (email de confirmation, rappels, page personnelle), jamais affichée publiquement, sous le libellé « Contact pour ce créneau ». Sans contact sur le créneau, les bénévoles confirmés voient le **Contact le jour J** de l'événement, s'il est renseigné. Facultatifs, courts : pas de fiche de mission. |
| Notes internes | Jamais montrées aux bénévoles |
| Âge minimum (optionnel) | Condition d'âge pour ce poste (ex. : `18` pour un poste avec permis de conduire). Affiché en info sur le planning public ; vérifié à l'inscription : voir [Âge minimum sur un poste](age-minimum.md). |
| Activer la liste d'attente | Une fois le créneau complet, les bénévoles peuvent s'inscrire en liste d'attente : voir [Liste d'attente](liste-d-attente.md) |
| Sur validation | Chaque inscription devient une demande à accepter ou refuser : voir [Inscriptions sur validation](inscriptions-sur-validation.md) |

Un créneau est créé ouvert ; son état (inscriptions ouvertes, fermées, complet, créneau annulé) se change ensuite depuis le planning (voir [Modifier vite depuis le planning](modifier-vite-depuis-le-planning.md)).

Pour couvrir une plage horaire avec des créneaux qui se suivent, voir [Créer une série de créneaux](creer-une-serie-de-creneaux.md) ; pour une permanence qui revient chaque semaine, voir [Permanences récurrentes](permanences-recurrentes.md). Pour renommer, réordonner ou colorer les postes, voir [Gérer les postes](gerer-les-postes.md).

## Questions fréquentes

### J'organise un événement sur plusieurs jours avec des postes différents chaque jour : comment je structure ça ?

Un seul événement, un seul planning : la timeline des créneaux affiche chaque jour de l'événement l'un sous l'autre. Créez un poste par type de mission (« Sécurité », « Bar »…) une seule fois : il regroupe automatiquement tous ses créneaux, même sur des jours différents et avec des horaires ou des capacités qui changent d'un jour à l'autre.
