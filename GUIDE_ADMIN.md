# Guide administrateur

Ce guide couvre l'utilisation quotidienne de l'interface d'administration : créer un événement, configurer les créneaux, suivre les inscriptions et exporter les données.

---

## Se connecter

Accéder à `/admin/login` et saisir les identifiants administrateur (définis via `ADMIN_EMAIL` et `ADMIN_PASSWORD` lors du déploiement, ou créés par `npm run db:seed`).

---

## Créer un événement

**`/admin/events/new`**

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement |
| Slug | Identifiant URL (`festival-2025` → `/events/festival-2025`) — généré automatiquement, modifiable |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Description | Texte libre (usage interne) |
| Instructions publiques | Message visible en haut de la page d'inscription (consignes, dress code, accès…) |
| Message de confirmation | Texte affiché sur la page de succès après inscription |

L'événement est créé en **brouillon** (`draft`) — il n'est pas visible du public tant qu'il n'est pas publié.

---

## Configurer les créneaux

**`/admin/events/[id]/shifts`**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

### Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. |
| Libellé | Intitulé spécifique affiché sous la barre (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin |
| Capacité | Nombre maximum de bénévoles |
| Statut | `Ouvert`, `Complet`, `Fermé`, `Annulé` |
| Ordre | Ordre d'affichage dans le planning |

### Modifier ou supprimer

Cliquer sur le créneau dans la liste pour l'éditer. La suppression n'est disponible que pour les créneaux sans inscription.

### Ajouter une inscription manuellement

Le formulaire d'ajout manuel (bouton **+ Ajouter**) pré-sélectionne automatiquement le créneau affiché dans le filtre courant. Pratique pour inscrire un bénévole par téléphone ou en cas de problème technique.

---

## Configurer le programme des spectacles

Dans la page d'édition de l'événement (**`/admin/events/[id]/edit`**), section **Programme des spectacles**.

Chaque entrée définit une plage horaire qui apparaît en fond coloré sur la timeline publique et dans les exports, permettant aux bénévoles de visualiser quand ils travaillent par rapport aux spectacles.

Champs : **Nom du spectacle**, **Date**, **Heure de début**, **Heure de fin**.

Les modifications sont sauvegardées automatiquement après 1 seconde d'inactivité.

---

## Publier un événement

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**. L'événement devient visible à l'URL `/events/[slug]`.

Pour dépublier (repasser en brouillon), cliquer à nouveau sur le bouton.

---

## Suivre les inscriptions

**`/admin/events/[id]/registrations`**

Vue tabulaire de toutes les inscriptions actives : nom, email, téléphone, créneau, commentaire, source, date.

Depuis la page principale de l'événement (`/admin/events/[id]`) :
- **Récap global** : créneaux, places totales, inscrits, places restantes
- **Créneaux critiques** : liste des créneaux encore ouverts avec des places disponibles

---

## Annuler une inscription

Sur la page des inscriptions, chaque ligne dispose d'un bouton de suppression. L'annulation est immédiate et irréversible ; le bénévole n'en est pas notifié automatiquement.

---

## Exporter les données

Deux formats disponibles depuis la page de l'événement :

### Export Excel (`.xlsx`)

- Un onglet par jour avec un **Gantt** : rôles en lignes, tranches de 30 min en colonnes, noms des bénévoles dans les cellules
- Créneaux de même libellé fusionnés sur une seule ligne Gantt
- Tableau récapitulatif sous le Gantt (horaires, capacité, inscrits, liste des bénévoles)
- Onglet **Inscriptions** avec toutes les données détaillées (nom, email, téléphone, commentaire)
- Bénévoles triés alphabétiquement par prénom

### Export PDF (impression)

- Même structure Gantt + récapitulatif, optimisée pour l'impression (format A4 paysage)
- Plages des spectacles en fond coloré dans le Gantt
- Cliquer sur **Imprimer / Enregistrer en PDF** pour générer le PDF via le navigateur

---

## Vue publique

Le lien **Vue publique ↗** sur la page de l'événement ouvre la page telle qu'un bénévole la voit, dans un nouvel onglet. Pratique pour vérifier l'affichage avant de partager.
