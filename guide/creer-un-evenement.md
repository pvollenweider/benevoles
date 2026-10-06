---
roles: [admin]
group: preparer
order: 10
summary: Créer un événement en trois étapes, depuis un modèle ou une page blanche, puis le modifier avec l'enregistrement automatique.
related: [configurer-les-creneaux, dupliquer-un-evenement, publier-un-evenement]
legacy: [admin#creer-un-evenement, admin#partir-d-un-modele, admin#page-blanche]
aliases: []
---

# Créer un événement

<!-- video: EVENT_CREATE_PUBLISH_OVERVIEW -->

**Événements → Nouvel événement** pour créer un événement, et **Modifier** sur la page d'un événement pour le reprendre : c'est le même formulaire, décrit ci-dessous (voir aussi [Modifier un événement](#modifier-un-evenement)).

La création se fait en trois étapes, indiquées en haut de page : **1. Informations**, **2. Postes et créneaux**, **3. Vérification et publication**. Après l'étape 1, vous arrivez sur les créneaux avec un bouton **Continuer** ; l'étape 3 récapitule ce qui est prêt et ce qui manque, propose l'aperçu bénévole, puis **Publier** ou **Rester en brouillon** (voir [Publier un événement](publier-un-evenement.md)). On peut publier sans les points facultatifs, mais pas sans créneau : cette règle vaut partout (page de l'événement, formulaire d'édition), pas seulement dans l'assistant, et un événement est toujours créé en brouillon. Dans l'autre sens, si le dernier créneau d'un événement publié est annulé (ou son dernier poste supprimé), l'événement repasse en brouillon, avec une entrée dans le journal. **Quitter l'assistant** ramène à tout moment à la page de l'événement : rien n'est perdu, chaque étape est une page normale de l'administration.

## Partir d'un modèle

En haut de la page, **Comment commencer ?** propose une page blanche ou un modèle : festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage. Un modèle n'est qu'un événement déjà rempli : choisissez-le, donnez un titre et la date du premier jour, et le brouillon est créé avec ses postes et ses créneaux (la liste de ce qui sera créé est affichée avant). Vous arrivez sur ses créneaux : horaires, effectifs et postes sont des points de départ, chacun se modifie ou se supprime comme d'habitude. Rien n'est publié.

## Page blanche

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement. L'adresse de la page d'inscription (`festival-2025`) en est tirée automatiquement à la création |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Coordonnées GPS ou lien de carte | Collez un lien OpenStreetMap ou Google Maps, ou une paire « latitude, longitude » : les bénévoles ont alors un lien **Voir sur la carte** (OpenStreetMap, aucune requête vers un service tiers tant qu'ils ne cliquent pas) sur la page d'inscription, dans les emails et sur leur page personnelle. Un créneau peut avoir ses propres coordonnées dans ses infos pratiques ; sinon celles de l'événement sont utilisées |
| Description | Texte libre, affiché publiquement dans l'encadré de l'événement sur la page d'inscription (colonne de droite, sur ordinateur) |
| Instructions publiques | Message visible en haut de la page d'inscription. Sur la page personnelle, l'encadré « Avant ta mission » le reprend comme consigne quand le créneau n'en a pas |
| Contact le jour J | Facultatif : un nom et un téléphone, la personne que les bénévoles appellent sur place quand leur créneau n'a pas de contact. Visible uniquement par les bénévoles inscrits, pour leurs places confirmées : page personnelle (encadré « Avant ta mission » et créneaux), rappels automatiques, planning individuel imprimé. Jamais sur la page publique, ni dans l'aperçu d'un lien partagé. Le contact d'un créneau, s'il est renseigné, passe avant. Une phrase l'accompagne toujours : en cas d'urgence, les numéros d'urgence officiels, ce contact ne les remplace pas. Indiquez le numéro d'une personne qui a accepté de le donner. Copié avec les réglages lors d'une duplication |
| Téléphone obligatoire à l'inscription | Si coché, le formulaire public exige un numéro de téléphone (désactivé par défaut). Ne s'applique pas aux bénévoles que vous ajoutez vous-même depuis l'administration. Le numéro saisi est enregistré avec l'inscription : c'est lui qui s'affiche dans la liste des inscriptions, les **Rapports** et la page du responsable de secteur (à défaut, celui de la fiche du membre) |
| Message de confirmation | Texte affiché sur la page de succès après inscription, sur la page personnelle du bénévole et dans l'email de confirmation. Mise en forme simple (gras, listes, liens). Variables : {prénom}, et pour le premier créneau de la personne : {créneau}, {date}, {heure} |
| Couleur de la page publique | Une couleur de la palette (la même que celle des postes) derrière le titre de la page d'inscription, avec un aperçu dans le formulaire. Le texte reste blanc sur un fond foncé, donc lisible ; sans couleur, l'en-tête reste blanc. La couleur est copiée avec les réglages lors d'une duplication |

L'événement est créé en **brouillon** (`draft`) : il n'est pas visible du public tant qu'il n'est pas publié.

## Modifier un événement

En modification (**Modifier** sur la page de l'événement), chaque changement est enregistré automatiquement ; l'heure du dernier enregistrement s'affiche en haut du formulaire. Si un enregistrement échoue, un message le dit et **Réessayer** renvoie vos modifications.

Le formulaire de modification propose aussi la case **Rappels automatiques** (cochée par défaut) : décochée, aucun rappel J-2, J-1 ni du jour ne part pour cet événement (voir [Rappels et changements de créneau](rappels.md)). Les inscriptions s'y ouvrent et s'y ferment (voir [Ouvrir et fermer les inscriptions](ouvrir-et-fermer-les-inscriptions.md)), et le programme des spectacles s'y saisit (voir [Programme des spectacles](programme-des-spectacles.md)).

## La page de l'événement

Une fois créé, chaque événement a sa propre page de pilotage : statistiques en un coup d'œil, raccourcis vers les créneaux et les inscriptions, jalons, journal. C'est votre poste de commande pour toute la durée de l'événement.

![Page de pilotage d'un événement publié : barre d'étapes, statistiques, raccourcis vers les créneaux, les inscriptions et les autres pages de l'événement, puis la liste des jalons dont un en retard](/doc-img/admin-event-overview.png)

Pour repartir d'un événement existant (édition suivante d'un festival), voir [Dupliquer un événement](dupliquer-un-evenement.md).
