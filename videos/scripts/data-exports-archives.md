# Exporter ses données et garder une copie utile

Vidéo autonome 50, identifiant `DATA_EXPORTS_ARCHIVES`. Une narration continue Puck, souriante et patiente. Sources lues : GUIDE_ADMIN « Exporter et conserver ses données », routes membres/export et archive d'événement, `membersCsv`, `activityCsv`, `eventArchive` et `stripSecrets`.

## Parcours et résultats à filmer

1. Présenter le besoin et distinguer fichiers structurés et documents à remettre sur le terrain.
2. Membres : garder une recherche ou un filtre visible, télécharger le vrai CSV, prouver qu'il contient tous les membres et une fiche désactivée.
3. Ouvrir les douze colonnes du fichier réel, défiler jusqu'aux disponibilités et notes internes. Une ligne par membre ; nombre d'inscriptions actives, jamais heures attestées.
4. Montrer des accents, un téléphone `+41…`, et une valeur fictive `=1+1` réellement enregistrée puis exportée avec apostrophe. Pas d'exécution de formule ni faux écran Excel. Vérifier les bytes UTF-8, point-virgule, guillemets et apostrophe ; ne pas modifier le téléchargement pour la capture.
5. Journal : téléchargement depuis une liste filtrée, sept colonnes et totalité des entrées, ordre ancien→récent.
6. Rapports : télécharger l'archive JSON depuis le vrai lien. Distinguer son contenu d'un export global de l'organisation, d'un PDF et d'une duplication d'événement.
7. Visualiseur explicitement en lecture seule du fichier : réglages, créneaux, inscriptions/bénévoles, pages, questions/réponses, responsables, jalons et journal. Afficher de vrais éléments dans chaque collection, pas une série vide. Comparer au jeu en base, compteurs compris ; vérifier récursivement l'absence des clés secrètes et des valeurs de jetons connues, sans les afficher.
8. Copie figée : préserver son empreinte pendant une modification réelle dans la base dédiée, puis constater que la copie n'a pas changé. Lire les durées actuelles dans le guide. Ne pas supprimer les données d'une autre capture, ne pas inventer une fonction de restauration.
9. Revenir aux vrais écrans et rappeler quel export choisir, pourquoi et pour qui.

## Fixtures et sécurité

Organisation et événement dédiés à cette vidéo. Identités `example.org`, téléphones de démonstration. Créer accents, disponibilités, notes, tags et membre désactivé ; un exemple de texte ressemblant à une formule. Préparer tous les types d'objets de l'archive, dont réponses à des questions archivées si le scénario les explique. Le CSV des membres contient les notes, à l'inverse des changements du journal : montrer cette distinction explicitement.

Les données et changements restent strictement locaux. Ne pas altérer le jeu de la vidéo 49 pendant sa capture. Aucun upload audiovisuel externe sans garde-fou fictif propre à ce scénario. L'inspection des fichiers suit le workflow tableur en lecture seule ; aucun classeur ni conversion artificielle.

## État

Script et manifeste écrits. Une seule prise Puck est générée ; ses frontières sont recalées et les neuf transcriptions indépendantes passent. La différence de 8,9 % du chapitre CSV vient notamment de la transcription numérique de « UTF huit », « plus quarante et un » et « égal un plus un » ; ce résultat ne prouve pas à lui seul le rythme ni la synchronisation.

Le seed dédié est exécuté, sans modifier les autres organisations de démonstration. Le précontrôle télécharge depuis les véritables liens les CSV des membres et du journal, puis le JSON. Quatre membres, douze colonnes, accents, fiche désactivée, apostrophes pour téléphone et notes ressemblant à des formules sont confrontés aux données. L'archive contient les collections remplies, une réponse « M » et son journal ; compteurs, clés secrètes récursives et valeurs connues des jetons sont contrôlés sans affichage de ces valeurs. Aucun test d'exécution native de formule n'est revendiqué.

Le recorder dédié a terminé ses neuf chapitres ; le MP4 est assemblé et le validateur des durées/narration passe. Les vrais fichiers sont téléchargés pendant la prise, avec une recherche membre et un filtre du journal actifs. Les douze colonnes du CSV et les collections du JSON sont ouvertes en lecture seule, dans des vues clairement distinguées de l'application. Une modification réelle du téléphone est enregistrée dans la fiche ; le fichier téléchargé auparavant conserve son empreinte et son ancienne valeur. Rapport `export-capture-checks.json`.

Transcription indépendante de l'audio du MP4 et inspection des images en cours ; aucune revue audiovisuelle intégrale revendiquée. Le recorder modifie une fiche : refaire le seed dédié et le précontrôle avant toute nouvelle prise. Rien n'est publié.
