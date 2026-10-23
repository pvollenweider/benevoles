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

Depuis l'onglet **Communication** de l'événement (**Événements**, puis l'événement, puis **Communication**), section **Écrire aux bénévoles**, ou depuis les inscriptions (le bouton reprend le poste ou le créneau filtré).

![Page « Écrire aux bénévoles » : choix des destinataires (tous les inscrits, un poste, un créneau, la liste d'attente, les invités sans créneau) avec le nombre de personnes, le choix d'un modèle, puis l'objet et le message](/doc-img/admin-message.png)

Un email simple, à qui c'est utile :

- **tous les bénévoles inscrits** de l'événement ;
- **les bénévoles d'un poste** ;
- **les bénévoles d'un créneau** ;
- **les personnes en liste d'attente** (en attente ou à qui une place est proposée) ;
- **les invités sans créneau confirmé** : les membres invités à l'événement qui n'ont encore aucune inscription confirmée, y compris ceux qui ne sont qu'en liste d'attente (le compteur le précise), à l'exclusion des personnes ayant indiqué ne pas être disponibles (leur nombre est aussi précisé). Leur email contient leur lien d'invitation, **Choisir mes créneaux**. Le public est recalculé au moment de l'envoi.

Si des destinataires ont une adresse à vérifier (un précédent message leur a été définitivement refusé), l'aperçu et la confirmation le signalent avec leur nombre. C'est un avertissement, l'envoi reste possible : l'adresse a pu être corrigée côté destinataire depuis.

Vous saisissez un objet et un message texte (les retours à la ligne sont conservés). Pour une information urgente, cochez **Envoyer aussi une notification (téléphone ou ordinateur)** : les destinataires qui ont activé les notifications la reçoivent en plus de l'email, qui part à tous dans tous les cas. Le formulaire indique combien d'appareils sont abonnés parmi les destinataires, et l'aperçu comme la confirmation le rappellent. La notification montre l'objet et la première ligne du message, et ouvre la page personnelle du bénévole (la page de l'événement pour la liste d'attente). Son résultat s'affiche à part de celui des emails dans les messages envoyés ; un appareil qui n'existe plus est retiré. Le nombre de destinataires s'affiche dès le choix ; **Voir l'aperçu et envoyer** montre l'email tel qu'il sera reçu, puis demande une confirmation avec le nombre de personnes. Chaque personne reçoit un seul email, avec ses créneaux concernés et le lien vers ses inscriptions ; l'envoi est noté dans le journal de l'événement. Pour l'envoyer plus tard, voir [Programmer l'envoi](#programmer-l-envoi). Pas d'éditeur HTML ni de segments enregistrés : pour relancer les membres invités sans réponse, voir [Relancer les invités sans réponse](inviter-des-membres.md#relancer-les-invites-sans-reponse).

Pour un message à beaucoup de personnes, les emails partent par vagues : les premiers tout de suite, les suivants dans les minutes qui suivent, un peu plus tard pour une très longue liste. C'est normal, et rien à faire de votre côté : cette attente ne fait échouer aucun email. En attendant, les [messages envoyés](#messages-envoyes) les comptent « en attente ».

## Programmer l'envoi

Pour qu'un message parte à une date et une heure précises, par exemple un rappel le matin d'une réunion de préparation, choisissez **Programmer l'envoi** sous **Quand l'envoyer ?**, puis la **Date d'envoi** et l'**Heure d'envoi**. L'heure est celle du fuseau horaire de l'organisation, indiqué à côté du champ (voir [Fuseau horaire](personnaliser-l-organisation.md#fuseau-horaire)). Une date ou une heure passée est refusée, et l'envoi se programme au plus un an à l'avance. Le message part en général dans les 5 minutes qui suivent l'heure choisie ; pour beaucoup de destinataires, ses emails partent ensuite par vagues, comme pour un envoi immédiat.

Les destinataires se choisissent comme pour un envoi immédiat, avec la notification en option. **Voir l'aperçu et programmer** montre l'email, puis la confirmation rappelle la date, l'heure et le nombre de destinataires du moment. Ce nombre est recalculé au moment de l'envoi : une personne inscrite d'ici là reçoit aussi le message, une personne désinscrite ne le reçoit pas, et les variables sont remplacées à ce moment-là. Le message part une seule fois.

Le message n'est pas envoyé si l'événement est archivé à l'heure prévue, si le créneau choisi a été supprimé ou annulé, ou s'il n'y a plus personne dans la sélection ; la raison s'affiche dans la liste. La programmation, l'annulation et l'envoi sont notés dans le journal de l'événement. Un événement archivé ne propose pas la programmation.

## Messages programmés

Dans l'onglet **Communication**, au-dessus des messages envoyés, **Messages programmés** liste les envois à venir, le plus proche en premier, avec la date et l'heure prévues, qui l'a programmé, le public choisi et le texte. **Annuler l'envoi** l'annule après confirmation, tant qu'il n'est pas parti ; le message reste listé comme annulé, avec la date et l'auteur de l'annulation. Une fois parti, il rejoint les messages envoyés, avec l'heure pour laquelle il était programmé.

## Envois groupés

Dans l'onglet **Communication**, entre les messages programmés et les messages envoyés, **Envois groupés** liste chaque envoi à plusieurs personnes fait depuis l'événement, du plus récent au plus ancien : invitations, relance des invités sans réponse, rappel aux inscrits, message aux bénévoles, message programmé, créneaux à compléter. Pour chacun : la date et l'heure, qui l'a lancé (qui l'a programmé, pour un message programmé), le nombre de destinataires et la remise en toutes lettres, mise à jour à chaque visite (envoyés, en attente, en échec, annulés).

Quand le plafond d'envoi a fait attendre une partie des emails, une phrase le dit, par exemple « 1 email a attendu une minute avant de partir, à cause du plafond d'envoi. », ou, tant qu'ils attendent encore, combien partiront dès que le plafond le permet. Ce n'est pas une erreur : ces emails partent d'eux-mêmes.

**Voir les emails de cet envoi** ouvre les [emails envoyés](reglages-et-suivi-des-emails.md#emails-envoyes) de cet envoi seulement, avec leur état et, pour un échec, sa cause et le bouton **Renvoyer** ; le lien n'est affiché que tant que des emails de l'envoi sont encore dans cette liste (un email parti en sort la nuit suivante, un email en échec après 30 jours). Pour un message, **Voir le message** mène à son texte, dans les messages envoyés. Les destinataires ne sont jamais listés, seulement leur nombre, et ni les adresses ni le texte ne sont gardés avec l'envoi : il est conservé trois ans, puis supprimé, et il l'est aussi avec l'événement. Chaque envoi groupé figure aussi dans le [journal d'activité de l'organisation](journal-d-activite-de-l-organisation.md).

## Modèles de messages

**Paramètres**, puis **Modèles de messages** : enregistrez les messages que vous envoyez souvent (infos pratiques, convocation, remerciements), jusqu'à 20 par organisation, avec un nom, un objet et un texte. Dans « Écrire aux bénévoles », **Partir d'un modèle** remplit l'objet et le message, que vous modifiez librement avant l'envoi. Variables, remplacées pour chaque destinataire : `{prénom}`, `{événement}`, `{poste}` (public « un poste » ou « un créneau ») et `{créneau}` (public « un créneau ») ; pour écrire une accolade, doublez-la (`{{`). Une variable inconnue ou hors de son public est signalée et bloque l'envoi, elle n'est jamais envoyée telle quelle. Les modèles appartiennent à l'organisation (tous ses événements) et figurent dans le journal d'activité.

## Messages envoyés

En bas de l'onglet **Communication**, chaque message déjà envoyé pour l'événement (y compris les créneaux proposés depuis « Chercher des bénévoles »), du plus récent au plus ancien, avec la date et l'heure, qui l'a écrit, l'objet, le public choisi, le nombre de destinataires et la remise en toutes lettres (envoyés, en échec, en attente). **Voir le texte envoyé** affiche le message. Quand des emails ont échoué, **Renvoyer les emails en échec** les remet en file d'envoi, eux seuls ; un second clic n'en renvoie pas d'autres. Les destinataires ne sont pas listés, seulement leur nombre. Les emails automatiques (confirmations, rappels) n'y figurent pas : voir [Réglages et suivi des emails](reglages-et-suivi-des-emails.md#emails-envoyes). Les messages, et les messages programmés annulés ou non envoyés, sont conservés 12 mois, puis supprimés ; ils le sont aussi avec l'événement.

## Rappel manuel

Dans l'onglet **Communication**, section **Rappels**, sous l'encadré des rappels automatiques, le bouton **Envoyer le rappel** permet d'envoyer un email de rappel à **tous les bénévoles inscrits** de l'événement.

Avant d'envoyer, rédigez si vous le souhaitez un message dans la section « Message de rappel » (onglet **Réglages** de l'événement). Ce message apparaîtra dans l'email, avec le récapitulatif des créneaux de chaque bénévole.

Pour beaucoup d'inscrits, les emails du rappel partent par vagues, comme un message aux bénévoles : les premiers tout de suite, les suivants dans les minutes qui suivent, sans qu'aucun n'échoue pour autant. Le résultat affiché compte les rappels « en cours d'envoi », et chacun apparaît dans les [emails envoyés](reglages-et-suivi-des-emails.md#emails-envoyes). Un second envoi moins de 5 minutes après le premier, ou tant qu'une partie des emails du précédent attend encore son tour, est refusé, avec une phrase qui l'explique : un double clic n'envoie jamais deux fois le rappel.

Les rappels automatiques (J-2, J-1, jour J) partent sans intervention : voir [Rappels et changements de créneau](rappels.md). Pour un rappel à une date et une heure précises, écrivez-le dans **Écrire aux bénévoles** et [programmez l'envoi](#programmer-l-envoi).
