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

**Événements**, puis l'événement, puis l'onglet **Créneaux**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

![Page des créneaux d'un événement : choix Frise ou Liste, boutons « Créer une série », « Répéter chaque semaine » et « + Ajouter un créneau », puis la frise, un bloc par jour, avec les postes en lignes et les créneaux en barres colorées par poste](/doc-img/admin-shifts.png)

## Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. Le champ propose d'abord les postes de l'événement qui ont encore un créneau non annulé, tous jours confondus, puis des exemples. Si vous choisissez un poste existant (majuscules et espaces ne comptent pas), le créneau le rejoint et prend ses réglages : une phrase sous le champ le rappelle (voir [Gérer les postes](gerer-les-postes.md)). |
| Libellé | Intitulé spécifique (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin, de `00:00` à `23:59` (voir [Horaires et créneaux de nuit](horaires-et-nuit.md)) |
| Places | Nombre maximum de bénévoles |
| Minimum (optionnel) | Nombre de personnes sous lequel le créneau ne peut pas tourner, de 1 au nombre de places (ex. : `2` pour un bar prévu à 4). Vide : le créneau a besoin de toutes ses places. Voir [Minimum de personnes](#minimum-de-personnes). |
| Description | Texte court, qui n'est affiché ni sur la page publique ni dans les emails. Ce n'est pas un champ confidentiel : pour ce qui doit rester à l'organisation, utilisez les notes internes ; pour ce que les bénévoles doivent savoir, les infos pratiques |
| Infos pratiques pour les bénévoles | Lieu de rendez-vous et consigne pratique, visibles sur la page publique d'inscription et dans les emails ; personne de contact (nom, téléphone), envoyée seulement aux inscrits (email de confirmation, rappels, page personnelle), jamais affichée publiquement, sous le libellé « Contact pour ce créneau ». Sans contact sur le créneau, les bénévoles confirmés voient le **Contact le jour J** de l'événement, s'il est renseigné. Facultatifs, courts : pas de fiche de mission. |
| Notes internes | Jamais montrées aux bénévoles |
| Âge minimum (optionnel) | Condition d'âge pour ce poste (ex. : `18` pour un poste avec permis de conduire). Affiché en info sur le planning public ; vérifié à l'inscription : voir [Âge minimum sur un poste](age-minimum.md). |
| Activer la liste d'attente | Une fois le créneau complet, les bénévoles peuvent s'inscrire en liste d'attente : voir [Liste d'attente](liste-d-attente.md) |
| Sur validation | Chaque inscription devient une demande à accepter ou refuser : voir [Inscriptions sur validation](inscriptions-sur-validation.md) |

## Minimum de personnes

Un créneau peut fonctionner avec moins de monde que prévu : un bar prévu à 4 tourne à 2. Le **minimum** le dit, pour voir quels créneaux sont vraiment à risque. Chaque créneau qui en a un se trouve dans l'un de ces trois états, toujours écrits en toutes lettres à côté des chiffres :

- **sous le minimum** : moins de personnes que le minimum, par exemple « 1/4 · sous le minimum (2) » ; c'est le plus urgent ;
- **minimum atteint** : le créneau peut tourner, sans être complet, par exemple « 2/4 · minimum atteint » ;
- **complet** : toutes les places sont prises.

Comptent les inscriptions confirmées et les demandes à traiter des créneaux sur validation, qui gardent leur place ; la liste d'attente ne compte pas. Sur le planning des créneaux, une demande n'est comptée qu'une fois acceptée, comme les « inscrits ».

Le minimum va de 1 au nombre de places. Pour baisser les places sous le minimum, baissez d'abord le minimum (un message le rappelle). Un créneau sans minimum s'affiche sans ces mentions.

Le minimum apparaît sur le planning des créneaux (avec un cadre en pointillés autour d'un créneau sous son minimum), dans [Où manque-t-il du monde ?](ou-manque-t-il-du-monde.md), dans **Chercher des bénévoles**, sur le tableau de bord, sur la page des responsables de secteur, dans le résumé de l'événement et dans les plannings imprimés par jour et par poste. La page publique n'en dit rien : les bénévoles voient seulement les places libres. Il se règle dans le formulaire du créneau, dans [Créer une série de créneaux](creer-une-serie-de-creneaux.md) et depuis le planning (voir [Modifier vite depuis le planning](modifier-vite-depuis-le-planning.md), où **Appliquer au poste** l'applique avec les places, pour ce jour ou tout l'événement). Il est copié quand on duplique le créneau ou l'événement.

Un créneau est créé ouvert ; son état (inscriptions ouvertes, fermées, complet, créneau annulé) se change ensuite depuis le planning (voir [Modifier vite depuis le planning](modifier-vite-depuis-le-planning.md)).

Pour couvrir une plage horaire avec des créneaux qui se suivent, voir [Créer une série de créneaux](creer-une-serie-de-creneaux.md) ; pour une permanence qui revient chaque semaine, voir [Permanences récurrentes](permanences-recurrentes.md). Pour renommer, réordonner ou colorer les postes, voir [Gérer les postes](gerer-les-postes.md).

## Questions fréquentes

### J'organise un événement sur plusieurs jours avec des postes différents chaque jour : comment je structure ça ?

Un seul événement, un seul planning : la timeline des créneaux affiche chaque jour de l'événement l'un sous l'autre. Créez un poste par type de mission (« Sécurité », « Bar »…) une seule fois : il regroupe automatiquement tous ses créneaux, même sur des jours différents et avec des horaires ou des capacités qui changent d'un jour à l'autre.
