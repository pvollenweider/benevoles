---
roles: [admin]
group: publier
order: 10
summary: Vérifier ce qui manque, prévisualiser comme un bénévole, puis publier l'événement, répertorié ou non sur la page publique.
related: [partager-le-lien, ouvrir-et-fermer-les-inscriptions, archiver-ou-supprimer-un-evenement]
legacy: [admin#publier-un-evenement, admin#brouillon-publie-repertorie-archive, admin#vue-publique]
aliases: []
---

# Publier un événement

> « Le vrai soulagement, c'est de ne plus devoir envoyer une confirmation à chaque personne. On a pu consacrer ce temps au reste de la préparation. »
>
> Exemple de situation : Sarah, association culturelle

<!-- video: EVENT_REVIEW_PUBLISH -->

## Brouillon, publié, répertorié, archivé

| État | Page d'inscription | Sur la page publique de l'organisation |
|---|---|---|
| Brouillon | inaccessible (sauf l'aperçu admin) | non |
| Publié, répertorié | accessible par son lien | oui, avec la liste publique et le sitemap |
| Publié, **non répertorié** | accessible par son lien | non : absent de la page d'accueil, de la liste publique et du sitemap, et non indexé par les moteurs de recherche |
| Archivé | inaccessible | non |

**Où en est l'événement ?** En haut de sa page, une barre d'étapes le situe : **Brouillon**, puis **Prêt à publier**, puis **Publié**, puis **Terminé**, puis **Archivé**. « Prêt à publier » est un brouillon qui a au moins un créneau ; « Terminé » un événement publié dont le dernier jour est passé. Sous la barre, **À faire** dit ce qui manque encore (par exemple « aucun créneau ») et **Concrètement** ce que l'étape signifie : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.

**Non répertorié** sert à séparer des publics : par exemple un planning réservé aux organisateurs, avec les mêmes postes que celui des bénévoles, que l'on ne veut pas voir sur la page d'accueil. Dans le formulaire d'édition, décochez **Afficher cet événement sur la page publique de l'organisation**, puis partagez le lien ou le QR code aux personnes concernées. L'administration affiche alors « Publié, non répertorié ».

Ce n'est pas une protection : toute personne qui a le lien, ou qui le devine, peut ouvrir l'événement et s'y inscrire, et l'application ne propose pas de mot de passe. Pour réserver un poste à certains membres, utilisez l'**Accès réservé** (voir [Gérer les postes](gerer-les-postes.md)). Une copie ou un événement créé depuis un modèle est toujours répertorié : le choix se refait pour chaque événement.

## Vérification et publication

**Avant de publier**, **Prévisualiser comme un bénévole**, sur la page de vérification, ou **Aperçu bénévole**, dans l'onglet **Partage** de l'événement, montre la page publique exactement comme la verront les bénévoles, même tant que l'événement est en brouillon : planning et places, pages personnalisées, charte, champs demandés dans le formulaire (téléphone si vous l'avez rendu obligatoire, date de naissance pour un créneau avec âge minimum). Vous pouvez remplir le formulaire : au lieu de vous inscrire, l'aperçu affiche le message de confirmation et l'email que recevrait le bénévole. Rien n'est enregistré ni envoyé. Pour voir le rendu sur téléphone, réduisez la largeur de la fenêtre ou ouvrez l'aperçu depuis votre téléphone.

La page **Vérifier avant publication** (dernière étape de la [création](creer-un-evenement.md)) fait le tour de ce qui est prêt et de ce qui manque encore : dates, créneaux, lieu, message de confirmation, instructions, responsables, puis les points ci-dessous. Les points **À faire** (marqués d'un !) bloquent la publication ; les champs **Facultatif** (marqués d'un –) peuvent rester vides. Elle signale aussi, sans jamais bloquer la publication, des points **À vérifier** (marqués d'un ?), chacun avec une phrase d'explication et un lien vers l'endroit où le corriger :

- **Infos pratiques des créneaux** : le nombre de créneaux sans lieu de rendez-vous ou sans personne de contact (« 3 créneaux sans lieu ni contact »), ce que les bénévoles retrouvent dans l'email de confirmation, les rappels et leur page personnelle. Le lieu de l'événement vaut pour tous ses créneaux, comme son **Contact le jour J** pour tous les créneaux sans contact. Lien vers les créneaux.
- **Inscriptions** : ouvertes dès la publication (avec l'heure de fermeture si elle est programmée), ouverture programmée à une date donnée, ou fermées sans date d'ouverture, dans le fuseau de l'organisation. Une ouverture programmée ne compte que si la case **Inscriptions ouvertes** est cochée, et la vérification le rappelle. Lien vers les réglages de l'événement.
- **Rappels automatiques**, seulement s'il reste un créneau à venir : tous envoyés, en partie ou entièrement désactivés pour l'organisation (lien vers **Paramètres**, puis **Emails**), ou coupés pour cet événement (lien **Modifier** vers la case **Rappels automatiques** du formulaire de l'événement).
- **Couverture**, une fois l'événement publié : places occupées et créneaux incomplets (« 46 places occupées sur 52, 3 créneaux incomplets »), avec le lien **Voir les créneaux incomplets** vers la page [Où manque-t-il du monde ?](ou-manque-t-il-du-monde.md).

![Section « Vérification » d'un événement publié : huit points cochés (dates, créneaux, lieu, message de confirmation, instructions, responsables, inscriptions ouvertes, rappels J-2, J-1 et du jour), chacun avec un lien « Modifier » ou « Réglages des emails », et deux points « À vérifier » marqués d'un point d'interrogation, « 11 créneaux sans contact » avec le lien « Ajouter », et « 30 places occupées sur 44, 8 créneaux incomplets » avec le lien « Voir les créneaux incomplets »](/doc-img/admin-event-review.png)

Tant que l'événement n'est pas publié, la section **Publication**, sous la vérification, dit aussi où en est le réglage « Qui est inscrit » (voir [le réglage dans Créer un événement](creer-un-evenement.md#page-blanche)). Activé, ce qui est le cas par défaut pour un nouvel événement, la note « « Qui est inscrit » est activé : prévenez vos bénévoles. » rappelle votre devoir d'information, avec le lien **En savoir plus** vers [Prévenir les bénévoles déjà inscrits](creer-un-evenement.md#prevenir-les-benevoles-deja-inscrits) et son message à adapter. Désactivé, elle le dit, et précise que l'activer, maintenant ou plus tard, ne change rien à la publication. Dans les deux cas, le lien **Modifier le réglage « Qui est inscrit »** ouvre la case du formulaire de l'événement. Ce n'est qu'une information : elle ne bloque jamais la publication, et le réglage peut changer avant comme après la publication, quand des bénévoles sont déjà inscrits : voir [Activer « Qui est inscrit » sur un événement qui a déjà des inscrits](creer-un-evenement.md#activer-qui-est-inscrit-sur-un-evenement-qui-a-deja-des-inscrits).

![Section « Publication » d'un brouillon : « Publier rend la page d'inscription accessible à qui a le lien. Rien n'est envoyé aux membres tant que vous ne les invitez pas. », puis la note « « Qui est inscrit » est activé : prévenez vos bénévoles. » avec les liens « En savoir plus » et « Modifier le réglage « Qui est inscrit » », le bouton « Publier » et le lien « Rester en brouillon pour l'instant »](/doc-img/admin-roster-publish-note.png)

En vidéo : [montrer aux bénévoles qui est inscrit](/videos/SHIFT_ROSTER_VISIBILITY#doc).

Tant que l'événement est un brouillon, son aperçu reprend cette liste sous **Prochaines étapes**, avec le lien **Vérifier avant publication**. Pour publier, cliquer sur **Publier**, le bouton principal en haut des pages de l'événement dès qu'il a un créneau (avant, ce bouton est **Ajouter des créneaux**).

L'événement devient alors visible à l'URL :

```
https://[slug-organisation].benevol.app/[slug-evenement]
```

Le slug de l'organisation est un sous-domaine, pas un chemin : chaque organisation a sa propre adresse.

## Vue publique

Dans l'onglet **Partage**, le lien **Ouvrir la page publique ↗** apparaît dès que l'événement est publié. Il ouvre la page telle qu'un bénévole la voit, dans un nouvel onglet. Pratique pour vérifier l'affichage avant de partager (voir [Partager le lien de l'événement](partager-le-lien.md)). Quand plusieurs clubs ou équipes recrutent chacun pour leurs postes, donnez-leur [un lien par groupe](partager-le-lien.md#un-lien-par-groupe), filtré sur leurs postes.
