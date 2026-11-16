# EVENT_QUESTIONS — Poser les bonnes questions à ses bénévoles

Identifiant stable : `EVENT_QUESTIONS` ; slug : `event-questions`.
Voix unique Kore, souriante et bienveillante, génération continue, `continuousPauseTags: false`.
Public organisateur : vouvoiement partout dans la narration ; le tutoiement reste limité aux citations éventuelles de l'interface bénévole.

16 chapitres suivent `videos/manifests/event-questions.json` et les scènes de `record-event-questions.ts`.
Le manifeste est le transcript canonique : ne pas en créer une copie divergente ici.

## Prise locale isolée

Produit : copie propre de main vérifiée, port dédié **43112**, locale française.
Fixture : organisation `video-questions` / `formation-questions`, événement `video-questions-event` / `atelier-questions`, Aline Mercier `video.questions.aline@example.org`, organisatrice Élodie Rochat, quatre créneaux libres non chevauchants le 28 novembre 2026. Aucun destinataire extérieur.

1. Lancer `local-production.ts serve-questions SNAPSHOT_APPROUVE` avec le wrapper et l'environnement local habituels.
2. Préparer : `local-production.ts run videos/tools/prepare-event-questions.ts`.
3. Faire la répétition : `local-production.ts run videos/tools/record.ts EVENT_QUESTIONS --rehearse --quick-rehearse`.
4. Après toute répétition ou prise interrompue : `local-production.ts run videos/tools/prepare-event-questions.ts --reset-owned`. Le reset vérifie l'identité, le ledger de propriété, tous les enfants et les relations inter-organisations avant de supprimer uniquement les IDs possédés. Il refuse les données inconnues.
5. Générer/auditer la narration continue actuelle, puis capturer `EVENT_QUESTIONS` sans flags de répétition ; assembler, contrôler les frames, l'audio final, la validation et la revue audiovisuelle.

La preuve d'email sélectionne un nouvel ID Mailpit apparu après le début de la prise, pour le destinataire exact et le bon événement. Elle montre le message réel, pas une ancienne boîte ou un email reconstruit. Les liens `video.invalid` du build sont transposés uniquement au serveur local pour la formation. Réception locale ne signifie ni lecture ni livraison extérieure ; aucun push n'est montré ou annoncé.

## Résultats exigés

- Paramètres > Questions ; quatre types réellement enregistrés, Poste concerné laissé sans poste ; obligatoire/facultatif ; ordre conservé après rechargement.
- Validation obligatoire sans inscription créée ; quatre réponses exactes puis confirmation réelle.
- Email réellement reçu, réponses dans l'administration, synthèse CSV réellement téléchargée sans coordonnées.
- Invitation : remplacement de M par L et effacement des facultatifs ; montrer ensuite Mes réponses et Modifier mes réponses via le vrai lien personnel. Sans preuve : S ne remplace pas L.
- Type verrouillé, suppression de L refusée par 409, ajout de XXL enregistré sans perdre L.
- Retrait archivé : L reste lisible dans les inscriptions, la question disparaît du nouveau formulaire.

Ce parcours ne revendique pas la couverture des impressions, de l'archive complète, de la duplication des questions, du plafond de cinq questions ou de tous les cas d'attente. Ces sujets sont à illustrer dans les vidéos correspondantes.

## Révision du 15 octobre 2026 — lot 22-2

Revue sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête commun et onglets ; Dupliquer, Archiver et Journal via Autres actions ; pages et QR via Partage ; questions et suppression via Paramètres ; Documents à imprimer. Libellés, narration et repères de phrases revus. Toute phrase changée impose une régénération intégrale, même voix, `continuousPauseTags: false`. Le manifeste reste le transcript canonique ; les anciennes preuves ne valident pas ce nouveau texte.


## Révision du 16 octobre 2026 — lot 22-9

Relecture PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 et #1022 (issue #1013), CHANGELOG Unreleased et parcours actuel. Les ajouts facultatifs de narration sont retirés pour conserver la prise audio restaurée quand le texte initial reste exact. Segments nécessitant une nouvelle narration : aucun. Navigation et repères adaptés aux onglets actuels. Toute correction conservée attend une narration intégrale, même voix, sans pause tags.

Mix du lot 22-9 : musique abaissée de 0,2 dB après rejet d’une fenêtre à 11,9 LU. Même capture et mêmes WAV ; montage et revue finale entièrement refaits.

Lot 22-9 : READY, 520.68 s sur BUILD_ID `03j7XCWy0WJORYSQg2WPB`. Narration restaurée inchangée vérifiée ; répétition, capture narrée, ASR multilingue final, VTT, images de chapitres et actions, musique et validation contrôlés. Rien publié.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.

Narration complète finale, même voix en une seule génération :

- `welcome` : Un t-shirt à prévoir, du matériel à organiser : quelques questions bien choisies peuvent vraiment aider. Ouvrons Questions aux bénévoles pour notre événement de formation. On peut ajouter jusqu'à cinq questions. Mais le bon réflexe, c'est d'en demander le moins possible, juste ce qui sert à l'organisation. Pas d'information sensible sur la santé, la religion ou les opinions. Ici, les personnes et leurs réponses sont entièrement fictives. Nous allons préparer quatre exemples, puis suivre ce que voit Aline et ce que retrouve l'organisation.
- `create-single` : Commençons par la taille du t-shirt. Cliquons sur Ajouter une question, puis saisissons son intitulé. La liste propose aussi Nombre pour une quantité. Dans Type de réponse, choisissons Choix unique : la personne pourra sélectionner une seule taille. Les choix s'écrivent un par ligne. Voici S, M, L et XL. Il en faut au moins deux, et douze au maximum. Pour notre commande, cette information est nécessaire : cochons Réponse obligatoire. Enregistrons. La question est maintenant dans la liste, avec ses choix et son caractère obligatoire.
- `create-yesno` : Pour le permis de conduire, une réponse simple suffit. Ajoutons une nouvelle question, puis écrivons Permis de conduire. Choisissons Oui ou non dans le type de réponse. Le paramètre Afficher seulement si permet de préparer une question de suivi selon une réponse précédente. Ici, nous gardons une question affichée à tout le monde. Pas de liste à saisir : les deux réponses sont proposées automatiquement. Dans cet exemple, rendons aussi la réponse obligatoire, puis enregistrons. Attention, demander le permis ici recueille une information : ce n'est pas, à lui seul, une règle qui réserve un poste ou vérifie le document.
- `create-multiple` : Passons au matériel de transport. Créons la question, puis choisissons Choix multiple. Saisissons Vélo, Remorque et Voiture, toujours un choix par ligne. Cette fois, plusieurs cases pourront être cochées : Aline peut disposer d'un vélo et d'une remorque. Laissons Réponse obligatoire décochée. Une personne sans matériel pourra ne rien renseigner. Enregistrons et vérifions les trois choix dans la liste. Le type choisi doit correspondre à ce que vous voulez réellement savoir.
- `create-text` : Pour une préférence de rendez-vous, laissons un peu de liberté. Ajoutons Point de rendez-vous préféré. Conservons Texte court : la personne écrira sa réponse plutôt que de choisir dans une liste. Cette question reste facultative. Elle peut donner une indication utile, mais ce n'est pas une consigne officielle de rendez-vous. Enregistrons. Nous avons maintenant nos quatre exemples de questions, avec deux réponses obligatoires et deux facultatives.
- `order` : L'ordre compte aussi pour rendre le formulaire agréable. Plaçons le permis avant la taille du t-shirt avec Monter, sur la ligne du permis. La question remonte d'une position. Descendre permet le mouvement inverse. Rechargeons la page : le nouvel ordre est conservé. Les bénévoles retrouveront cet ordre dans leur formulaire. Vous n'avez pas besoin de supprimer et recréer une question pour la déplacer.
- `required-validation` : Voyons maintenant le formulaire public avec Aline. Choisissons le premier créneau et continuons. Renseignons son identité et les consentements demandés. Essayons de confirmer sans répondre à nos deux questions obligatoires. Le formulaire indique ce qui manque et place le focus sur la première réponse attendue. Aucune inscription n'est créée. Les questions facultatives, elles, peuvent rester vides. Cette distinction évite de bloquer une personne pour une information qui n'est pas indispensable.
- `volunteer-form` : Répondons maintenant. Aline choisit M pour son t-shirt, puis Oui pour le permis. Pour le matériel, elle coche Vélo et Remorque : c'est bien un choix multiple. Dans le texte libre, écrivons Entrée nord. Avant l'envoi, le récapitulatif Transmis à l'organisation montre les informations qui seront partagées. Vérifions, puis confirmons réellement l'inscription. Ces réponses sont enregistrées une fois pour Aline sur cet événement, pas une nouvelle fois pour chaque créneau.
- `email-proof` : Aline existait déjà dans la liste des membres. Sur le formulaire public, taper son adresse ne suffit pas à prouver qui est devant l'écran. Son lien personnel n'est donc pas affiché directement : il lui est envoyé par email. Ouvrons le nouveau message réellement reçu pour cette adresse dans notre boîte locale de test. C'est une vraie notification produite par l'application, avec son lien personnel. La boîte de test prouve cette réception locale, pas la lecture par une personne, ni une livraison dans une boîte extérieure.
- `admin-read` : Revenons côté organisation, dans les inscriptions. Sous celle d'Aline, les réponses permettent de préparer son t-shirt et le matériel. Ouvrons ensuite Questions : la Synthèse des réponses compte les choix. Aline est comptée une seule fois parmi les bénévoles confirmés, même si elle prend plusieurs créneaux. Pour un choix multiple, elle apparaît dans plusieurs lignes : les totaux des choix peuvent donc dépasser le nombre de personnes. Les personnes en attente sont distinguées des confirmées.
- `summary-export` : Pour préparer une commande, téléchargeons la synthèse en CSV. Le fichier rassemble les questions, les réponses et leurs totaux, avec les confirmés et les personnes en attente. Il ne contient ni noms ni coordonnées : vous pouvez partager ces quantités avec un fournisseur sans lui transmettre la liste des bénévoles. La synthèse décrit l'état actuel ; les inscriptions peuvent encore évoluer. Gardez ce repère en tête avant de lancer une commande définitive.
- `invited-update` : Aline se réinscrit maintenant depuis son véritable lien d'invitation, pour un deuxième créneau. Cette invitation apporte la preuve nécessaire pour modifier ses réponses. Choisissons L au lieu de M. Conservons Oui pour le permis, puis laissons le matériel et le rendez-vous vides. Confirmons. La nouvelle taille remplace l'ancienne. Les deux réponses facultatives laissées vides sont effacées. Les réponses appartiennent toujours à Aline sur cet événement, indépendamment de ses deux créneaux.
- `unverified-update` : Comparons avec une inscription depuis le simple formulaire public, sans invitation. Saisissons la même adresse pour un troisième créneau, mais choisissons S. L'inscription peut être créée, pourtant la réponse déjà enregistrée ne sera pas remplacée. L'adresse seule ne prouve pas l'identité de la personne qui la saisit. La taille conservée reste donc L. Depuis ce formulaire, seules les réponses encore manquantes peuvent être ajoutées. Pour corriger une réponse existante, le bénévole doit utiliser le parcours qui prouve son accès.
- `answered-lock` : Le formulaire a maintenant des réponses : revenons modifier la taille du t-shirt. Le type est verrouillé. Changer un choix unique en texte libre rendrait les réponses existantes difficiles à interpréter. Essayons aussi de retirer L des choix proposés. L'application refuse, car cette taille a déjà été retenue. Annulons cette modification. La réponse d'Aline reste intacte. Si vous devez changer complètement la question, mieux vaut en créer une nouvelle plutôt que de réinterpréter les réponses passées.
- `edit-choices` : On peut cependant enrichir la liste sans perdre ce qui existe. Rouvrons la question et ajoutons XXL, tout en gardant S, M, L et XL. Enregistrons. Le nouveau choix apparaît dans la liste ; la taille L d'Aline reste conservée. Ajouter une possibilité et retirer un choix déjà utilisé ne sont pas la même opération. Prenez le temps de relire les choix avant d'enregistrer.
- `retire` : Nous n'avons plus besoin de demander la taille aux nouvelles inscriptions. Cliquons sur Retirer, puis lisons la confirmation : la question disparaît du formulaire, mais ses réponses restent dans les inscriptions et les exports. Confirmons. Dans l'inscription d'Aline, sa taille L est encore visible, avec la mention question retirée. Ouvrons enfin un autre créneau public : la question n'est plus proposée, les autres le sont toujours. Un formulaire simple, des réponses utiles et une évolution qui préserve l'historique : c'est le bon équilibre.

Reprise unique 23-2 : afficher réellement Nombre, puis Choix unique sur leurs phrases ; saisir les tailles à leur annonce ; préparer la page d’inscription avant le chapitre de validation ; montrer le récapitulatif transmis dès sa première mention. Repères textuels mesurés sur la narration complète actuelle. Aucun changement produit.

Conclusion du lot 23-2 : NOT READY après la seconde prise. Le clic Enregistrer de `edit-choices` est à +10,252 s, la voix dit « Enregistrons » à +11,94 s. Repère source préparé pour le lot suivant ; aucune troisième prise. XXL est bien visible à +8,2 s. Les autres chapitres et la validation technique du montage final passent.


## Contrôle du lot 23-3 — 2026-10-16

NOT READY après deux prises : ancien Enregistrer corrigé, Choix multiple recadré sur ses phrases. Rechargement tardif à 194,82–197,6 s ; repère futur Rechargeons la page préparé sans troisième prise. Alerte M/L contre-vérifiée : L sélectionné à 382,5 s. Référence : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, BUILD_ID `gHYEjPtpdQYUNytuIhMkh`. Preuves locales dans `videos/output/event-questions/review/` et `review-report.txt`.
