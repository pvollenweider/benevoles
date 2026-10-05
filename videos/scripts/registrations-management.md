# Lire, filtrer et gérer les inscriptions

Vidéo autonome 39. Voix souriante et calme. Chaque action doit montrer son résultat réel et les messages produits, sans accumuler de commandes trop rapidement.

## Parcours de démonstration

1. Parcourir une liste de 80 inscriptions : identité, coordonnées, poste, horaires, source, réponses aux questions, commentaires, disponibilités et statuts. Distinguer inscription et personne : une même personne peut avoir plusieurs lignes.
2. Rechercher un nom ou un email, filtrer par poste et par créneau. Montrer le nombre de résultats puis réinitialiser les filtres.
3. Ouvrir Demandes à traiter et montrer une demande sans la présenter comme une présence confirmée. La procédure de décision est déjà un parcours spécialisé ; rappeler son sens sans omettre le résultat visible.
4. Ajouter manuellement Camille avec un créneau et un commentaire. Montrer les différents champs, un doublon réellement refusé, puis un avertissement de chevauchement et enfin un horaire compatible ajouté. L'ajout manuel ne bloque pas le chevauchement : ne jamais raconter qu'il le refuse. Ne pas enregistrer volontairement un conflit pour cette démonstration.
5. Sélectionner une ligne, puis plusieurs lignes. Montrer les actions proposées et Effacer. Expliquer que les filtres ne remplacent pas la sélection.
6. Renvoyer le lien personnel avec récapitulatif et confirmation. Sélectionner deux inscriptions d'une même personne et vérifier qu'un seul email est remis ; ouvrir le vrai email.
7. Désigner un responsable de poste depuis une inscription avec email. Montrer le récapitulatif, le badge Responsable et l'email reçu. La vue détaillée du responsable est couverte par son module autonome ; ici montrer au minimum le résultat de nomination.
8. Retirer une inscription : lire le récapitulatif puis vérifier l'impact réel. Utiliser Annuler pendant le délai et vérifier que la ligne revient sans retrait enregistré. Refaire le retrait sur le nouvel horaire de Camille et vérifier la place libérée. Ne pas prétendre qu'un email part : le helper actuel ne l'envoie pas, contrairement au récapitulatif. La narration de prévisualisation signale cette différence.
9. Montrer un avertissement de charge sur une personne ayant plusieurs horaires compatibles mais une journée chargée. Expliquer qu'il conseille l'organisateur et ne prouve pas une indisponibilité.
10. Conclure avec une liste à jour et les liens vers le journal pour retrouver les actions.

## Jeu de données et limites

Le seed spécialisé prépare 80 inscriptions, sources publique/manuelle, et les quatre statuts vivants actif/attente/offre/demande. Les inscriptions annulées ne sont pas chargées dans cette liste : leur historique relève du journal. Les questions sont déjà renseignées pour plusieurs bénévoles du seed de base. Noah possède trois créneaux compatibles totalisant dix heures, avec de vraies pauses ; le helper de charge du produit vérifie ce résultat dans le seed.

Camille : Accueil 9–12 déjà enregistré ; Buvette 10–14 en conflit (simple avertissement admin), Accueil 15–18 ajouté puis retiré. Sarah : nomination responsable Accueil. Deux lignes confirmées de Camille : renvoi d'un seul email. Le recorder doit vérifier les réponses réelles et les conséquences en base, sans afficher de jeton personnel dans ses rapports.

## État

Prévisualisation MP4 générée : quatorze paragraphes recalés et contrôlés indépendamment, durées et planche de quarante-deux images vérifiées. `registration-checks.json` consigne les résultats réels : 80 lignes, doublon refusé, conflit averti sans soumission, fiche Camille réutilisée, un email pour deux lignes, nomination/badge, retrait annulé sans effet puis retrait réel et place libérée. L'absence d'email de retrait est mesurée et signalée par la narration. Visionnage audiovisuel intégral restant.

## Écart produit à ne pas masquer

`bulkCancelRecap` annonce un email d'annulation ; la route bulk appelle `cancelRegistrations`, qui annule, journalise et promeut éventuellement une attente, mais n'envoie ni n'enfile de notification d'annulation à la personne retirée. `logEvent` ne déclenche pas d'email non plus. Le contrôle de capture doit mesurer la boîte locale avant/après, sans simuler un email. La prévisualisation reste honnête sur ce point ; le passage devra être refait si le produit est corrigé. Aucun changement au code produit ni ticket externe créé dans ce travail.
