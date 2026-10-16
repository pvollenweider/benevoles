# Construire et entretenir sa liste de membres

Vidéo autonome 34. Ton souriant, patient et concret. Expliquer le besoin, montrer chaque manipulation puis son résultat.

La narration vouvoie les organisateurs. Les heures prévues comptent les créneaux confirmés passés et à venir, non annulés ; les chevauchements sont comptés une seule fois. Les heures attestées sont la part de ce total avec une présence enregistrée, sans chronométrage du travail réel.

## Jeu de données

Scénario `members-management`, après le seed de démonstration : 60 membres fictifs. Deux Stéphane Favre avec adresses distinctes, noms accentués, tags, disponibilités, une personne sans email et une personne inactive. Camille possède déjà plusieurs inscriptions et une activité consultable. Aucun score d'engagement n'est ajouté.

## Parcours

1. Montrer la liste remplie et expliquer qu'une fiche membre n'inscrit personne à un événement.
2. Cliquer « + Nouveau membre ». Saisir lentement prénom, nom, email et téléphone fictifs, puis créer. Montrer la nouvelle ligne et le total mis à jour.
3. Ouvrir « Modifier ». Ajouter des tags séparés par des virgules, une note pratique et des disponibilités. Enregistrer, rouvrir et prouver la persistance.
4. Montrer la différence entre note interne et commentaire d'inscription ; ne pas promettre une diffusion de la note au bénévole.
5. Créer une personne sans email, avec téléphone. Expliquer qu'on peut maintenir sa fiche, mais qu'aucun email ne peut lui être adressé tant que cette coordonnée manque.
6. Chercher un nom accentué sans taper l'accent. Montrer les résultats puis rechercher Stéphane Favre : deux personnes, deux contacts distincts. Ne pas confondre homonymie et doublon et ne pas annoncer une fusion inexistante.
7. Filtrer par étiquette, puis revenir à la liste complète. Montrer le tri par nom et par heures prévues, en rappelant qu'il ne s'agit pas d'heures attestées.
8. Désactiver uniquement la nouvelle fiche de démonstration sans inscription, confirmer, puis cocher « Inclure inactifs » pour la retrouver. Ouvrir « Modifier » et réactiver via « Membre actif ». Montrer le retour dans la liste.
9. Ouvrir « Activité de Camille Rochat ». Parcourir une vue réellement renseignée, les événements, statuts et dates disponibles. Ne pas assimiler inscription et présence réelle.
10. Résumer : coordonnées à jour, catégories utiles, historique factuel. Limiter les notes aux informations nécessaires à l'organisation.

## Contrôles avant livraison

- Le seed ne s'exécute que dans la base vidéo ; il est idempotent sur ses 36 fiches dédiées.
- Vérifier que le jeu de données comporte effectivement 60 membres et des inscriptions visibles pour Camille.
- Chaque création, modification, désactivation et réactivation doit être réelle et vérifiée après rechargement.
- Confirmer les conséquences de désactivation dans le produit avant de commenter autre chose que la fiche sans inscription filmée.
- Les champs Notes n'existent que dans l'édition actuelle : ne pas chercher à les remplir dans le formulaire de création.
- Audit des paroles, capture et visionnage intégral requis ; aucun résultat n'est déclaré validé sur la seule présence d'un script.

État : narration continue Puck et dix paragraphes contrôlés indépendamment ; capture, assemblage et planche visuelle contrôlés. Les données et manipulations ont été vérifiées par le recorder. Le visionnage audiovisuel intégral reste à effectuer avant livraison.


## Révision du 2026-10-16 — lot 22-5

Relecture du produit main `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased] et PR fusionnées #990 à #1012, #1021 (onglets lot 2), #1022 (#1013). Étiquettes, Modifier, Heures prévues, navigation Inscriptions / Invitations et Documents à imprimer vérifiées dans les scénarios.

WAITING TTS — plafond mensuel connu ; aucun nouvel appel. Régénérer la narration ENTIÈRE, même voix, une seule passe, `continuousPauseTags: false`. Phrases changées :

- Avec Modifier, vous pouvez corriger la fiche et ajouter des informations.
- Les étiquettes, séparées par des virgules, servent à retrouver un groupe, comme accueil ou permis b.
- Gardez-la courte et évitez les informations personnelles inutiles.
- Avec le filtre d’étiquettes, vous pouvez afficher seulement les personnes d'une catégorie, puis revenir à Toutes les étiquettes.
- Les heures prévues comptent les créneaux confirmés, passés et à venir, sans compter deux fois les horaires qui se chevauchent.
- Les heures attestées comptent les créneaux passés avec une présence enregistrée, sans chronométrer le travail réel.
- Dans Modifier, la case Membre actif permet de la réactiver.
- Mettez les fiches à jour quand une personne vous signale un changement.
- Utilisez les disponibilités pour dialoguer, pas pour décider à sa place.
- Et gardez seulement les notes nécessaires : l'objectif est de faciliter l'organisation, pas de constituer un dossier sur les bénévoles.
