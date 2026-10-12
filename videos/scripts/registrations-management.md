# Lire, filtrer et gérer les inscriptions

Vidéo autonome 39. Voix souriante et calme. Chaque action doit montrer son résultat réel et les messages produits, sans accumuler de commandes trop rapidement.

## Parcours de démonstration

1. Parcourir une liste de 80 inscriptions : identité, coordonnées, poste, horaires, source, réponses aux questions, commentaires, disponibilités et statuts. Distinguer inscription et personne : une même personne peut avoir plusieurs lignes.
2. Rechercher un nom ou un email, filtrer par poste et par créneau. Montrer le nombre de résultats puis réinitialiser les filtres.
3. Ouvrir Demandes à traiter et montrer une demande sans la présenter comme une présence confirmée. La procédure de décision est déjà un parcours spécialisé ; rappeler son sens sans omettre le résultat visible.
4. Ajouter manuellement Camille en la cherchant comme membre existant, puis Choisir, un créneau et un commentaire. Lire l’annonce d’email avant validation, puis ouvrir le vrai email regroupé après passage de la ligne outbox à échéance et appel authentifié du cron. Montrer les différents champs, un doublon réellement refusé, puis un avertissement de chevauchement et enfin un horaire compatible ajouté. L'ajout manuel ne bloque pas le chevauchement : ne jamais raconter qu'il le refuse. Ne pas enregistrer volontairement un conflit pour cette démonstration.
5. Sélectionner une ligne, puis plusieurs lignes. Montrer les actions proposées et Effacer. Expliquer que les filtres ne remplacent pas la sélection.
6. Renvoyer le lien personnel avec récapitulatif et confirmation. Sélectionner deux inscriptions d'une même personne et vérifier qu'un seul email est remis ; ouvrir le vrai email contenant le lien vers son récapitulatif, sans annoncer une liste de créneaux dans cet email.
7. Désigner un responsable de poste depuis une inscription avec email. Montrer le récapitulatif, le badge Responsable et l'email reçu. La vue détaillée du responsable est couverte par son module autonome ; ici montrer au minimum le résultat de nomination.
8. Retirer une inscription : lire le récapitulatif puis vérifier l'impact réel. Utiliser Annuler pendant le délai et vérifier que la ligne revient sans retrait enregistré. Refaire le retrait sur le nouvel horaire de Camille et vérifier la place libérée. Vérifier le vrai email de retrait reçu par Camille, son créneau et la place libérée ; ne pas confondre remise SMTP et lecture.
9. Montrer un avertissement de charge sur une personne ayant plusieurs horaires compatibles mais une journée chargée. Expliquer qu'il conseille l'organisateur et ne prouve pas une indisponibilité.
10. Conclure avec une liste à jour et les liens vers le journal pour retrouver les actions.

## Jeu de données et limites

Le seed spécialisé prépare 80 inscriptions, sources publique/manuelle, et les quatre statuts vivants actif/attente/offre/demande. Les inscriptions annulées ne sont pas chargées dans cette liste : leur historique relève du journal. Les questions sont déjà renseignées pour plusieurs bénévoles du seed de base. Noah possède trois créneaux compatibles totalisant dix heures, avec de vraies pauses ; le helper de charge du produit vérifie ce résultat dans le seed.

Camille : Accueil 9–12 déjà enregistré ; Buvette 10–14 en conflit (simple avertissement admin), Accueil 15–18 ajouté puis retiré. Sarah : nomination responsable Accueil. Deux lignes confirmées de Camille : renvoi d'un seul email. Le recorder doit vérifier les réponses réelles et les conséquences en base, sans afficher de jeton personnel dans ses rapports.

## État — première passe du batch 13

READY local : 344,280 secondes, build `e44004c` / `EEyJJLNfRQviqfGUxjSM7`. Formulaire courant avec membre choisi, annonce d’email et vrai envoi groupé par `POST /api/cron/outbox`. Narration Puck continue régénérée pour le transcript modifié, treize frontières vérifiées dans les silences ; audits source et MP4 passent. Validation des quatorze chapitres, 31 repères de phrase avec frames, 79 blocs de sous-titres et effets de 53 clics/29 frappes contrôlés. Ajustement musical de +0,5 dB après une fenêtre hors règle : 13,4–19,7 LU sous la voix, sans assouplir les seuils ni refaire le tournage.

Douze revues audiovisuelles sans signalement. Les deux autres sont contre-vérifiées : badge Responsable lisible à 21,0 s pendant sa phrase (17,994–23,053 s), journal toujours affiché à 9,809 s avant le retour calé sur la phrase suivante à 10,009 s. Les frames et les assertions réelles réfutent les absences et l’avance alléguées ; aucune alerte n’est simplement effacée. Dates anglaises de Mailpit et valeurs brutes du journal restent les écarts connus à signaler. La recherche du nom complet ne trouve pas Camille ; sa recherche par email fonctionne. Aucun changement applicatif ni publication.

## Comportement actuel du retrait

Le build courant annule, journalise, libère la place et enfile un email de retrait par personne et événement. La répétition du 12 octobre 2026 a constaté sa réception locale. Le recorder doit comparer la boîte avant/après et lire le vrai message, sans en fabriquer un ni présenter sa réception comme une preuve de lecture. L'ancien écart entre récapitulatif et envoi est résolu ; les anciennes preuves vidéo ne valident pas ce nouveau passage.

## Narration actualisée — batch 13

### manual-identity

Un bénévole vous confirme un nouvel horaire par téléphone ? Cliquez sur Ajouter manuellement. Dans Membre existant, cherchez Camille par son nom ou son email, puis cliquez sur Chercher. Cliquez sur Choisir. Le résumé Membre choisi reprend ses coordonnées, sans créer une nouvelle fiche. Ajoutons une courte note : horaire convenu par téléphone. Pour une nouvelle personne, vous pouvez aussi remplir les champs sous la recherche. Sans adresse email, aucun message de confirmation ne part.

### manual-check

Ouvrons le choix du créneau. Déjà inscrit signale l'horaire que Camille possède déjà. Si nous essayons de l'ajouter une seconde fois, le système refuse ce doublon. Sur la buvette du matin, l'indication conflit signale un chevauchement avec son accueil. Dans l'ajout manuel, c'est un avertissement à lire avant de décider : ne le confondez pas avec un contrôle bloquant. Choisissons plutôt un horaire compatible.

### manual-result

Nous choisissons l'accueil de quinze à dix-huit heures. Avant de valider, lisez l'annonce : un email de confirmation partira à Camille dans une dizaine de minutes. Il regroupe les créneaux ajoutés pour cette personne et cet événement après le dernier ajout. Cliquez sur Ajouter. La nouvelle ligne apparaît avec la source Manuel et notre note. Dix minutes plus tard, ouvrons le véritable email reçu. Il indique qui a inscrit Camille, son créneau et son lien personnel. Nous revenons ensuite à la liste des inscriptions.

Les anciens champs ressaisis et l’affirmation d’absence d’email sont remplacés. Une seule génération continue est requise : le transcript changé invalide son empreinte globale. Le cron réel délivre la confirmation avant les chapitres de sélection ; aucun faux email.

## État — reprise de la boîte email, batch 13

NOT READY local : 344,320 secondes, même build `e44004c` / `EEyJJLNfRQviqfGUxjSM7`, narration auditée réutilisée sans régénération. Les anciens messages des fixtures Montvert sont supprimés par identifiant avant la prise, les autres conservés ; aucune ancienne confirmation en attente pour Camille ne reste. Mailpit s’ouvre via le résultat de recherche et vérifie les identifiants réellement visibles. Frames finales : une seule confirmation à 172 s, puis 2, 3 et 4 emails, tous de cette prise. ASR source/MP4, sous-titres, effets (57 clics/29 frappes), posters et validation passent ; musique 13,5–19,7 LU.

La revue confirme néanmoins un choix de créneau compatible tardif : phrase de 143,145 à 145,723 s, choix effectif à 147,644 s. Source corrigée : l’action attend maintenant `at("Choisissons plutôt un horaire compatible")` dans le chapitre de vérification, avant le chapitre de résultat. Selon la consigne du batch, aucune nouvelle prise après cette correction de timing ; le MP4 actuel conserve le retard et reste NOT READY. Les autres alertes sur le menu, le badge et le journal sont réfutées par frames et repères mesurés, sans effacer leurs rapports. Aucune publication.
