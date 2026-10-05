# Gérer ses inscriptions depuis son lien personnel

Vidéo autonome 30, destinée aux bénévoles. Voix féminine souriante, patiente et rassurante, en une prise continue.

## Utilité

Retrouver ses engagements sans compte, lire les informations du jour J et prévenir l'organisation quand sa disponibilité change. Ne pas confondre une place confirmée, une attente, une offre et une demande à valider.

## Démonstration

1. Ouvrir le lien personnel de Camille depuis un email réel. Expliquer sa confidentialité et le conserver pour les prochaines consultations.
2. Lire le créneau Accueil confirmé : date, horaires, rendez-vous, consigne, carte et personne de contact. Ouvrir une carte locale de démonstration ou montrer son lien sans appel externe inutile.
3. Parcourir quatre cartes pour la même personne : inscription confirmée, liste d'attente avec position, place offerte avec échéance, demande soumise à validation. Expliquer que seules les inscriptions confirmées constituent un engagement acquis ; une demande reste à décider.
4. Ouvrir l'annulation du créneau confirmé puis choisir « Non, garder ». Vérifier que le créneau est toujours présent. Refaire l'action et confirmer : constater sa disparition, pas seulement la fermeture de la confirmation.
5. Quitter la liste d'attente, lire les conséquences et confirmer : plus de proposition de place pour ce créneau.
6. Refuser la place offerte, lire que la place passe à la personne suivante et constater la disparition de l'offre. Ne pas laisser penser qu'une offre vaut inscription confirmée.
7. Retirer la demande en attente de validation : la place réservée est libérée. Montrer le résultat dans la page personnelle.
8. Après le dernier retrait, montrer « Toutes tes inscriptions ont été annulées ». Utiliser « Retour à l'accueil » et vérifier la destination réelle : la page de l'événement permet de choisir un autre créneau.

## Résultat visible

Chaque retrait est vérifié dans l'interface et dans l'état serveur. Un refus de confirmation conserve l'engagement ; une confirmation le retire. La page vide et le retour au planning sont réellement montrés.

## Jeu de données à créer

Une seule personne, Camille, avec quatre statuts simultanés sur des créneaux non chevauchants : Accueil samedi 9–12 confirmé ; Buvette samedi 14–18 en attente ; Buvette samedi 18–22 offerte, échéance dans 24 heures ; Navette dimanche 8–10 demandée. Contacts et commentaires fictifs. Un email personnel correspondant au lien doit être émis dans Mailpit.

## Points d'attention

- Les autres fonctions de cette page (calendrier, disponibilités, push, renvoi du lien) sont montrées dans les vidéos spécialisées prévues au plan, pas promises comme réalisées ici.
- Ne pas affirmer que retirer un engagement supprime le profil de membre ou toute donnée personnelle.
- Après une annulation tardive, conseiller de prévenir aussi le contact sur place ; ne pas inventer un délai obligatoire de retrait que l'application n'applique pas.
- Limite produit observée : le lien est lié à une inscription vivante. Dès que cette inscription est retirée, recharger son lien renvoie 404, même si d'autres inscriptions de la personne restent vivantes. La page déjà ouverte conserve les autres cartes en mémoire et permet leurs retraits ; ne pas promettre que le lien retiré reste valide. Observation à évaluer pour le produit, sans modification de l'application dans ce travail vidéo.
- Le résultat vide après le dernier retrait est vérifié dans la page ouverte et par comptage direct des quatre statuts dans la base vidéo, pas en essayant de relire un lien devenu invalide.
- Routage de démonstration : le retour à l'événement est enrichi de `?org=default` par le réseau du recorder sur localhost. Le lien de production utilise le domaine de l'organisation ; ne pas présenter le 404 sans contexte d'organisation de l'environnement local comme un défaut de production.
- Nouvelle prise avec consignes courtes : huit paragraphes contrôlés indépendamment. Capture et assemblage terminés après correction de la vérification serveur finale et du contexte d'organisation au retour sur localhost. Planche contrôlée : quatre statuts, confirmations, retrait progressif, état vide et retour à l'événement visibles. Le visionnage audiovisuel intégral reste à faire avant livraison.
