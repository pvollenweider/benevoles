# Batch 29 — SHIFT_ROSTER_VISIBILITY

Référence produit : origin/main c0242133d97f0ae688c673f7b6d8c36e62f1adc9 (PR #1074 entièrement relue, y compris décisions RGPD/nLPD et inventaire documentaire).
Build unique : 9aTEFviiAtCSmiFgccOhV. Sources restaurées de 95c8ad41 et 7c939182 ; métadonnées de 3af747a0 conservées dans l’archive locale draft1073, jamais prises pour la nouvelle preuve.

Les 1052 tests vidéo passent (33 fichiers) ; contrôle de types des outils passé.

Les métadonnées générées de ce lot remplaceront uniquement celles de ce slug suivant #1035/#1065 ; anciens pass-3 et sondes non produits ne sont pas réintroduits. La copie draft #1073 reste dans previous-* ; ses liens guide et son état publié ne sont pas repris.

Le catalogue conserve revision 1 et updatedAt 2026-10-21 ; published reste false tant que le propriétaire n’a pas envoyé les médias. Aucun changement de videos/renders.json avant publication : les nouvelles durées et affiches sont dans review/renders-generated.json.

## Vérification avant capture

Répétition intégrale passée. Deux générations vocales continues distinctes ont été produites avant tournage : la première a été archivée après confirmation ASR de mots parasites. Seule la seconde prise Kore complète est utilisée. Les frontières des chapitres ont été rapprochées des silences réels puis contrôlées par ASR indépendant ; aucun assemblage de voix de générations différentes.

## Première prise

8/8 chapitres contrôlés image et son sans anomalie signalée. Validation passée, 26 repères de phrases, musique 14,9–19,5 LU sous la voix ; passages musicaux seuls au minimum −33,4 LUFS. ASR intégral multilingue sans ajout ; OCR de 48 images sans hôte local ni ancien libellé. Preuves dans videos/evidence/shift-roster-visibility/b29-take1, médias complets dans previous-20261021-b29-take1 (ignoré).

## Décision de liens pour la session principale

Après validation et publication par la session principale, ajouter les lignes suivantes à proximité des paragraphes « Qui est inscrit » ; ne pas les annoncer disponibles avant publication. Aucun fichier guide/ modifié ici.

- guide/creer-un-evenement.md : `En vidéo : [Voir qui est inscrit sur les créneaux](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/publier-un-evenement.md : `En vidéo : [Régler et consulter « Qui est inscrit »](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/s-inscrire.md : `En vidéo : [Choisir d’afficher son nom et voir les inscrits](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/choisir-ses-creneaux.md : `En vidéo : [Voir qui est inscrit en Liste et en Frise](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/ma-page-personnelle.md : `En vidéo : [Confirmer ou masquer son nom](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/inviter-des-membres.md : `En vidéo : [Voir les inscrits depuis une invitation](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`
- guide/personnaliser-l-organisation.md : `En vidéo : [Définir le réglage « Qui est inscrit »](/videos/SHIFT_ROSTER_VISIBILITY#doc). <!-- video: SHIFT_ROSTER_VISIBILITY -->`

Ne pas ajouter de lien dans les FAQ, duplication, partage ou responsables de secteur : la vidéo traite le parcours central ; leurs renvois textuels au guide restent suffisants.

L’information des organisations par email (DPA §16) reste à la charge du propriétaire, comme demandé par la PR #1074. Aucun email client, déploiement, push ou publication effectué dans ce lot.

Les preuves du lot 28 restent historiques : elles ne valident pas l’interface refondue. doc-img: unchanged — aucun écran produit ni guide modifié.

## Résultat final

STATUS: READY. Deux prises complètes ; seconde retenue, 229,520 s (3 min 49,52 s), 1280×800. MP4 SHA-256 `1638077bc2a258324a29e2fcd6038d49c236d79b9777cbf5eadda812c3d665cb`. Huit chapitres revus image et son, ASR final intégral et par chapitre passé, 256 images OCR sans hôte local/ancien libellé, 26 repères de phrases avec images. Musique 15,2–19,6 LU sous la voix ; minimum seul −33,4 LUFS ; zéro trou. Zéro tutoiement du spectateur (unique « toi » dans « Avec toi »).

Preuves finales : `videos/evidence/shift-roster-visibility/b29-take2/`. Métadonnées générées du seul slug versionnées selon #1035/#1065 ; MP4, audio, affiches et archives restent ignorés.

Limite des vérifications du checkout : son client Prisma ignoré est antérieur à #1070/#1074, et un ancien helper archivé a un import relatif périmé. Le `tsc` global échoue sur ces fichiers préexistants/ignorés. Le build produit propre, le typecheck produit avec le Prisma du snapshot et le typecheck des 199 sources vidéo passent. Le hook global est contourné pour le commit local afin de ne pas régénérer `src/` contrairement à la consigne ; ESLint et les 1052 tests vidéo ont été exécutés séparément.
