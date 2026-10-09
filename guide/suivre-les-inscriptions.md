---
roles: [admin]
group: suivre
order: 10
summary: Le tableau des inscriptions d'un événement : coordonnées, statut, actions groupées, et ajout d'une personne à la main.
related: [presences-le-jour-j, ou-manque-t-il-du-monde, ecrire-aux-benevoles]
legacy: [admin#suivre-les-inscriptions, admin#ajouter-quelqu-un-a-la-main]
aliases: []
---

# Suivre les inscriptions

<!-- video: REGISTRATIONS_MANAGEMENT -->

**Événements**, puis l'événement, puis **Voir les inscriptions**

Vue tabulaire des inscriptions, en quatre colonnes :

- **Bénévole** : nom, puis sous le nom l'email, le téléphone, les réponses aux questions, les disponibilités, le commentaire et, s'il y a lieu, l'alerte **Charge élevée** ;
- **Créneau** : poste, libellé, jour et horaires ;
- **Source** : **Formulaire** (inscription depuis la page publique) ou **Manuel** (ajout depuis l'administration) ;
- **Statut** : **Liste d'attente** (avec le rang dans la file, par exemple « position 2 »), **Place proposée** ou **Demande à traiter** ; rien pour une inscription confirmée.

![Page des inscriptions d'un événement : compteurs (actives, liste d'attente, demandes à traiter), recherche et filtres, puis le tableau avec bénévole et coordonnées, créneau et source](/doc-img/admin-registrations.png)

Seules les demandes sur un créneau sur validation ont leurs propres boutons, **Accepter** et **Refuser**, sur la ligne (voir [Inscriptions sur validation](inscriptions-sur-validation.md)). Tout le reste passe par la sélection : cocher une ou plusieurs inscriptions (case d'en-tête pour tout sélectionner d'un coup) fait apparaître une barre d'outils, appliquée à toute la sélection, même une inscription masquée entre-temps par un filtre ou une recherche :

- **Marquer présents** et **Annuler la présence** : voir [Présences le jour J](presences-le-jour-j.md).
- **Rendre responsable** de leur poste. Avec une seule ligne sélectionnée, une modale s'ouvre pour choisir le poste (si le bénévole a plusieurs inscriptions) et ajuster nom/email avant l'envoi. Avec plusieurs lignes, chaque bénévole est directement rattaché au poste de son propre créneau, sans étape intermédiaire (voir [Responsables de secteur](responsables-de-secteur.md)).
- **Renvoyer le lien** : réenvoie par email le lien personnel de gestion (`/my/[token]`) de chaque bénévole sélectionné, utile s'il l'a perdu ou supprimé par erreur. Le lien renvoyé donne accès à toutes les inscriptions actives du bénévole pour cet événement, pas seulement au créneau de la ligne.
- **Retirer de leur créneau** : annule chaque inscription confirmée de la sélection ; une inscription en liste d'attente, avec une place proposée ou une demande à traiter reste telle quelle. Chaque personne retirée reçoit un seul email d'annulation, même si plusieurs de ses inscriptions sont retirées, qui liste les créneaux concernés et donne son lien personnel s'il lui reste d'autres créneaux sur l'événement, sinon le lien de la page de l'événement ; une personne sans adresse email ne reçoit rien. Les lignes quittent la liste tout de suite, mais rien n'est enregistré ni envoyé pendant 10 secondes : **Annuler le retrait** les remet en place (aucun email ne part), **Retirer maintenant** n'attend pas. Le compte à rebours s'arrête tant que le curseur ou le focus clavier est sur cette barre. Quitter la page valide le retrait ; confirmer un second retrait pendant l'attente le regroupe avec le premier et relance les 10 secondes.

**Rendre responsable**, **Renvoyer le lien** et **Retirer de leur créneau** demandent d'abord une confirmation qui récapitule ce qui va se passer : personnes concernées, emails envoyés, places proposées à la liste d'attente, et le fait que l'action est journalisée. Une fois l'action faite, le lien **Voir cette action dans le journal** ouvre le [journal de l'événement](journal-de-l-evenement.md) à la date du jour pour la retrouver.

Un badge **Responsable** s'affiche sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.

**Charge élevée** : une ligne l'indique, en toutes lettres, quand ce bénévole cumule plus de 8 h de créneaux dans une journée, ou plus de 6 h d'affilée sans pause d'au moins 30 minutes (une pause plus courte compte comme du temps continu). Un créneau qui passe minuit compte pour le jour où il commence ; le temps d'affilée se suit d'un jour à l'autre. Seules les inscriptions confirmées comptent, pas la liste d'attente. C'est une information, rien n'est bloqué. En ajoutant quelqu'un à la main, le formulaire prévient avant l'ajout si ce créneau le ferait dépasser ces seuils, quand la personne est déjà inscrite (même email).

## Rétablir une inscription annulée

Sous la liste, **Annulations récentes** montre les places et les demandes annulées sur des créneaux qui n'ont pas encore commencé : qui a annulé (la personne ou l'organisation) et quand. **Rétablir** remet l'inscription comme elle était, une place confirmée ou une demande en attente de votre réponse, tant que le créneau n'a pas commencé et que la place est libre. Si quelqu'un a pris la place entre-temps, ou si la personne s'est réinscrite sur ce créneau, la ligne le dit à la place du bouton. La personne reçoit un email avec son lien personnel, et l'action est inscrite au journal de l'événement.

Une liste d'attente quittée ou une place proposée refusée ne se rétablissent pas : ajoutez la personne à la main.

Quand une personne vous répond « ce n'était pas moi » après l'email qui lui confirme une annulation, son lien personnel est entre d'autres mains. Cochez alors **Le lien a été utilisé par quelqu'un d'autre : envoyer un nouveau lien** dans la confirmation : tous ses liens pour l'événement sont remplacés, l'ancien n'ouvre plus rien, et le nouveau part avec l'email. L'email de désistement envoyé à l'organisation contient aussi un lien vers cette liste.

## Ajouter quelqu'un à la main

**+ Ajouter manuellement** ouvre le formulaire **Inscription manuelle** : prénom et nom (obligatoires), email, téléphone, créneau (obligatoire) et une note (par exemple « Inscrit par téléphone »). Si l'email correspond à une personne déjà inscrite à l'événement, ses disponibilités s'affichent sous le champ.

- L'inscription est confirmée directement, même sur un créneau sur validation : pas de demande à traiter.
- Les conditions du formulaire public ne s'appliquent pas : inscriptions fermées, téléphone obligatoire, âge minimum, accès réservé.
- Pour une personne déjà inscrite à l'événement (même email), le formulaire signale qu'elle a déjà un créneau sur la même plage horaire, et si ce créneau lui donnerait une charge élevée ; l'ajout reste possible. Une seconde inscription de la même personne sur le même créneau est refusée.
- Si la personne a déjà atteint la limite de créneaux par personne du poste, l'ajout est refusé avec la raison et le bouton **Ajouter quand même** ; l'ajout au-delà de la limite est noté dans le journal.
- L'ajout n'envoie aucun email. Pour transmettre son lien personnel à la personne, sélectionnez sa ligne puis **Renvoyer le lien**.
