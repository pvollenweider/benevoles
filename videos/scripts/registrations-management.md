# Lire, filtrer et gérer les inscriptions

Vidéo autonome 39. Voix souriante et calme. Chaque action doit montrer son résultat réel et les messages produits, sans accumuler de commandes trop rapidement.

## Parcours de démonstration

1. Parcourir une liste de 80 inscriptions : identité, coordonnées, poste, horaires, source, réponses aux questions, commentaires, disponibilités et statuts. Distinguer inscription et personne : une même personne peut avoir plusieurs lignes.
2. Rechercher un nom ou un email, filtrer par poste et par créneau. Montrer le nombre de résultats puis réinitialiser les filtres.
3. Ouvrir Demandes à traiter et montrer une demande sans la présenter comme une présence confirmée. La procédure de décision est déjà un parcours spécialisé ; rappeler son sens sans omettre le résultat visible.
4. Ajouter manuellement Camille avec un créneau et un commentaire. Montrer les différents champs, un doublon réellement refusé, puis un avertissement de chevauchement et enfin un horaire compatible ajouté. L'ajout manuel ne bloque pas le chevauchement : ne jamais raconter qu'il le refuse. Ne pas enregistrer volontairement un conflit pour cette démonstration.
5. Sélectionner une ligne, puis plusieurs lignes. Montrer les actions proposées et Effacer. Expliquer que les filtres ne remplacent pas la sélection.
6. Renvoyer le lien personnel avec récapitulatif et confirmation. Sélectionner deux inscriptions d'une même personne et vérifier qu'un seul email est remis ; ouvrir le vrai email contenant le lien vers son récapitulatif, sans annoncer une liste de créneaux dans cet email.
7. Désigner un responsable de poste depuis une inscription avec email. Montrer le récapitulatif, le badge Responsable et l'email reçu. La vue détaillée du responsable est couverte par son module autonome ; ici montrer au minimum le résultat de nomination.
8. Retirer une inscription : lire le récapitulatif puis vérifier l'impact réel. Utiliser Annuler pendant le délai et vérifier que la ligne revient sans retrait enregistré. Refaire le retrait sur le nouvel horaire de Camille et vérifier la place libérée. Vérifier le vrai email de retrait reçu par Camille, son créneau et la place libérée ; ne pas confondre remise SMTP et lecture.
9. Montrer un avertissement de charge sur une personne ayant plusieurs horaires compatibles mais une journée chargée. Expliquer qu'il conseille l'organisateur et ne prouve pas une indisponibilité.
10. Conclure avec une liste à jour et les liens vers le journal pour retrouver les actions.

## Jeu de données et limites

Le seed spécialisé prépare 80 inscriptions, sources publique/manuelle, et les quatre statuts vivants actif/attente/offre/demande. Les inscriptions annulées ne sont pas chargées dans cette liste : leur historique relève du journal. Les questions sont déjà renseignées pour plusieurs bénévoles du seed de base. Noah possède trois créneaux compatibles totalisant dix heures, avec de vraies pauses ; le helper de charge du produit vérifie ce résultat dans le seed.

Camille : Accueil 9–12 déjà enregistré ; Buvette 10–14 en conflit (simple avertissement admin), Accueil 15–18 ajouté puis retiré. Sarah : nomination responsable Accueil. Deux lignes confirmées de Camille : renvoi d'un seul email. Le recorder doit vérifier les réponses réelles et les conséquences en base, sans afficher de jeton personnel dans ses rapports.

## État

Prévisualisation MP4 générée : quatorze paragraphes recalés et contrôlés indépendamment, durées et planche de quarante-deux images vérifiées. `registration-checks.json` consigne les résultats réels : 80 lignes, doublon refusé, conflit averti sans soumission, fiche Camille réutilisée, un email pour deux lignes, nomination/badge, retrait annulé sans effet puis retrait réel et place libérée. Cette ancienne prise ne valide pas le comportement actuel : le retrait envoie désormais un email. Le passage et sa narration sont mis à jour pour le build courant. Visionnage audiovisuel intégral restant.

## Comportement actuel du retrait

Le build courant annule, journalise, libère la place et enfile un email de retrait par personne et événement. La répétition du 12 octobre 2026 a constaté sa réception locale. Le recorder doit comparer la boîte avant/après et lire le vrai message, sans en fabriquer un ni présenter sa réception comme une preuve de lecture. L'ancien écart entre récapitulatif et envoi est résolu ; les anciennes preuves vidéo ne valident pas ce nouveau passage.
