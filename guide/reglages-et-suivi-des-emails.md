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
- **Prévenir les administrateurs à chaque inscription** : l'email envoyé à chaque administrateur actif quand un bénévole s'inscrit depuis la page publique.
- **Prévenir en cas de désistement** : réglage séparé du précédent, coché par défaut. Quand un bénévole annule une place confirmée ou une demande, un email part aux administrateurs actifs et aux responsables du poste concerné : qui se désiste, de quel créneau, combien de places manquent désormais, si la liste d'attente a repris la place, et le mot laissé par le bénévole le cas échéant (300 caractères maximum, jamais conservé une fois l'email envoyé). Quitter la liste d'attente ou refuser une place proposée ne prévient personne : rien à décider dans ces cas. Décoché, ni les administrateurs ni les responsables ne reçoivent cet email.
- **Adresse de réponse** : quand un bénévole répond à un email de l'application, sa réponse arrive à cette adresse (vide : l'adresse par défaut de la plateforme). Elle figure aussi sur la page personnelle des bénévoles (« Écrire à l'organisation »).
- **Résumé quotidien des adresses à vérifier** : coché par défaut. Un email par jour aux administrateurs actifs, seulement quand une confirmation, une proposition de liste d'attente ou un rappel a échoué définitivement depuis la veille, jamais pour un incident temporaire seul, et jamais plus d'un par jour même si plusieurs échecs se sont produits.
- **M'envoyer un email de test** : un email à votre propre adresse, avec les réglages enregistrés, pour vérifier l'expéditeur, l'adresse de réponse et le rendu (cinq par heure au plus).

Les textes personnalisables restent par événement : instructions publiques, message de confirmation et message de rappel dans les réglages de l'événement.

## Emails envoyés

La même page liste les emails de l'organisation des plus récents aux plus anciens : date, type (confirmation, rappel, message aux bénévoles…), destinataire et état :

- **En attente d'envoi** : mis en file, part dans la minute ;
- **Nouvel essai prévu** : le premier envoi a échoué pour une cause temporaire (incident chez notre serveur d'envoi, boîte pleine, délai dépassé…), l'application réessaie toute seule (jusqu'à six fois, à intervalles croissants) ;
- **Envoyé** : parti, avec l'heure ;
- **Échec définitif** : soit six essais temporaires épuisés, soit un rejet permanent du serveur destinataire (boîte inexistante, adresse refusée) qui arrête les essais tout de suite : ça ne sert à rien de réessayer une adresse qui n'existe pas. Dans les deux cas, une phrase en français explique la cause et le bouton **Renvoyer** remet l'email en file ;
- **Annulé** : l'email n'est jamais parti, volontairement : l'organisation a été désactivée avant son envoi, la personne a été supprimée des membres ou sa fiche a été fusionnée avec une autre. Il n'est jamais renvoyé, même si l'organisation est réactivée ensuite (pas de bouton **Renvoyer**).

**Ce que « accepté par le serveur d'envoi » veut dire, et ce que ça ne veut pas dire** : quand un envoi réussit, la seule chose prouvée est que notre propre serveur d'envoi (le relais SMTP) a accepté le message. Ce n'est ni une preuve de remise dans la boîte du destinataire, ni, à plus forte raison, une preuve de lecture : un relais de messagerie accepte en général toute adresse externe à la première étape, et n'apprend que plus tard, par un rebond invisible pour l'application, qu'une boîte n'existe pas. Un **rejet permanent** affiché ici reste donc la source la plus fiable aujourd'hui pour repérer une adresse à corriger, mais il ne couvre pas tous les cas : si un message a été accepté, l'application ne peut pas dire s'il a réellement atteint la bonne personne.

Un rejet permanent sur l'adresse actuelle d'un membre se retrouve aussi, sans avoir à parcourir cette page, sur sa fiche et dans la liste des membres (« Adresse à vérifier », voir [Gérer les membres](gerer-les-membres.md)) : même donnée, lue depuis l'endroit où vous corrigez l'adresse.

Les emails envoyés sont effacés chaque nuit (ils contiennent des données personnelles) ; ceux en échec restent 30 jours, comme le résultat détaillé de chaque envoi (destinataire concerné, type de message, résultat, raison), conservé pour la même durée. Les 200 plus récents sont affichés.
