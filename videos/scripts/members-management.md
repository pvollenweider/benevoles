# Construire et entretenir sa liste de membres

Vidéo autonome 34. Ton souriant, patient et concret. Expliquer le besoin, montrer chaque manipulation puis son résultat.

La narration vouvoie les organisateurs. Les heures planifiées concernent uniquement les créneaux passés confirmés et non annulés. Les heures attestées sont la part de ce total avec une présence enregistrée, sans chronométrage du travail réel.

## Jeu de données

Scénario `members-management`, après le seed de démonstration : 60 membres fictifs. Deux Stéphane Favre avec adresses distinctes, noms accentués, tags, disponibilités, une personne sans email et une personne inactive. Camille possède déjà plusieurs inscriptions et une activité consultable. Aucun score d'engagement n'est ajouté.

## Parcours

1. Montrer la liste remplie et expliquer qu'une fiche membre n'inscrit personne à un événement.
2. Cliquer « + Nouveau membre ». Saisir lentement prénom, nom, email et téléphone fictifs, puis créer. Montrer la nouvelle ligne et le total mis à jour.
3. Ouvrir « Éditer ». Ajouter des tags séparés par des virgules, une note pratique et des disponibilités. Enregistrer, rouvrir et prouver la persistance.
4. Montrer la différence entre note interne et commentaire d'inscription ; ne pas promettre une diffusion de la note au bénévole.
5. Créer une personne sans email, avec téléphone. Expliquer qu'on peut maintenir sa fiche, mais qu'aucun email ne peut lui être adressé tant que cette coordonnée manque.
6. Chercher un nom accentué sans taper l'accent. Montrer les résultats puis rechercher Stéphane Favre : deux personnes, deux contacts distincts. Ne pas confondre homonymie et doublon et ne pas annoncer une fusion inexistante.
7. Filtrer par tag, puis revenir à la liste complète. Montrer le tri par nom et par heures planifiées, en rappelant qu'il ne s'agit pas d'heures attestées.
8. Désactiver uniquement la nouvelle fiche de démonstration sans inscription, confirmer, puis cocher « Inclure inactifs » pour la retrouver. Ouvrir « Éditer » et réactiver via « Membre actif ». Montrer le retour dans la liste.
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
