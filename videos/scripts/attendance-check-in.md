# Accueillir les bénévoles et corriger une présence

Vidéo autonome 46. Une seule voix Kore continue, souriante et patiente.

La narration vouvoie les organisateurs, avec un ton accueillant et bienveillant. Les identifiants de scènes et les durées sont conservés lors de cette révision éditoriale.

État courant au 6 octobre 2026 : le manifeste comprend quatorze chapitres, dont six nouveaux sur le vrai écran Jour J. Le recorder et la fixture indépendante sont intégrés ; **aucune capture UI, génération vocale ou validation de ces ajouts n'a encore eu lieu**. Les huit anciens chapitres/MP4 ne prouvent pas la nouvelle version et devront être régénérés. Les étapes d'historique ci-dessous restent historiques, pas une certification courante.

## Utilité

Savoir qui est arrivé à son créneau, éviter de pointer la mauvaise personne et corriger une erreur sans supprimer son inscription. Une inscription décrit ce qui était prévu ; une marque de présence indique un pointage. Elle ne mesure ni l'heure de départ ni la durée réellement travaillée. Le produit appelle « heures attestées » les durées planifiées des créneaux passés avec présence enregistrée, et non des heures chronométrées.

## Complément Jour J — prise indépendante

Organisation `video-dayof`, identifiant public `formation-jour-j`, propriétaire fictif `video.dayof.owner@example.org`. Serveur dédié `http://localhost:43108`, même compilation propre de `main`, preuve vérifiée par le wrapper. Aucune réinitialisation de `default`.

`prepare-day-of.ts` crée deux événements : huit inscriptions pour les chapitres de pointage historiques, et quatre créneaux de terrain relatifs à l'heure réelle Europe/Zurich. Le créneau courant a commencé il y a trente minutes ; la relève arrive dans une heure ; un créneau est terminé et un autre, commencé la veille, est encore en cours. Préparer entre 03h et 23h pour rendre les quatre cas réellement possibles. Ne pas trafiquer l'horloge du navigateur ni remplacer l'écran produit par une carte HTML.

### Démonstration

1. `dayof-window` : visiter la vraie page Jour J ; montrer En cours, la veille commencée hier, les trois prochaines heures, puis ouvrir Plus tôt aujourd'hui. Préciser que la fenêtre 390 × 844 simule un affichage mobile, pas un appareil réel.
2. `dayof-search` : chercher « zoe », retrouver Zoé Exemple, chercher Accueil, puis vider la recherche.
3. `dayof-phone` : montrer son lien téléphone et le contact du créneau ; **aucun clic `tel:` ni appel réel**.
4. `dayof-checkin` : marquer uniquement Zoé ; constater le vrai POST et son `changedIds`, recharger, puis vérifier sa présence dans la fixture.
5. `dayof-refresh` : Actualiser, lire l'annonce et l'heure de mise à jour ; ne pas prétendre montrer une modification depuis un autre téléphone.
6. `dayof-undo` : annuler le pointage, recharger, vérifier que la marque a disparu et que l'inscription reste active.

### Résultat visible et points d'attention

Les chapitres utilisent la même action de présence que la liste d'inscriptions. La réception d'un email, l'heure de départ et les heures réellement effectuées ne sont pas annoncées comme résultats du pointage. La page ne montre que les informations opérationnelles, pas les emails, réponses ni notes privées. Chaque chapitre écrit des observations séparées avec le commit produit ; elles ne remplacent pas la revue des écrans et du son du MP4 final.

La fixture doit être préparée juste avant la prise : un âge supérieur à quarante-cinq minutes bloque ce parcours. Une répétition ou une prise interrompue peut modifier ses présences et annuler le créneau historique ; `--reset-owned` autorise un reset limité après vérification stricte des identifiants de cette organisation. Aucun état n'est effacé ailleurs.

## Démonstration

1. **Se placer sur le bon créneau.** Ouvrir les inscriptions d'un événement du jour J. Montrer les filtres de poste et de créneau, choisir Accueil du matin, puis expliquer que chaque ligne correspond à une inscription. Une même personne peut avoir deux lignes pour deux horaires : sa présence au premier ne prouve pas sa présence au second.
2. **Pointer une arrivée.** Sélectionner uniquement Aline dans ce créneau. Laisser apparaître « Marquer présent (1) », cliquer et montrer le résultat ainsi que la marque Présent sur la bonne ligne. Recharger la page pour constater la persistance. Ne pas utiliser le compteur de la liste filtrée comme un compteur de présences : le résumé global et les lignes ont des périmètres différents.
3. **Plusieurs arrivées ensemble.** Sélectionner Nicolas et Léa, lire le nombre avant d'agir, puis « Marquer présents (2) ». Montrer les deux marques et le résumé actualisé. Garder une personne absente sans marque pour que la différence soit visible. Une demande à traiter n'est pas une confirmation à pointer : montrer ce cas séparément, sans le faire passer artificiellement pour une arrivée.
4. **Corriger une erreur.** Sélectionner la ligne de Léa déjà pointée, cliquer « Annuler la présence (1) », puis montrer la disparition de la marque. Son inscription reste visible et sa place n'est pas libérée. Pointer à nouveau la personne réellement arrivée ; expliquer la différence avec « Retirer de leur créneau », qui est une autre action.
5. **Une personne sur plusieurs horaires.** Rechercher Léa, montrer ses deux inscriptions. Pointer uniquement l'horaire du matin ; l'autre reste non pointé. Ne jamais annoncer qu'une action sélectionnant une ligne pointe toute la journée d'une personne.
6. **Le pointage n'est pas un chronomètre.** Montrer l'horodatage disponible et la rubrique Heures planifiées dans la fiche membre. Expliquer qu'un retard est une heure de pointage, pas une durée de retard calculée automatiquement. Ne pas inventer de départ, de décompte d'heures attestées ou de certificat si l'interface actuelle ne les fournit pas.
7. **Annulation après pointage.** Utiliser un créneau dédié sur lequel une présence réelle vient d'être enregistrée. Avant d'annuler le créneau entier, conserver l'identifiant de l'inscription et son horodatage pour le contrôle. Montrer la confirmation puis l'état du planning. Vérifier que la donnée de pointage n'a pas été effacée. Expliquer la limite actuelle : les listes et l'export des présences ne retiennent que les inscriptions actives ; une présence conservée sur une inscription annulée n'apparaît donc pas automatiquement dans cet export. Ne pas prétendre qu'un écran signale ce conflit si aucun avertissement n'y existe.
8. **Exporter le bilan.** Télécharger le véritable export des présences, montrer une ligne pointée et une ligne non pointée avec leurs créneaux et leurs horaires. Le fichier contient notamment Présent et Pointé le, pas des heures réellement travaillées. Montrer le format local du pointage et les réponses aux questions lorsqu'elles existent. Conclure : pointer la bonne ligne, corriger sans désinscrire, relire le bilan.

## Résultat visible

Les marques et compteurs évoluent après les actions ; la correction conserve l'inscription ; la présence d'un horaire ne se propage pas à l'autre. Un rechargement confirme la persistance. Le fichier téléchargé reflète les inscriptions actives au moment de l'export. Le cas annulé doit être expliqué avec sa limite, pas présenté comme une preuve d'heures attestées.

## Points d’attention

- Jeu local dédié : au moins six confirmations sur deux créneaux, une personne multi-créneaux, une demande, une attente, une personne absente et un créneau distinct pour l'annulation après pointage.
- Aucune présence préfabriquée pour les actions montrées : les pointages et corrections passent par les vraies actions de l'interface et leur route groupée.
- Vérifier les identifiants changés et les horodatages en base après chaque action ; les lignes non sélectionnées doivent rester inchangées. Conserver les preuves sans jeton personnel ni secret.
- Pour l'annulation, comparer un horodatage non nul avant/après. Comparer deux champs nuls ne prouve pas la conservation d'une présence.
- Contrôler séparément résumé global, filtre courant et nombre de lignes sélectionnées ; ne pas additionner des personnes distinctes et des inscriptions comme si c'était la même unité.
- Inspecter le vrai CSV téléchargé avant de filmer sa lecture. Utiliser le workflow tableur pour cette inspection ; ne pas composer un tableau qui ressemble au fichier mais omet ses limites.
- La présence est une marque par inscription. Ni départ, ni QR de pointage, ni émargement autonome, ni total d'heures attestées ne sont annoncés ici sans implémentation et vérification propres.
- Intertitres entre sujets ; pause lisible avant une action groupée ; narration continue avec la même voix. Contrôle indépendant du texte prononcé puis contrôle audiovisuel du MP4 final.

Préparation confrontée au code actuel le 5 octobre 2026 : gestion des présences dans les inscriptions, barre d'actions, export des présences et formatage de l'heure locale. L'export filtre explicitement les inscriptions actives. Le plan initial qui demandait des heures attestées reste une exigence non satisfaite par cette seule marque de présence : elle doit rester dans le suivi de couverture, pas devenir une promesse dans la vidéo.

Le seed `attendance-check-in` a été exécuté et son recorder complet est raccordé au catalogue : événement dédié, six confirmations sur trois créneaux, Léa sur deux horaires, une demande et une attente. Tous les pointages commencent à null ; Sarah est sur le créneau réservé à l'annulation après une arrivée effectivement enregistrée. Les invariants exigent huit inscriptions au total et zéro présence préfabriquée. Le seed ne touche que cet événement et ses acteurs fictifs, pas les données des rapports.

La répétition complète des huit chapitres a terminé avec succès dans Chromium local. Chaque action compare les inscriptions avant/après en base et la réponse de la vraie route groupée ; le jeu d'inscriptions et les statuts restent identiques, seules les lignes sélectionnées et confirmées changent de pointage. Léa est sélectionnée à nouveau après l'effacement réel de la sélection. Ses deux lignes sont montrées ensemble : Accueil pointée, Buvette non pointée. Les heures planifiées sont visibles dans la liste des membres, puis sa chronologie réelle.

Sarah a été réellement pointée avant la suppression de son créneau. Le contrôle compare un horodatage non nul identique avant/après et les statuts annulés, puis confirme son absence de la liste courante et du CSV actif. Le fichier réellement téléchargé contient cinq inscriptions, quatre personnes, trois lignes pointées et deux non pointées. Demande, attente et inscription annulée en sont absentes. Le visualiseur lit ses octets sans les modifier. Trente-deux images de la répétition ont été extraites et leur planche inspectée ; elles ne prouvent pas une synchronisation avec la voix.

La prise Kore continue a été générée avec `gemini-3.8-flash-tts`. Trois frontières ont été corrigées, puis les huit chapitres ont passé la transcription indépendante. Le seed a été remis à zéro uniquement pour cet événement avant la capture narrée. Le montage et la revue audiovisuelle restent à faire.
