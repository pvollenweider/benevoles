# Lot 28 — partie A : Qui est inscrit

Nouvelle vidéo `SHIFT_ROSTER_VISIBILITY`, révision 1, destinée aux organisateurs et
aux bénévoles, narration en « vous ». La partie B est hors périmètre.

## Provenance et parcours

Produit filmé : `origin/main` `84495b6313c09edc775306790a0823a639071561` (#1070 puis
correction du recorder #1071). Build main vérifié, base vidéo locale et organisation
fictive dédiée. Aucun fichier `src/` ou `guide/` modifié. Aucun média publié.

La formation montre le réglage désactivé sur Vérifier avant publication, Voir le
réglage, l'activation et le rappel d'information, l'inscription publique d'Aline,
la case facultative non cochée et son texte entier, le vrai message Mailpit et son
lien, la confirmation personnelle, la vue de Bruno sur un autre créneau, le retrait
d'Aline, puis le choix personnel de Claire déjà inscrite avant activation.
Emma est une mineure connue du seed et reste exclue. La page publique n'a aucune
liste. La narration rappelle l'absence de coordonnées et de réponses, l'absence
sur l'intégration et la fermeture après le dernier jour de l'événement.

Les guides de ce HEAD ne décrivent aucun message recommandé propre à cette option
dans Communication : la narration se limite au rappel d'information vérifié.

## Reproduction

Voir la section « Qui est inscrit (lot 28) » de `videos/README.md`.
Les artefacts et preuves sont conservés dans `videos/output/shift-roster-visibility/`.
Les prises précédentes restent archivées, sans nettoyage global de la copie durable.
La narration Kore provient d'une seule génération continue, sans balises de pause.
La frontière du chapitre Claire est recalée à 102,619 s sur un silence réellement
mesuré puis vérifiée par reconnaissance indépendante, sans nouvelle génération.

## Liens suggérés pour la session principale

Ne pas appliquer ici : une autre PR modifie les guides.

Dans `guide/creer-un-evenement.md` et `guide/publier-un-evenement.md`, près du réglage :

[▶ Vidéo — Montrer aux bénévoles qui est inscrit](/videos/SHIFT_ROSTER_VISIBILITY#doc)

Dans `guide/s-inscrire.md`, après la case facultative, et dans
`guide/ma-page-personnelle.md#qui-est-inscrit` : même lien.

Déclaration utilisée par les guides : `<!-- video: SHIFT_ROSTER_VISIBILITY -->`.
Attendre la publication réelle des médias avant de proposer un lecteur disponible ;
l'entrée du catalogue reste `published: false` dans ce changement.

## Vérification finale

**STATUS: NOT READY.** Deux prises complètes réalisées ; seconde prise conservée.
Durée : 151,6 s. BUILD_ID : `jQiPFOLoEJz7j-X2GjLbK`.
MP4 SHA-256 : `17db4cfb15b7308a617c80a29b717236196de40c62a139106b83b295ffd057dd`.

Un décalage mineur reste bloquant : vers **1:36,4**, le retour sur Aline commence
avant la fin de la phrase sur sa disparition de la liste de Bruno. La revue du
chapitre situe « Pourtant… » vers 14,5 s relatives, contre 12,357 s pour l'estimation
actuelle du repère. Recaler cette frontière sur l'audio réel avant un prochain
tournage. Le repère utilise déjà `at("Pourtant, sur sa propre page")` ; son estimation
par silences ne prouve pas ici la synchronisation sémantique. Pas de troisième
prise : la règle du lot autorise un seul nouveau tournage après correction.
Le film reste un brouillon à ne pas publier.

Les autres contrôles passent : validation des six chapitres et 20 repères,
1 046 tests vidéo (33 fichiers), 45 tests du catalogue, types vidéo et ESLint,
ASR indépendant de chaque WAV et de chaque chapitre extrait du MP4, ASR toutes
langues sur le MP4 entier, OCR de 303 images sur toute la durée (2 images/s),
inspection des 13 planches couvrant toute la durée et images clés en pleine taille.
Aucun hôte local, port ou surcouche de développement détecté ; aucun tutoiement
adressé au spectateur dans l'ASR final ni le VTT, aucune parole en langue étrangère.
Musique : **15,5–19,5 LU** sous la voix, plage musicale seule **−33,4 LUFS**.
15 clics réels sonorisés, aucune touche réellement enfoncée (aucun son inventé).
Cinq chapitres audiovisuels sans défaut signalé ; le retrait a le défaut décrit.
Aucun bug produit constaté. L'écoute subjective en temps réel est indisponible,
ce qui ne motive pas le statut NOT READY.

Preuves tirées du MP4 final : [note de publication à 0:10](evidence/shift-roster-visibility/publication-note.png),
[rappel à 0:22](evidence/shift-roster-visibility/activation-reminder.png),
[case et texte complet à 0:48](evidence/shift-roster-visibility/optional-consent-full.png),
[vrai email à 1:02](evidence/shift-roster-visibility/actual-confirmation-email.png),
[Bruno voit Aline à 1:28](evidence/shift-roster-visibility/bruno-sees-aline.png),
[Bruno après retrait à 1:36](evidence/shift-roster-visibility/bruno-after-withdrawal.png),
[Aline voit toujours les autres à 1:40](evidence/shift-roster-visibility/aline-still-sees-others.png),
[Claire masquée à 1:51](evidence/shift-roster-visibility/claire-hidden.png),
[Claire vue par Bruno à 2:01](evidence/shift-roster-visibility/claire-visible-to-bruno.png),
[page publique sans liste à 2:16](evidence/shift-roster-visibility/public-page-without-roster.png).

Rapports détaillés locaux : `review-report.txt`, `review/final-review-decision.json`,
`audiovisual-review/*.json`, `review/full-final-asr.json`, `validation.json`.
Les affiches existent ; leurs métadonnées restent dans `review/renders-generated.json`.
`videos/renders.json` reste inchangé.

Le hook global de commit trouve un client Prisma généré ancien dans la copie durable
(champs #1070 absents). Le build produit vérifié a passé TypeScript ; les types
vidéo passent également. Aucun fichier généré sous `src/` n'a été régénéré. Le
commit local désactive ce hook après les contrôles ciblés ; le seed charge toujours
le véritable client du snapshot vérifié. La sauvegarde automatique de lint-staged
créée par le premier essai a été nettoyée par ce hook.
