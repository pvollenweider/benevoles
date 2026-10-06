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

<!-- video: EVENT_REVIEW_PUBLISH -->

## Brouillon, publié, répertorié, archivé

| État | Page d'inscription | Sur la page publique de l'organisation |
|---|---|---|
| Brouillon | inaccessible (sauf l'aperçu admin) | non |
| Publié, répertorié | accessible par son lien | oui, avec la liste publique et le sitemap |
| Publié, **non répertorié** | accessible par son lien | non : absent de la page d'accueil, de la liste publique et du sitemap, et non indexé par les moteurs de recherche |
| Archivé | inaccessible | non |

**Où en est l'événement ?** En haut de sa page, une barre d'étapes le situe : **Brouillon → Prêt à publier → Publié → Terminé → Archivé**. « Prêt à publier » est un brouillon qui a au moins un créneau ; « Terminé » un événement publié dont le dernier jour est passé. Sous la barre, **À faire** dit ce qui manque encore (par exemple « aucun créneau ») et **Concrètement** ce que l'étape signifie : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.

**Non répertorié** sert à séparer des publics : par exemple un planning réservé aux organisateurs, avec les mêmes postes que celui des bénévoles, que l'on ne veut pas voir sur la page d'accueil. Dans le formulaire d'édition, décochez **Afficher cet événement sur la page publique de l'organisation**, puis partagez le lien ou le QR code aux personnes concernées. L'administration affiche alors « Publié, non répertorié ».

Ce n'est pas une protection : toute personne qui a le lien, ou qui le devine, peut ouvrir l'événement et s'y inscrire, et l'application ne propose pas de mot de passe. Pour réserver un poste à certains membres, utilisez l'**Accès réservé** (voir [Gérer les postes](gerer-les-postes.md)). Une copie ou un événement créé depuis un modèle est toujours répertorié : le choix se refait pour chaque événement.

## Vérification et publication

**Avant de publier**, le bouton **Prévisualiser comme un bénévole** de la page de l'événement montre la page publique exactement comme la verront les bénévoles, même tant que l'événement est en brouillon : planning et places, pages personnalisées, charte, champs demandés dans le formulaire (téléphone si vous l'avez rendu obligatoire, date de naissance pour un créneau avec âge minimum). Vous pouvez remplir le formulaire : au lieu de vous inscrire, l'aperçu affiche le message de confirmation et l'email que recevrait le bénévole. Rien n'est enregistré ni envoyé. Pour voir le rendu sur téléphone, réduisez la largeur de la fenêtre ou ouvrez l'aperçu depuis votre téléphone.

La page **Vérification et publication** (`/admin/events/[id]/review`, dernière étape de la [création](creer-un-evenement.md)) fait le tour de ce qui est prêt et de ce qui manque encore : dates, créneaux, lieu, message de confirmation, instructions, responsables, puis les points ci-dessous. Les points **À faire** (marqués d'un !) bloquent la publication ; les champs **Facultatif** (marqués d'un –) peuvent rester vides. Elle signale aussi, sans jamais bloquer la publication, des points **À vérifier** (marqués d'un ?), chacun avec une phrase d'explication et un lien vers l'endroit où le corriger :

- **Infos pratiques des créneaux** : le nombre de créneaux sans lieu de rendez-vous ou sans personne de contact (« 3 créneaux sans lieu ni contact »), ce que les bénévoles retrouvent dans l'email de confirmation, les rappels et leur page personnelle. Le lieu de l'événement vaut pour tous ses créneaux, comme son **Contact le jour J** pour tous les créneaux sans contact. Lien vers les créneaux.
- **Inscriptions** : ouvertes dès la publication (avec l'heure de fermeture si elle est programmée), ouverture programmée à une date donnée, ou fermées sans date d'ouverture, dans le fuseau de l'organisation. Une ouverture programmée ne compte que si la case **Inscriptions ouvertes** est cochée, et la vérification le rappelle. Lien vers les réglages de l'événement.
- **Rappels automatiques**, seulement s'il reste un créneau à venir : tous envoyés, en partie ou entièrement désactivés pour l'organisation (lien vers **Paramètres → Emails**), ou coupés pour cet événement (lien **Modifier** vers la case **Rappels automatiques** du formulaire de l'événement).
- **Couverture**, une fois l'événement publié : places occupées et créneaux incomplets (« 46 places occupées sur 52, 3 créneaux incomplets »), avec le lien **Voir les créneaux incomplets** vers la page [Où manque-t-il du monde ?](ou-manque-t-il-du-monde.md).

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**.

L'événement devient alors visible à l'URL :

```
https://[slug-organisation].benevol.app/[slug-evenement]
```

Le slug de l'organisation est un sous-domaine, pas un chemin : chaque organisation a sa propre adresse.

## Vue publique

Le lien **Vue publique ↗** apparaît sur la page admin dès que l'événement est publié. Il ouvre la page telle qu'un bénévole la voit, dans un nouvel onglet. Pratique pour vérifier l'affichage avant de partager (voir [Partager le lien de l'événement](partager-le-lien.md)).
