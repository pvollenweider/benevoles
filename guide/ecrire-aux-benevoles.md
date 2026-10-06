---
roles: [admin]
group: communiquer
order: 10
summary: Envoyer un email aux inscrits d'un événement, d'un poste ou d'un créneau, avec des modèles, et retrouver les messages envoyés.
related: [reglages-et-suivi-des-emails, inviter-des-membres, suivre-les-inscriptions]
legacy: [admin#communications-benevoles, admin#ecrire-aux-benevoles, admin#rappel-manuel]
aliases: []
---

# Écrire aux bénévoles

<!-- video: TARGETED_MESSAGES -->

Depuis la page de l'événement (**Événements**, puis l'événement, puis **Écrire aux bénévoles**) ou depuis les inscriptions (le bouton reprend le poste ou le créneau filtré).

![Page « Écrire aux bénévoles » : choix des destinataires (tous les inscrits, un poste, un créneau, la liste d'attente, les invités sans créneau) avec le nombre de personnes, le choix d'un modèle, puis l'objet et le message](/doc-img/admin-message.png)

Un email simple, à qui c'est utile :

- **tous les bénévoles inscrits** de l'événement ;
- **les bénévoles d'un poste** ;
- **les bénévoles d'un créneau** ;
- **les personnes en liste d'attente** (en attente ou à qui une place est proposée) ;
- **les invités sans créneau confirmé** : les membres invités à l'événement qui n'ont encore aucune inscription confirmée, y compris ceux qui ne sont qu'en liste d'attente (le compteur le précise), à l'exclusion des personnes ayant indiqué ne pas être disponibles (leur nombre est aussi précisé). Leur email contient leur lien d'invitation, **Choisir mes créneaux**. Le public est recalculé au moment de l'envoi.

Si des destinataires ont une adresse à vérifier (un précédent message leur a été définitivement refusé), l'aperçu et la confirmation le signalent avec leur nombre. C'est un avertissement, l'envoi reste possible : l'adresse a pu être corrigée côté destinataire depuis.

Vous saisissez un objet et un message texte (les retours à la ligne sont conservés). Pour une information urgente, cochez **Envoyer aussi une notification (téléphone ou ordinateur)** : les destinataires qui ont activé les notifications la reçoivent en plus de l'email, qui part à tous dans tous les cas. Le formulaire indique combien d'appareils sont abonnés parmi les destinataires, et l'aperçu comme la confirmation le rappellent. La notification montre l'objet et la première ligne du message, et ouvre la page personnelle du bénévole (la page de l'événement pour la liste d'attente). Son résultat s'affiche à part de celui des emails dans les messages envoyés ; un appareil qui n'existe plus est retiré. Le nombre de destinataires s'affiche dès le choix ; **Voir l'aperçu et envoyer** montre l'email tel qu'il sera reçu, puis demande une confirmation avec le nombre de personnes. Chaque personne reçoit un seul email, avec ses créneaux concernés et le lien vers ses inscriptions ; l'envoi est noté dans le journal de l'événement. Pas d'éditeur HTML, de segments enregistrés ni de programmation : pour relancer les membres invités sans réponse, voir [Relancer les invités sans réponse](inviter-des-membres.md#relancer-les-invites-sans-reponse).

## Modèles de messages

**Paramètres**, puis **Modèles de messages** : enregistrez les messages que vous envoyez souvent (infos pratiques, convocation, remerciements), jusqu'à 20 par organisation, avec un nom, un objet et un texte. Dans « Écrire aux bénévoles », **Partir d'un modèle** remplit l'objet et le message, que vous modifiez librement avant l'envoi. Variables, remplacées pour chaque destinataire : `{prénom}`, `{événement}`, `{poste}` (public « un poste » ou « un créneau ») et `{créneau}` (public « un créneau ») ; pour écrire une accolade, doublez-la (`{{`). Une variable inconnue ou hors de son public est signalée et bloque l'envoi, elle n'est jamais envoyée telle quelle. Les modèles appartiennent à l'organisation (tous ses événements) et figurent dans le journal d'activité.

## Messages envoyés

Sous le formulaire, chaque message déjà envoyé pour l'événement (y compris les créneaux proposés depuis « Chercher des bénévoles »), du plus récent au plus ancien, avec la date et l'heure, qui l'a écrit, l'objet, le public choisi, le nombre de destinataires et la remise en toutes lettres (envoyés, en échec, en attente). **Voir le texte envoyé** affiche le message. Quand des emails ont échoué, **Renvoyer les emails en échec** les remet en file d'envoi, eux seuls ; un second clic n'en renvoie pas d'autres. Les destinataires ne sont pas listés, seulement leur nombre. Les emails automatiques (confirmations, rappels) n'y figurent pas : voir [Réglages et suivi des emails](reglages-et-suivi-des-emails.md#emails-envoyes). Les messages sont conservés 12 mois, puis supprimés ; ils le sont aussi avec l'événement.

## Rappel manuel

Depuis la page de l'événement, le bouton **Envoyer le rappel** permet d'envoyer un email de rappel à **tous les bénévoles inscrits** de l'événement.

Avant d'envoyer, rédiger un message dans la section « Message de rappel » (page de l'événement, puis **Modifier**). Ce message apparaîtra dans l'email, avec le récapitulatif des créneaux de chaque bénévole.

Les rappels automatiques (J-2, J-1, jour J) partent sans intervention : voir [Rappels et changements de créneau](rappels.md).
