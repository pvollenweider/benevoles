# Placement des chapitres vocaux — contrôle du 6 octobre 2026

L'assemblage conserve les horodatages de la capture : chaque WAV est retardé
jusqu'au début de son chapitre, sans raccourcir la vidéo ni déplacer les actions.
Les images extraites aux repères de la timeline concernent donc ces mêmes
instants dans le MP4 final. Cela ne prouve pas l'alignement phrase par phrase.

Un contrôle local des timelines et métadonnées des cinquante montages présents
(hors captures marquées répétition) a signalé un dépassement sur l'ancienne
présentation générale : le chapitre `lifecycle` dépasse de 845 ms le repère
suivant. Les autres montages examinés n'ont pas présenté de dépassement supérieur
à 100 ms selon leurs métadonnées. Ce contrôle ne valide ni la fraîcheur de leur
voix, ni leur synchronisation, ni les vidéos encore absentes.

`assemble.ts` mesure désormais chaque WAV avec ffprobe avant tout remplacement
du MP4. Il refuse une narration qui déborde sur le chapitre suivant ou la fin
de la capture, ainsi qu'un ordre de chapitres incohérent. La tolérance technique
est de 100 ms ; elle n'autorise pas à ignorer une désynchronisation perceptible.

Le garde-fou a été exécuté sur `admin-features-tour` : il refuse réellement
le dépassement de 845 ms. Le SHA-256 du MP4 est identique avant et après :
`e0cd3fca1b499669a2f5c44fc09a2b49655ba3a2b129cd1f94b5c5a2db50a999`.
Ce montage reste à corriger ; il n'a pas été réassemblé ni déclaré validé.
Le contrôle TypeScript passe après la modification.
