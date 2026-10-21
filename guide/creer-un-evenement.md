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

**Événements**, puis **Nouvel événement** pour créer un événement, et l'onglet **Réglages** d'un événement pour le reprendre : c'est le même formulaire, décrit ci-dessous (voir aussi [Modifier un événement](#modifier-un-evenement)).

La création se fait en trois étapes, indiquées en haut de page : **1. Informations**, **2. Postes et créneaux**, **3. Vérification et publication**. Après l'étape 1, vous arrivez sur les créneaux avec un bouton **Continuer** ; l'étape 3 récapitule ce qui est prêt et ce qui manque, propose l'aperçu bénévole, puis **Publier** ou **Rester en brouillon** (voir [Publier un événement](publier-un-evenement.md)). On peut publier sans les points facultatifs, mais pas sans créneau : cette règle vaut partout (bouton **Publier** des pages de l'événement, formulaire d'édition), pas seulement dans l'assistant, et un événement est toujours créé en brouillon. Dans l'autre sens, si le dernier créneau d'un événement publié est annulé (ou son dernier poste supprimé), l'événement repasse en brouillon, avec une entrée dans le journal. **Quitter l'assistant** ramène à tout moment à l'aperçu de l'événement : rien n'est perdu, chaque étape est une page normale de l'administration.

## Partir d'un modèle

En haut de la page, **Comment commencer ?** propose une page blanche ou un modèle : festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage, et pour une activité régulière : épicerie participative, distribution alimentaire, permanence d'accueil, repair café (voir [Permanences récurrentes](permanences-recurrentes.md)). Un modèle n'est qu'un événement déjà rempli : choisissez-le, donnez un titre et la date du premier jour, et le brouillon est créé avec ses postes et ses créneaux (la liste de ce qui sera créé est affichée avant). Vous arrivez sur ses créneaux : horaires, effectifs et postes sont des points de départ, chacun se modifie ou se supprime comme d'habitude. Rien n'est publié.

## Page blanche

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement. L'adresse de la page d'inscription (`festival-2025`) en est tirée automatiquement à la création. Un titre qui donnerait une adresse du site lui-même (`tarifs`, `blog`, `admin`…) est refusé : ajoutez-y un mot, par exemple l'année |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Coordonnées GPS ou lien de carte | Collez un lien OpenStreetMap ou Google Maps, ou une paire « latitude, longitude » : les bénévoles ont alors un lien **Voir sur la carte** (OpenStreetMap, aucune requête vers un service tiers tant qu'ils ne cliquent pas) sur la page d'inscription, dans les emails et sur leur page personnelle. Un créneau peut avoir ses propres coordonnées dans ses infos pratiques ; sinon celles de l'événement sont utilisées |
| Description | Texte libre, affiché publiquement dans l'encadré de l'événement sur la page d'inscription (colonne de droite, sur ordinateur) |
| Instructions publiques | Message visible en haut de la page d'inscription. Sur la page personnelle, l'encadré « Avant ta mission » le reprend comme consigne quand le créneau n'en a pas |
| Contact le jour J | Facultatif : un nom et un téléphone, la personne que les bénévoles appellent sur place quand leur créneau n'a pas de contact. Visible uniquement par les bénévoles inscrits, pour leurs places confirmées : page personnelle (encadré « Avant ta mission » et créneaux), rappels automatiques, planning individuel imprimé. Jamais sur la page publique, ni dans l'aperçu d'un lien partagé. Le contact d'un créneau, s'il est renseigné, passe avant. Une phrase l'accompagne toujours : en cas d'urgence, les numéros d'urgence officiels, ce contact ne les remplace pas. Indiquez le numéro d'une personne qui a accepté de le donner. Copié avec les réglages lors d'une duplication |
| Téléphone obligatoire à l'inscription | Si coché, le formulaire public exige un numéro de téléphone (désactivé par défaut). Ne s'applique pas aux bénévoles que vous ajoutez vous-même depuis l'administration. Le numéro saisi est enregistré avec l'inscription : c'est lui qui s'affiche dans la liste des inscriptions, les **Documents à imprimer** et la page du responsable de secteur (à défaut, celui de la fiche du membre) |
| Montrer aux bénévoles confirmés qui est inscrit sur chaque créneau | Désactivé par défaut. Activé, chaque bénévole qui a une place confirmée voit sur sa page personnelle, créneau par créneau, le prénom et l'initiale du nom (« Aline M. ») des autres bénévoles confirmés de l'événement qui l'ont accepté, pour savoir avec qui il sera et choisir ses créneaux par affinité. Rien d'autre n'est montré (ni email, ni téléphone, ni réponses), jamais sur la page publique ni dans l'intégration à un autre site, et plus après le dernier jour de l'événement. Personne n'apparaît sans l'avoir choisi : le formulaire d'inscription propose une case facultative, non cochée, et chacun peut afficher ou masquer son nom à tout moment depuis sa page personnelle. Les personnes inscrites avant l'activation restent masquées tant qu'elles ne l'ont pas accepté ; vous ne pouvez pas l'accepter à leur place. Les bénévoles de moins de 18 ans (date de naissance connue) n'apparaissent jamais. En cochant la case, un rappel s'affiche : informez vos bénévoles, par exemple dans les informations que votre association leur donne. Vous voyez toujours, vous, toutes les inscriptions. Copié avec les réglages lors d'une duplication, jamais les choix des bénévoles |
| Annulation par le bénévole | Jusqu'à quand un bénévole confirmé peut annuler lui-même son créneau avec son lien personnel. **Jusqu'au début du créneau** (par défaut, pour tous les événements) : jamais après le début. **Plus tôt** : un délai en jours et/ou en heures avant le début de chaque créneau, calculé créneau par créneau dans le fuseau de l'organisation (par exemple 2 jours : jusqu'au jeudi 10:00 pour un créneau du samedi 10:00). Passé ce moment, sa page personnelle n'affiche plus le bouton d'annulation mais les personnes à prévenir : le responsable du poste (son nom), le contact du créneau ou le contact le jour J, l'adresse de l'organisation. Le délai ne concerne que les places confirmées : une personne en liste d'attente, à qui une place est proposée ou dont la demande attend votre validation peut se retirer jusqu'au début du créneau. Vous pouvez toujours retirer quelqu'un vous-même, à tout moment. L'email de confirmation et les rappels mentionnent le délai quand il est plus tôt que le début. Copié avec les réglages lors d'une duplication |
| Message de confirmation | Texte affiché sur la page de succès après inscription, sur la page personnelle du bénévole et dans l'email de confirmation. Mise en forme simple (gras, listes, liens). Variables : {prénom}, et pour le premier créneau de la personne : {créneau}, {date}, {heure}. Leur valeur s'affiche telle quelle, sans mise en forme. Dans l'adresse d'un lien ou d'une image, elles ne sont remplies qu'après le nom du site ou dans les paramètres, jamais à la place du site |
| Couleur de la page publique | Une couleur de la palette (la même que celle des postes) derrière le titre de la page d'inscription, avec un aperçu dans le formulaire. Le texte reste blanc sur un fond foncé, donc lisible ; sans couleur, l'en-tête reste blanc. La couleur est copiée avec les réglages lors d'une duplication |

L'événement est créé en **brouillon** (`draft`) : il n'est pas visible du public tant qu'il n'est pas publié.

## Modifier un événement

En modification (onglet **Réglages**, page **Informations**), chaque changement est enregistré automatiquement ; l'heure du dernier enregistrement s'affiche en haut du formulaire. Si un enregistrement échoue, un message le dit et **Réessayer** renvoie vos modifications.

Le formulaire de modification propose aussi la case **Rappels automatiques** (cochée par défaut) : décochée, aucun rappel J-2, J-1 ni du jour ne part pour cet événement (voir [Rappels et changements de créneau](rappels.md)). Les inscriptions s'y ouvrent et s'y ferment (voir [Ouvrir et fermer les inscriptions](ouvrir-et-fermer-les-inscriptions.md)), et le programme des spectacles s'y saisit (voir [Programme des spectacles](programme-des-spectacles.md)).

## La page de l'événement

Une fois créé, chaque événement a ses pages, réunies sous un même en-tête :

- **← Événements** ramène à la liste ; puis le titre, l'étape de l'événement (**Brouillon**, **Prêt à publier**, **Publié**, **Terminé** ou **Archivé**), ses dates et son lieu.
- Un seul bouton principal, qui suit l'étape : **Ajouter des créneaux** tant qu'il n'y en a aucun, **Publier** (ou **Demander la publication** si votre espace attend sa validation), **Ouvrir le jour J** de la veille au dernier jour, **Partager le lien** une fois publié, **Voir le résumé** une fois l'événement passé, rien une fois archivé.
- Le bouton **⋯** (**Autres actions**) : **Journal**, **Dupliquer**, **Dépublier** (événement publié), **Archiver** et, pour un propriétaire une fois l'événement archivé, **Supprimer définitivement…**.
- Les onglets : **Aperçu**, **Jour J** (de la veille au dernier jour), **Créneaux** (avec **Où manque-t-il du monde ?**), **Inscriptions** (avec **Invitations**), **Communication**, **Partage** (liens, **QR code**, **Pages d'information**, **Aperçu bénévole**), **Documents** et **Réglages** (**Informations**, **Questions**, **Responsables de secteur**). Un onglet qui réunit plusieurs pages les liste juste en dessous. Sur un téléphone, les onglets tiennent sur une ligne qui défile de côté.

L'onglet **Aperçu** suit l'ordre des tâches : **Où manque-t-il du monde ?** (les places restantes, en phrases), **À traiter** (demandes en attente, places proposées qui expirent, jalons en retard…), **Prochaines étapes** (la liste de vérification tant que l'événement est un brouillon, puis ce que son étape demande encore), **Jalons**, et **Communication** (le dernier message envoyé et le prochain rappel automatique).

![Aperçu d'un événement publié : en-tête avec le titre, le badge « Publié », le bouton « Partager le lien », le bouton « Autres actions » et les onglets, puis les sections « Où manque-t-il du monde ? », « À traiter », « Prochaines étapes », « Jalons » et « Communication »](/doc-img/admin-event-overview.png)

Pour repartir d'un événement existant (édition suivante d'un festival), voir [Dupliquer un événement](dupliquer-un-evenement.md).
