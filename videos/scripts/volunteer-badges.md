# Des badges lisibles pour accueillir son équipe

Vidéo autonome 45. Prévisualisation narrée avec une seule voix Puck souriante. Le badge est un outil d'identification sur place, pas un contrôle d'accès ni un justificatif de présence.

État courant au 5 octobre 2026 : nouvelle capture complète et montage contrôlés, après enrichissement de l'explication d'impression et neuf transcriptions indépendantes réussies. Les deux homonymes sont sélectionnés successivement, leurs emails restent hors du badge. La comparaison de Léa montre deux images inchangées des vrais badges générés pendant cette prise, dans une vue de lecture explicitement distincte de l'application. Les premières et dernières pages du vrai PDF sont montrées ; la voix dit que la boîte native d'impression n'est pas filmée. Les champs allégés et le badge final apparaissent plus tôt. La revue audiovisuelle de cette prise est en cours ; un signalement de changement de timbre sur une prise précédente reste une observation automatique, pas une validation humaine. Rien n'est publié. Les étapes anciennes ci-dessous sont conservées comme historique.

La dernière revue automatisée a terminé : huit chapitres sans signalement ; le dernier signale une syllabe finale coupée. La reconnaissance de l'audio réel du MP4 retrouve « main », et le WAV conserve environ 284 ms de silence terminal ; une troncature de fichier n'est pas établie. L'articulation perçue reste à écouter, sans revendication de validation humaine intégrale. Voir `review-counterchecks.md`. Cette information remplace l'état « revue en cours » du paragraphe historique ci-dessus.

## Utilité

Reconnaître les personnes et leur équipe à l'accueil, puis réimprimer un badge perdu sans refaire toute la série.

## Démonstration

1. **Pourquoi un badge.** Depuis l'événement, ouvrir Rapports et la section Badges. Montrer les options avant de générer. Le prénom, le nom, le poste et les créneaux aident à accueillir les personnes et à savoir à quelle équipe elles appartiennent.
2. **Tous les inscrits.** Garder Tous les postes et Tous les bénévoles, puis ouvrir les badges dans le vrai nouvel onglet. Lire celui d'une personne sur deux postes : un badge pour cette personne, pas un badge par inscription. Montrer une seconde feuille et les dix emplacements par page A4.
3. **Seulement un poste.** Revenir au formulaire, choisir Buvette et générer. Les personnes retenues ont une inscription confirmée sur ce poste ; leurs autres créneaux ne figurent pas sur ce badge filtré. Comparer le badge d'une bénévole multi-postes avec sa version précédente.
4. **Réimpression individuelle.** Choisir une personne dans Bénévole (réimpression). Les noms identiques sont distingués par leur adresse dans la sélection, pas par une adresse imprimée sur le badge. Avec un poste encore filtré, seuls ses créneaux de ce poste sont inclus. Revenir à Tous les postes pour son badge complet.
5. **Une sélection sans résultat.** Choisir une personne qui n'a pas de créneau sur le poste filtré. Montrer le vrai message explicatif, puis corriger le filtre. Un écran vide n'est pas une erreur d'impression à masquer.
6. **Choisir le bandeau.** Générer successivement couleur du poste, couleur de l'événement et noir et blanc. Comparer les résultats réels. Pour la couleur du poste, l'application prend une couleur parmi les postes de la personne et utilise celle de l'événement à défaut ; ne pas promettre un bandeau multicolore pour une personne multi-postes.
7. **Alléger le contenu.** Décocher Nom de famille puis Créneaux, générer et montrer ce qui disparaît. Le prénom reste. Remettre les cases et vérifier le résultat. Pour une personne ayant beaucoup de créneaux, le badge affiche au plus quatre lignes, puis le nombre d'autres créneaux : il ne remplace pas son planning individuel.
8. **Imprimer et découper.** Montrer le rendu d'une feuille entière, le format A4, les deux colonnes et cinq rangées, les repères de coupe. Ouvrir la vraie impression si elle est capturable, sinon expliquer cette limite et montrer le PDF réellement généré. Vérifier les noms longs et les sauts de page avant de lancer l'impression en quantité.
9. **Résultat sur le terrain.** Montrer la version finale choisie, puis revenir aux réglages. Il n'y a ni photo ni QR code personnel sur ces badges. Une personne peut perdre ou faire photographier son badge : il n'offre pas de lien vers ses données personnelles et ne remplace pas la décision de l'organisateur sur les accès.

## Jeu de données

- Plus de dix bénévoles confirmés pour obtenir plusieurs feuilles, plusieurs postes et couleurs.
- Une personne sur plusieurs postes ; une avec cinq horaires ou plus ; deux homonymes avec identités distinctes ; noms et prénoms longs.
- Une demande, une attente et une inscription annulée reconnaissables pour vérifier qu'elles ne produisent pas de badge de confirmé.
- Un poste avec couleur explicite, un sans couleur explicite et une couleur d'accent d'événement pour vérifier le repli du bandeau.
- Personne ne figurant pas sur un poste donné, pour la combinaison de filtres vide.

## Résultat visible

La série comporte un badge par personne confirmée ; le filtre de poste limite ses créneaux ; la réimpression donne le bon homonyme ; les couleurs et cases changent réellement le document. La feuille finale peut être imprimée et découpée, avec les noms toujours lisibles.

## Points d’attention

Chaque variante est générée par la route réelle depuis le formulaire. Comparer le nombre de badges aux bénévoles confirmés distincts, pas au nombre de registrations. La réimpression cible l'identité sélectionnée et pas seulement le nom. Vérifier les filtres combinés, les deux cases et les couleurs sur le document réellement produit.

Le PDF final doit être rendu page par page : dix badges maximum par feuille, nom lisible, aucune ligne hors du cadre et dernière feuille correctement coupée. Vérifier que les emails de sélection ne sont pas imprimés et qu'aucun lien personnel ou jeton ne figure dans le document. Ce contrôle des fichiers ne sera pas remplacé par une capture du formulaire.

## État

Le manifeste `volunteer-badges` comporte neuf chapitres avec une narration continue Puck et huit intertitres. Le seed partagé avec les rapports a été exécuté localement le 5 octobre 2026 : 80 personnes confirmées, les homonymes, les noms longs et Léa sur cinq créneaux.

Neuf variantes ont été générées depuis le vrai formulaire, puis enregistrées en PDF. `videos/output/volunteer-badges/documents/badge-preflight.json` contrôle les effectifs (80 badges pour 84 inscriptions confirmées), les filtres, les homonymes, les couleurs, les cases et l'absence d'emails et de jetons personnels imprimés. La série complète compte huit feuilles A4 ; Buvette et Loge en comptent trois chacune. Toutes les pages ont été rendues en images.

La revue visuelle a couvert les première et dernière feuilles de la série complète, ainsi que le badge individuel de Léa : dix badges par feuille complète, noms longs lisibles dans leur cadre, quatre lignes de créneaux puis une ligne indiquant le créneau supplémentaire. Le titre long du bandeau est abrégé par des points de suspension : ne pas promettre son affichage intégral. Cette inspection ne valide pas encore visuellement les autres pages et variantes. Les médias narrés restent à produire, puis la synchronisation à contrôler. Le logo de l'association, la photo et le QR code ne sont pas annoncés comme options de ces badges.

Le recorder est raccordé au catalogue et au lanceur. Il utilise le vrai formulaire et son nouvel onglet, puis ouvre l'URL réellement obtenue dans la fenêtre capturée pour montrer le résultat. La répétition sans voix a terminé les neuf chapitres avec succès le 5 octobre 2026. La capture brute et sa timeline sont dans `videos/output/volunteer-badges` ; 36 images (début de chapitre, 25 %, 60 %, 85 %) ont été extraites dans `rehearsal-review-frames`. La planche a été inspectée : les neuf titres sont visibles, ainsi que la série, Buvette, Camille, le message de sélection vide, les trois bandeaux, Léa avec et sans champs et la dernière feuille avec le nom long. Les formulaires et documents restent présents dans la fenêtre enregistrée.

Cette revue par échantillonnage ne valide ni chaque image, ni la synchronisation avec une narration absente. Le chapitre impression montre le document HTML imprimable : il ne doit pas être présenté comme un lecteur PDF ni comme une manipulation de la boîte native d'impression. Les PDF produits séparément servent au contrôle des pages finales. La capture narrée et le contrôle audiovisuel complet restent requis.

Les crédits ont été rétablis et la narration est générée avec `gemini-3.8-flash-tts`. Les premières prises ont été écartées : phrase omise, ajout non demandé ou consigne de pause prononcée. Le manifeste désactive maintenant les balises de pause, sans changer de voix ni découper la génération en prises séparées. La nouvelle prise Puck a été recalée à partir de fenêtres audio courtes puis ses neuf chapitres ont passé la transcription indépendante. Les différences restantes sont des variantes de transcription, pas des phrases déplacées. La capture contre ces durées et la revue du MP4 restent requises ; la répétition silencieuse ne constitue pas le livrable final.
