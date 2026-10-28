---
roles: [admin]
group: suivre
order: 10
summary: Le tableau des inscriptions d'un événement : coordonnées, statut, actions groupées, et ajout d'une personne à la main.
related: [presences-le-jour-j, ou-manque-t-il-du-monde, ecrire-aux-benevoles]
legacy: [admin#suivre-les-inscriptions, admin#ajouter-quelqu-un-a-la-main]
aliases: []
updated: 2026-10-27
---

# Suivre les inscriptions

<!-- video: REGISTRATIONS_MANAGEMENT -->

**Événements**, puis l'événement, puis l'onglet **Inscriptions**

Vue tabulaire des inscriptions, en quatre colonnes :

- **Bénévole** : nom, puis sous le nom l'email, le téléphone, les réponses aux questions, les disponibilités, le commentaire et, s'il y a lieu, l'alerte **Charge élevée** ;
- **Créneau** : poste, libellé, jour et horaires ;
- **Source** : **Formulaire** (inscription depuis la page d'inscription) ou **Manuel** (ajout depuis l'administration) ;
- **Statut** : **Liste d'attente** (avec le rang dans la file, par exemple « position 2 »), **Place proposée** ou **Demande à traiter** ; rien pour une inscription confirmée.

![Page des inscriptions d'un événement : compteurs (actives, liste d'attente, demandes à traiter), recherche et filtres, puis le tableau avec bénévole et coordonnées, créneau et source](/doc-img/admin-registrations.png)

Au-dessus du tableau, la recherche (nom, email) et les filtres par poste et par créneau. Quand l'événement a des [liens par groupe](partager-le-lien.md#un-lien-par-groupe), un filtre (**Tous les liens de groupe**) montre les inscriptions venues d'un lien (« Lien : … »), ou celles arrivées **Sans lien de groupe**.

Dans un événement organisé par secteurs (bêta, voir [Gérer les postes](gerer-les-postes.md#organiser-les-postes-par-secteurs-beta)), le champ **Secteur**, au-dessus des filtres, limite la page aux postes d'un secteur, ou à « Autres postes » pour les postes sans secteur : le tableau, les compteurs, les annulations récentes et le lien **Exporter les présences (CSV)**. Le choix figure dans l'adresse de la page, que vous pouvez transmettre à un autre organisateur. Un secteur limite ce que vous voyez, pas ce que vous pouvez faire. Le bouton **Écrire au secteur Parking** ouvre alors l'[écriture aux bénévoles](ecrire-aux-benevoles.md) sur ce secteur ; un poste ou un créneau choisi dans les filtres reste prioritaire (**Écrire à ce poste**, **Écrire à ce créneau**).

Seules les demandes sur un créneau sur validation ont leurs propres boutons, **Accepter** et **Refuser**, sur la ligne (voir [Inscriptions sur validation](inscriptions-sur-validation.md)). Tout le reste passe par la sélection : cocher une ou plusieurs inscriptions (case d'en-tête pour tout sélectionner d'un coup) fait apparaître une barre d'outils, appliquée à toute la sélection, même une inscription masquée entre-temps par un filtre ou une recherche :

- **Marquer présents** et **Annuler la présence** : voir [Présences le jour J](presences-le-jour-j.md).
- **Rendre responsable** de leur poste. Avec une seule ligne sélectionnée, une modale s'ouvre pour choisir le poste (si le bénévole a plusieurs inscriptions) et ajuster nom/email avant l'envoi. Avec plusieurs lignes, chaque bénévole est directement rattaché au poste de son propre créneau, sans étape intermédiaire (voir [Responsables de secteur](responsables-de-secteur.md)).
- **Renvoyer le lien** : réenvoie par email le lien personnel de gestion (`/my/[token]`) de chaque bénévole sélectionné, utile s'il l'a perdu ou supprimé par erreur. Le lien renvoyé donne accès à toutes les inscriptions actives du bénévole pour cet événement, pas seulement au créneau de la ligne.
- **Retirer de leur créneau** : annule chaque inscription confirmée de la sélection ; une inscription en liste d'attente, avec une place proposée ou une demande à traiter reste telle quelle. Chaque personne retirée reçoit un seul email d'annulation, même si plusieurs de ses inscriptions sont retirées, qui liste les créneaux concernés et donne son lien personnel s'il lui reste d'autres créneaux sur l'événement, sinon le lien de la page d'inscription ; une personne sans adresse email ne reçoit rien. Les lignes quittent la liste tout de suite, mais rien n'est enregistré ni envoyé pendant 10 secondes : **Annuler le retrait** les remet en place (aucun email ne part), **Retirer maintenant** n'attend pas. Le compte à rebours s'arrête tant que le curseur ou le focus clavier est sur cette barre. Quitter la page valide le retrait ; confirmer un second retrait pendant l'attente le regroupe avec le premier et relance les 10 secondes.

**Rendre responsable**, **Renvoyer le lien** et **Retirer de leur créneau** demandent d'abord une confirmation qui récapitule ce qui va se passer : personnes concernées, emails envoyés, places proposées à la liste d'attente, et le fait que l'action est journalisée. Une fois l'action faite, le lien **Voir cette action dans le journal** ouvre le [journal de l'événement](journal-de-l-evenement.md) à la date du jour pour la retrouver.

Un badge **Responsable** s'affiche sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.

**Charge élevée** : une ligne l'indique, en toutes lettres, quand ce bénévole cumule plus de 8 h de créneaux dans une journée, ou plus de 6 h d'affilée sans pause d'au moins 30 minutes (une pause plus courte compte comme du temps continu). Un créneau qui passe minuit compte pour le jour où il commence ; le temps d'affilée se suit d'un jour à l'autre. Seules les inscriptions confirmées comptent, pas la liste d'attente. C'est une information, rien n'est bloqué. En ajoutant quelqu'un à la main, le formulaire prévient avant l'ajout si ce créneau le ferait dépasser ces seuils, quand la personne est déjà inscrite (même email).

## Rétablir une inscription annulée

Sous la liste, **Annulations récentes** montre les places et les demandes annulées sur des créneaux qui n'ont pas encore commencé : qui a annulé (la personne ou l'organisation) et quand. **Rétablir** remet l'inscription comme elle était, une place confirmée ou une demande en attente de votre réponse, tant que le créneau n'a pas commencé et que la place est libre. Si quelqu'un a pris la place entre-temps, ou si la personne s'est réinscrite sur ce créneau, la ligne le dit à la place du bouton. La personne reçoit un email avec son lien personnel, et l'action est inscrite au journal de l'événement.

Une liste d'attente quittée ou une place proposée refusée ne se rétablissent pas : ajoutez la personne à la main.

Quand une personne vous répond « ce n'était pas moi » après l'email qui lui confirme une annulation, son lien personnel est entre d'autres mains. Cochez alors **Le lien a été utilisé par quelqu'un d'autre : envoyer un nouveau lien** dans la confirmation : tous ses liens pour l'événement sont remplacés, l'ancien n'ouvre plus rien, et le nouveau part avec l'email. L'email de désistement envoyé à l'organisation contient aussi un lien vers cette liste.

## Échanges de créneaux entre bénévoles (bêta)

Pour une organisation qui participe à la bêta, la carte **Échanges de créneaux** des informations de l'événement propose **Autoriser les demandes d'échange de créneaux**. Deux bénévoles confirmés sur deux créneaux du même poste peuvent alors échanger leurs créneaux depuis leur page « Mes inscriptions » : l'un publie sa demande, un autre lui propose l'un de ses créneaux, le premier accepte. Chacun garde son inscription et son lien personnel ; seuls les créneaux sont échangés, d'un seul coup, et les deux reçoivent un email « Échange effectué ». Les nouveaux événements prennent la valeur choisie dans les Paramètres ; les événements existants restent sans échanges tant que vous ne l'activez pas.

Un échange respecte les règles d'une inscription (chevauchements, nombre de créneaux par personne, âge minimum, postes réservés) et le délai d'annulation de l'événement pour chaque créneau cédé ; il se fait au plus tard avant le début du premier des deux créneaux. Un poste attribué par l'organisation uniquement ne s'échange pas.

Si l'un des deux créneaux est sur validation, ou si vous activez **Valider chaque échange**, l'échange attend votre accord : vous recevez un email, et la section **Échanges de créneaux** de cette page le montre sous **À valider**, avec ce que chaque personne cède et reçoit et la date limite. **Valider l'échange** vérifie à nouveau toutes les règles puis l'effectue ; **Refuser** le termine, et les deux personnes sont prévenues. Rien ne change dans le planning avant votre validation. Désactiver **Valider chaque échange** ne valide pas les échanges qui attendent déjà : ils restent à valider.

Une demande prend fin d'elle-même, et les personnes sont prévenues, quand l'une des places est annulée, quand un des créneaux est annulé ou change d'horaire, de jour, de lieu, de poste ou de conditions, quand une personne est effacée ou fusionnée, ou quand ses liens personnels sont renouvelés. Désactiver les échanges sur l'événement annule les demandes en cours, après une confirmation qui dit combien ; les échanges déjà effectués restent. Chaque étape est inscrite au journal de l'événement.

## Ajouter quelqu'un à la main

**+ Ajouter manuellement** ouvre le formulaire **Inscription manuelle**. En vidéo : [placer un membre sur plusieurs créneaux](/videos/REGISTRATIONS_PLACE_MEMBER).

- **Membre existant** : cherchez par nom ou email une personne déjà dans la liste des membres, vous-même compris, puis **Choisir**. Ses coordonnées sont reprises sans rien retaper, même sans email, et l'inscription est rattachée à sa fiche. **Changer de personne** revient à la recherche.
- Pour une nouvelle personne : prénom et nom (obligatoires), email, téléphone. Si l'email correspond à une personne déjà inscrite à l'événement, ses disponibilités s'affichent sous le champ.
- Puis le créneau (obligatoire). **+ Ajouter un autre créneau** ajoute une ligne « Créneau 2 », « Créneau 3 »… pour placer la même personne sur plusieurs créneaux d'un coup ; **Retirer** enlève une ligne. Une ligne laissée vide est ignorée. Tous les créneaux sont ajoutés ensemble, ou aucun si l'un pose problème.
- Une note facultative (par exemple « Inscrit par téléphone »).

- L'inscription est confirmée directement, même sur un créneau sur validation : pas de demande à traiter.
- Les conditions du formulaire public ne s'appliquent pas : inscriptions fermées, téléphone obligatoire, âge minimum, accès réservé.
- Pour une personne déjà inscrite à l'événement (membre choisi, ou même email), le formulaire signale qu'elle a déjà un créneau sur la même plage horaire, et si ce créneau lui donnerait une charge élevée ; l'ajout reste possible. Une seconde inscription de la même personne sur le même créneau est refusée.
- Deux créneaux choisis qui se chevauchent sont signalés sous la ligne concernée ; l'ajout reste possible. Un créneau d'un poste cumulable avec un autre créneau n'est jamais signalé ainsi.
- Si la personne a déjà atteint la limite de créneaux par personne du poste (en comptant les créneaux ajoutés ensemble), l'ajout est refusé avec la raison et le bouton **Ajouter quand même** ; l'ajout au-delà de la limite est noté dans le journal.
- La personne reçoit un email de confirmation : qui l'a inscrite, ses créneaux, et son lien personnel pour les voir, les modifier ou se désister. L'email part une dizaine de minutes après le dernier ajout pour cette personne : plusieurs créneaux ajoutés à la suite font un seul email, et un créneau retiré entre-temps n'y figure pas. Le formulaire l'annonce sous le bouton avant l'ajout. Aucun email ne part si la personne n'a pas d'adresse, si vous vous inscrivez vous-même, ou si le créneau a déjà commencé (saisie après coup) ; le journal de l'événement note l'envoi ou sa raison. Pour lui renvoyer son lien plus tard, sélectionnez sa ligne puis **Renvoyer le lien**.
