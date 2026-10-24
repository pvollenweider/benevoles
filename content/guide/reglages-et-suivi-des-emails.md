---
roles: [admin]
group: communiquer
order: 20
summary: Régler les rappels, les alertes et l'adresse de réponse de l'organisation, et suivre l'état de chaque email envoyé.
related: [ecrire-aux-benevoles, gerer-les-membres]
legacy: [admin#emails, admin#reglages-des-emails, admin#emails-envoyes]
aliases: []
---

# Réglages et suivi des emails

<!-- video: ORG_EMAIL_SETTINGS -->

## Réglages des emails

La page **Emails** (**Paramètres**, puis **Emails**) commence par les réglages de l'organisation (réservé aux propriétaires ; un organisateur n'y voit que l'adresse de réponse) :

- **Rappels automatiques** : cochez ou décochez le rappel J-2, le rappel J-1 et le rappel du jour pour toute l'organisation (voir [Rappels et changements de créneau](rappels.md)).
- **Prévenir les administrateurs à chaque inscription** : l'email envoyé à chaque administrateur actif quand un bénévole s'inscrit depuis la page publique, et quand il modifie ses réponses aux questions depuis sa page personnelle (les modifications de quelques minutes sont regroupées en un seul email, avec la réponse finale de chacun). Une question rattachée à un poste prévient les responsables de ce poste à la place des administrateurs (les administrateurs, s'il n'a aucun responsable). Décoché, ni les administrateurs ni les responsables ne reçoivent l'email des réponses modifiées.
- **Prévenir en cas de désistement** : réglage séparé du précédent, coché par défaut. Quand un bénévole annule une place confirmée ou une demande, un email part quelques minutes plus tard aux administrateurs actifs et aux responsables du poste concerné (plusieurs désistements du même événement à la suite arrivent dans un seul email). Un désistement moins de 24 heures avant le début du créneau part tout de suite, sans attendre, intitulé « Désistement de dernière minute », avec l'heure de début du créneau. L'email indique qui se désiste, de quel créneau, combien de places manquent désormais, si la liste d'attente a repris la place, et le mot laissé par le bénévole le cas échéant (300 caractères maximum, jamais conservé une fois l'email envoyé) ; s'il reste une place vide sans personne en liste d'attente, l'email des administrateurs propose **Trouver un remplaçant**. Quitter la liste d'attente ou refuser une place proposée ne prévient personne : rien à décider dans ces cas. Décoché, ni les administrateurs ni les responsables ne reçoivent cet email.
- **Adresse de réponse** : quand un bénévole répond à un email de l'application, sa réponse arrive à cette adresse (vide : l'adresse par défaut de la plateforme). Par défaut, c'est l'adresse email du premier propriétaire de l'organisation : si aucune adresse n'a encore été réglée quand un propriétaire active son compte, elle prend la sienne. Vous pouvez la remplacer ou la vider ici ; une adresse que vous videz reste vide. Elle figure aussi sur la page personnelle des bénévoles (« Écrire à l'organisation »).
- **Résumé quotidien des adresses à vérifier** : coché par défaut. Un email par jour aux administrateurs actifs, seulement quand une confirmation, une proposition de liste d'attente ou un rappel a échoué définitivement depuis la veille, jamais pour un incident temporaire seul, et jamais plus d'un par jour même si plusieurs échecs se sont produits.
- **M'envoyer un email de test** : un email à votre propre adresse, avec les réglages enregistrés, pour vérifier l'expéditeur, l'adresse de réponse et le rendu (cinq par heure au plus).

Les textes personnalisables restent par événement : instructions publiques, message de confirmation et message de rappel dans les réglages de l'événement.

## Emails envoyés

La même page liste les emails de l'organisation des plus récents aux plus anciens : date, type (confirmation, rappel, message aux bénévoles…), destinataire et état :

- **En attente d'envoi** : mis en file, pas encore parti. En temps normal, il part dans la minute. Pour un envoi à beaucoup de personnes, les emails partent par vagues : une partie attend quelques minutes, un peu plus pour une très longue liste. C'est normal, et rien à faire de votre côté : cette attente ne fait échouer aucun email. Au-delà d'environ deux mille emails groupés (messages aux bénévoles, créneaux proposés, invitations, rappels manuels) en vingt-quatre heures, les emails groupés suivants restent dans cet état jusqu'à la fin de ces vingt-quatre heures, comptées depuis le premier de ces envois, puis partent d'eux-mêmes, par vagues ;
- **Nouvel essai prévu** : le premier envoi a échoué pour une cause temporaire (incident chez notre serveur d'envoi, boîte pleine, délai dépassé…), l'application réessaie toute seule, à intervalles croissants (six essais au plus en tout) ;
- **Envoyé** : parti, avec l'heure ;
- **Échec définitif** : soit six essais temporaires épuisés, soit un rejet permanent du serveur destinataire (boîte inexistante, adresse refusée) qui arrête les essais tout de suite : ça ne sert à rien de réessayer une adresse qui n'existe pas. Dans les deux cas, une phrase en français explique la cause et le bouton **Renvoyer** remet l'email en file. Pour une invitation ou un rappel manuel, **Renvoyer** est refusé si le même email est déjà reparti depuis, ou attend son tour : la personne ne le reçoit pas deux fois ;
- **Annulé** : l'email n'est jamais parti, volontairement : l'organisation a été désactivée avant son envoi, la personne a été supprimée des membres, sa fiche a été fusionnée avec une autre, trop de demandes (de réinitialisation de mot de passe, par exemple) ont visé la même adresse en une heure, l'espace attendait encore sa validation et l'email ne s'adressait pas à ses administrateurs, plus aucune des inscriptions annoncées n'existait au moment de l'envoi, l'adresse du membre a été modifiée pendant que l'email attendait son tour (rien ne part vers l'ancienne adresse ; ses nouveaux liens personnels partent à la nouvelle, renvoyez un autre message si besoin), le lien qu'il contenait a été remplacé entre-temps (une demande de réinitialisation plus récente, un mot de passe changé), ou le responsable de secteur auquel il s'adressait a été retiré. Il n'est jamais renvoyé, même si l'organisation est réactivée ensuite (pas de bouton **Renvoyer**).

**Ce que « accepté par le serveur d'envoi » veut dire, et ce que ça ne veut pas dire** : quand un envoi réussit, la seule chose prouvée est que notre propre serveur d'envoi (le relais SMTP) a accepté le message. Ce n'est ni une preuve de remise dans la boîte du destinataire, ni, à plus forte raison, une preuve de lecture : un relais de messagerie accepte en général toute adresse externe à la première étape, et n'apprend que plus tard, par un rebond invisible pour l'application, qu'une boîte n'existe pas. Un **rejet permanent** affiché ici reste donc la source la plus fiable aujourd'hui pour repérer une adresse à corriger, mais il ne couvre pas tous les cas : si un message a été accepté, l'application ne peut pas dire s'il a réellement atteint la bonne personne.

Un rejet permanent sur l'adresse actuelle d'un membre se retrouve aussi, sans avoir à parcourir cette page, sur sa fiche et dans la liste des membres (« Adresse à vérifier », voir [Gérer les membres](gerer-les-membres.md)) : même donnée, lue depuis l'endroit où vous corrigez l'adresse.

Depuis un [envoi groupé](ecrire-aux-benevoles.md#envois-groupes) de l'onglet **Communication** d'un événement, **Voir les emails de cet envoi** ouvre cette liste limitée aux emails de cet envoi ; une phrase en haut le rappelle, avec un lien pour revoir tous les emails de l'organisation. Le bilan de l'envoi, lui, reste dans l'onglet **Communication** après que ses emails ont quitté cette liste.

Les emails envoyés sont effacés chaque nuit (ils contiennent des données personnelles) ; ceux en échec ou annulés restent 30 jours, comme le résultat détaillé de chaque envoi (destinataire concerné, type de message, résultat, raison), conservé pour la même durée. Les 200 plus récents sont affichés.
