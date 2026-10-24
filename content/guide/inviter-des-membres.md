---
roles: [admin]
group: membres
order: 40
summary: Inviter des membres à un événement par email, suivre qui a répondu, et relancer les invités qui n'ont pas encore de créneau.
related: [gerer-les-membres, ou-manque-t-il-du-monde, ecrire-aux-benevoles]
legacy: [admin#inviter-des-membres-a-un-evenement, admin#envoyer-des-invitations, admin#suivre-l-etat-des-invitations, admin#pas-disponible, admin#relancer-les-invites-sans-reponse]
aliases: []
---

# Inviter des membres à un événement

> « Certains bénévoles reviennent chaque année, d'autres nous rejoignent pour la première fois. On cherche un outil simple pour accueillir tout le monde. »
>
> Aline, organisatrice d'une fête de village

<!-- video: MEMBERS_INVITATIONS -->

**Événements**, puis l'événement, puis l'onglet **Inscriptions**, et **Invitations** dans ses pages

Les invitations permettent d'envoyer des emails personnalisés aux membres de votre liste, avec un lien pré-rempli vers la page d'inscription.

## Envoyer des invitations

1. Cliquer sur **+ Inviter des membres**
2. Sélectionner les membres par nom ou par **Étiquette**
3. Optionnel : ajouter un message personnalisé (visible dans l'email)
4. Cliquer sur **Envoyer N invitation(s)**

Chaque membre reçoit un email avec un lien unique qui pré-remplit son prénom, nom, email et téléphone sur la page d'inscription. Ce lien ouvre aussi les postes à accès réservé aux membres qui portent la bonne étiquette (voir [Gérer les postes](gerer-les-postes.md)).

Pour une longue liste, les emails d'invitation partent par vagues : les premiers tout de suite, les suivants dans les minutes qui suivent. C'est normal, et rien à faire de votre côté : cette attente ne fait échouer aucun email. Le compte rendu affiché après l'envoi compte les emails « en cours d'envoi », et chacun apparaît dans les [emails envoyés](reglages-et-suivi-des-emails.md#emails-envoyes), d'abord « en attente », puis « envoyé ». Inviter à nouveau un membre déjà invité lui renvoie son invitation, sauf si elle vient de partir, il y a moins de 5 minutes, ou si elle attend encore son tour : un double clic n'envoie jamais deux fois le même email. Si vous corrigez l'adresse d'un membre pendant que son invitation attend encore son tour, elle ne part pas à l'ancienne adresse : elle est annulée, et l'inviter à nouveau, au moins 5 minutes après la première invitation, l'envoie à la nouvelle.

Chaque envoi d'invitations apparaît ensuite dans l'onglet **Communication**, section [Envois groupés](ecrire-aux-benevoles.md#envois-groupes), avec son nombre de destinataires et ce que sont devenus ses emails ; un renvoi à des membres déjà invités est noté dans le journal de l'événement, avec leur nombre.

Pour proposer des créneaux précis qui manquent de monde à des membres choisis, utilisez plutôt **Chercher des bénévoles** depuis [Où manque-t-il du monde ?](ou-manque-t-il-du-monde.md#chercher-des-benevoles) : les membres pas encore invités y reçoivent leur invitation avec la liste des créneaux concernés.

## Suivre l'état des invitations

Le tableau affiche pour chaque membre invité l'un de trois statuts :

- **✓ Participation confirmée**
- **Pas disponible** : la personne a répondu depuis son lien d'invitation qu'elle ne pouvait pas venir cette fois (voir ci-dessous)
- **Sans réponse** : ni inscription confirmée, ni réponse

Les compteurs en haut récapitulent : **Invités**, **Inscrits**, **Pas disponible** et **Sans réponse** ; ils s'additionnent toujours au nombre d'invités. Cliquer sur un compteur filtre le tableau sur cet état ; cliquer sur **Invités** l'efface.

![Page « Invitations » : les compteurs 9 Invités, 8 Inscrits, 0 Pas disponible et 1 Sans réponse, le bouton « + Inviter des membres », le bouton « Relancer la personne sans créneau » et le lien « Écrire un message à la personne sans créneau », puis le tableau des membres invités avec leurs tags, la date d'invitation et le statut « Participation confirmée » ou « Sans réponse »](/doc-img/admin-invitations.png)

**Tester l'envoi d'email** envoie un exemple de l'email d'invitation à l'adresse de votre choix, pour vérifier le rendu avant d'inviter. Cinq emails de test par heure au plus pour votre organisation.

## Pas disponible

L'email d'invitation et la page de l'événement ouverte depuis le lien personnel proposent un second lien, **Je ne suis pas disponible pour cet événement**, qui ouvre une étape de confirmation avant d'enregistrer quoi que ce soit (un simple aperçu du lien dans la messagerie ne répond jamais à la place de la personne). Aucune raison n'est demandée. La personne peut changer d'avis à tout moment : s'inscrire depuis ce même lien efface le statut « Pas disponible » ; se désinscrire ensuite de tous ses créneaux ne le remet pas.

## Qui est inscrit, pour les membres invités

Si l'événement a le réglage **Montrer aux bénévoles qui est inscrit** (voir [Créer un événement](creer-un-evenement.md#page-blanche)), un membre invité qui ouvre la page de l'événement avec le lien de son invitation voit l'interrupteur **Voir qui est inscrit**, avant même de s'inscrire : le prénom et l'initiale du nom des bénévoles confirmés qui l'ont accepté, et le nombre des autres, créneau par créneau. Il peut ainsi choisir ses créneaux avec des personnes qu'il connaît. En vidéo : [montrer aux bénévoles qui est inscrit](/videos/SHIFT_ROSTER_VISIBILITY#doc).

Le lien d'invitation ne montre plus rien une fois que la personne a répondu « pas disponible », ni une fois qu'elle l'a utilisé pour s'inscrire : c'est alors sa place confirmée et son lien personnel qui comptent. Si elle se retire ensuite de tous ses créneaux, l'invitation ne redonne pas l'accès. Un membre désactivé ou effacé ne voit rien. Le nom d'un bénévole qui a accepté un texte précédent, adressé aux seuls bénévoles confirmés, n'est pas montré aux membres invités tant qu'il n'a pas accepté le texte actuel depuis sa page personnelle ; il reste compté dans le nombre.

## Relancer les invités sans réponse

Le compteur **Sans réponse** compte les membres invités qui n'ont encore ni inscription confirmée ni réponse à l'événement (ceux qui ne sont qu'en liste d'attente en font partie). Le bouton **Relancer les N sans créneau** leur renvoie un rappel, sans message personnalisé, contrairement à l'invitation initiale ; une confirmation récapitule l'envoi avant qu'il parte et précise combien de personnes ayant indiqué ne pas être disponibles ne sont pas relancées. Comme les invitations, les relances partent par vagues pour une longue liste, sans qu'aucune n'échoue pour autant, et la relance est notée dans le journal de l'événement avec son nombre de destinataires. Elle apparaît aussi dans les [envois groupés](ecrire-aux-benevoles.md#envois-groupes) de l'onglet **Communication**.

Une personne invitée ou déjà relancée il y a moins de 48 heures n'est pas relancée à nouveau, pas plus qu'une personne dont l'email précédent attend encore son tour : deux relances rapprochées, ou une relance juste après l'invitation, n'envoient jamais deux fois l'email à la même personne. Le nombre N du bouton compte seulement les personnes qui recevront la relance ; une phrase sous les boutons dit combien sont laissées de côté pour cette raison, et le compte rendu après l'envoi le répète. Si tous les invités sans réponse ont reçu un email il y a moins de 48 heures, le bouton reste affiché mais indisponible, et la phrase dit que la relance sera possible après ce délai.

**Écrire un message aux N sans créneau** ouvre [Écrire aux bénévoles](ecrire-aux-benevoles.md) avec ce public déjà choisi, pour un texte libre : son nombre compte tous les invités sans réponse, la règle des 48 heures ne s'y applique pas. L'exclusion des personnes pas disponibles s'applique, et l'aperçu comme la confirmation disent combien de personnes en ont été exclues.
