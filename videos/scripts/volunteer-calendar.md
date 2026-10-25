# Ajouter son planning au calendrier

Vidéo autonome 31. Explication souriante et patiente, sans présenter le calendrier comme un abonnement synchronisé.

## Utilité

Retrouver les créneaux confirmés dans l'agenda que le bénévole utilise déjà, avec les horaires, le lieu et les consignes.

## Démonstration

1. Depuis la page Mes inscriptions de Camille, montrer trois créneaux confirmés et une attente.
2. Télécharger un seul créneau avec « Ajouter à mon calendrier » ; vérifier que le fichier contient exactement un événement.
3. Télécharger « Télécharger tout mon planning » (carte « Mon calendrier ») ; vérifier les trois événements et l'absence de la liste d'attente.
4. Expliquer l'import dans son agenda sans ouvrir une application native, selon la décision de Philippe de poursuivre sans accès à Calendrier. Montrer les informations correspondantes sur la page Benevol et vérifier leur présence dans le fichier réellement téléchargé. Ne pas annoncer un import effectué.
5. Montrer le créneau de nuit : samedi 22 h à dimanche 2 h. Vérifier les dates, le fuseau et la durée réelle dans le fichier ; ne pas prétendre avoir vérifié un rendu dans un agenda externe.
6. Expliquer l'ouverture dans Apple, Google ou Outlook ; ne pas faire passer un visualiseur maison pour l'un de ces logiciels. Toute importation annoncée comme vérifiée doit être réellement réalisée dans un environnement de démonstration approprié.
7. Modifier le créneau de nuit côté organisateur. Montrer que l'ancien fichier conserve l'ancien horaire : il ne se met pas à jour automatiquement.
8. Télécharger la nouvelle version, vérifier le même identifiant d'événement et le nouvel horaire. Expliquer la réimportation, sans présenter un résultat externe non filmé ni promettre un remplacement universel dans tous les calendriers.

## Données

Scénario `personal-calendar`, lancé après `demo` : Accueil samedi 9–12, Rangement samedi 22–dimanche 2, Buvette dimanche 10–14 ; attente samedi 14–18. Trois inscriptions confirmées exactement, coordonnées fictives, GPS et consignes.

## Vérifications

- Fichiers réellement téléchargés par le navigateur, pas recréés pour la vidéo.
- Comptage des VEVENT, identifiants stables, heures UTC converties en Europe/Zurich et fin le lendemain.
- Aucun événement en attente, offert ou demandé dans l'export.
- Le fichier contient le lien personnel : rappeler de ne pas le publier ou le transférer comme planning collectif.
- Tout contrôle d'import propre à Apple/Google/Outlook reste non réalisé tant qu'il n'existe pas une preuve dans le client concerné.

## État

Neuf paragraphes de narration contrôlés indépendamment ; capture Benevol, assemblage MP4 et validation des durées terminés. Visionnage audiovisuel intégral encore à effectuer. Import natif hors périmètre à la demande de Philippe ; aucun accès supplémentaire à Calendrier ne sera demandé pour cette vidéo.


## Révision du 2026-10-16 — lot 22-8

Relecture du produit `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased], PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 et #1022 (correction #1013). Les nouvelles réponses modifiables et le lien d’ajout de créneaux ne contredisent pas le parcours existant. Narration conservée ; audio restauré à vérifier avant réutilisation. Les trois vidéos bénévoles gardent le tutoiement autorisé, confidentialité reste au vouvoiement.

Contrôle du lot 22-8 : assertions du fichier ICS calculées avec le fuseau de l’organisation et les dates de la fixture, y compris le changement d’heure de Zurich du 25 octobre 2026. Aucun décalage UTC d’été figé. Les sélecteurs du formulaire suivent les libellés actuels ; la narration reste identique.

État du lot 22-8 : NOT READY. Défaut produit observé à 118,329 s ([preuve](../evidence/volunteer-calendar/batch22-overnight-end.png)), `/admin/events/cmva87t2100025da58s698zc3/shifts` : changer le début nocturne de 22 h à 23 h ramène aussi la fin de 02 h à 00 h. Le fichier modifié le confirme (fin UTC 20261024T220000Z au lieu de 20261025T010000Z). Aucun contournement ni seconde prise. Assertion ajoutée pour exiger que la fin reste inchangée lors d’une prochaine production après correction du produit.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.
