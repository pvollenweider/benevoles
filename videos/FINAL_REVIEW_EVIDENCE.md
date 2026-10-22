# Suivi des preuves de revue finale

Le contrôle local `videos/tools/check-final-review-evidence.ts` inspecte toutes
les entrées du catalogue et produit `videos/output/final-review-evidence.json`.
Il compare l'empreinte du MP4 actuel à celle des rapports audiovisuels de chaque
chapitre et vérifie que la timeline contient exactement les chapitres attendus.
Il ne fait aucun appel externe et ne modifie aucun média.

Il vérifie également la narration source : modèle Gemini 3.8 TTS, voix du
manifeste, génération continue identique pour tous les chapitres, transcript
de référence actuel et empreinte de chaque WAV correspondant à l'audit ASR.
L'empreinte de génération doit aussi correspondre aux consignes actuelles
d'intonation et de pauses : changer ces consignes invalide une ancienne voix,
même si la transcription reste identique.
L'absence d'audit ne prouve pas que la voix est incorrecte : elle marque une
preuve manquante à obtenir, pas une obligation automatique de régénérer.

Dernière exécution du 6 octobre 2026 : 54 entrées inspectées (le catalogue
inclut aussi les vidéos de présentation, ce n'est pas le décompte des seuls
modules 12 à 53). Neuf ont tous leurs
rapports audiovisuels sans signalement correspondant au MP4 actuel. Ce nombre
ne désigne pas des vidéos certifiées terminées : voix, transcript et prompt
actuels, couverture fonctionnelle et revue humaine restent des contrôles
séparés. Les signalements mineurs conservés dans les rapports restent visibles
dans leurs fichiers et ne sont pas effacés par cet inventaire.

Trente-et-une entrées ont une narration source contrôlée correspondant aux
transcripts actuels et à une seule génération identifiée. Cela ne prouve pas
que ces fichiers sont correctement intégrés ni synchronisés dans le MP4.
La vidéo opérateur a notamment un transcript modifié après la génération :
la narration doit être refaite en continu avant sa prise finale. Pour les
autres lignes signalées, consulter les détails chapitre par chapitre afin de
distinguer un audit absent d'un audit devenu obsolète.

Les rapports des vidéos `PRIVACY_PERSONAL_LINKS` et `LAST_MINUTE_CHANGES`
correspondent à des montages antérieurs. Leur revue visuelle locale a avancé,
mais leurs audits audiovisuels doivent être refaits sur les nouvelles prises.
Les anciens résultats ne doivent pas être utilisés pour les déclarer validées.

Le blocage Gemini précédent est levé : les nouvelles générations et leurs
contrôles fonctionnent. L'inventaire lui-même ne fait aucune requête API.
Le dernier contrôle de l'accès natif du Mac demandait un déverrouillage manuel.
Cela empêche les séquences système réelles des notifications et de
l'accessibilité. Les captures Chromium simulées ne les remplacent pas.

Les vidéos 29, 43 et 53 ont leurs parcours de répétition fonctionnels, mais
pas une nouvelle narration complète validée conforme au script courant.
La vidéo 52 reste sans recorder complet ni montage ; sa base fictive et ses
précontrôles clavier ne constituent pas une vidéo livrée. La dernière revue
de `org-timezone-charter` a été suivie d'une recapture : le MP4 actuel montre
le créneau pendant l'explication de son heure. Ses huit chapitres ont une
revue audiovisuelle automatisée sans signalement et une transcription du
montage final ; cela ne constitue pas un visionnage humain intégral.

La couverture des dates du journal d'événement reste distincte : le rapport
`event-activity-log/coverage-check.json` mesure un historique de quelques
secondes, pas deux semaines. Aucun horodatage n'a été modifié pour contourner
ce manque.

## Reprise effectuée le 6 octobre 2026

- Nouvelles captures et nouveaux montages : identité publique, fuseau/convention,
  emails, équipe/permissions, création depuis une page blanche, modèles,
  pages/programme/QR, jalons et vues du planning.
- La nouvelle prise de création depuis une page blanche passe huit revues
  audiovisuelles ; pages/programme/QR en passe huit ; le planning en passe six.
  Le planning utilise le libellé actuel « Frise » et termine réellement dans
  cette vue après l'enregistrement de l'ordre.
- Les confirmations d'enregistrement, saisies et changements de vue ont été
  recalés sur la narration et leurs résultats maintenus lisibles.
- Les voix sont générées en continu avec Gemini 3.8 Flash TTS. Une prise
  prononçant les consignes de pause a été rejetée puis remplacée.
- Des signalements restent dans l'équipe, les modèles et les emails. Certains
  sont contredits par les images, consignées avec l'empreinte exacte du MP4
  dans `scripts/review-counterchecks.md`. Un signalement de perception de voix
  dans l'équipe reste à écouter, sans prétendre le résoudre par une empreinte.
- Les termes « Frise » et « Liste » sont appliqués aux scripts concernés ;
  toute narration ancienne dont le texte a changé doit être régénérée.
- Tous les autres modules et les compléments de couverture documentaire ne
  sont pas encore repris. Ces résultats ne constituent pas une livraison des
  54 vidéos, ni une garantie de couverture intégrale du produit.

## Écarts ouverts par le minimum par créneau (#949)

Le champ facultatif « Minimum » change des écrans montrés, sans changer les
libellés ni les sélecteurs de capture existants (« Places », « Capacité * »,
« Personnes par créneau ») :

- `shift-timeline-quick-actions` : la fenêtre d'un créneau sur la frise a un
  champ « Minimum » à côté de « Places », et « Appliquer à tout le poste » passe
  sous les deux champs, avec une aide « Places et minimum sur tout le poste ».
- `shift-create-series` : le formulaire de série a un champ « Minimum par
  créneau (optionnel) » après « Personnes par créneau ».
- toute vidéo qui ouvre le formulaire d'un créneau, au moins `shift-create-edit-detail` (à vérifier : `organizer-create-publish`, `shift-approval`, `shift-waitlist-offer`, `admin-features-tour`) :
  un champ « Minimum (optionnel) » entre « Capacité » et « Description ».
- `staffing-gaps` : rien ne change tant que la base de démonstration n'a aucun
  créneau avec un minimum (le texte d'aide et le tri restent ceux d'avant) ; la
  narration ne parle pas encore du minimum.

Ces vidéos n'ont pas été régénérées dans la même PR : elles montrent encore
l'ancienne disposition de ces formulaires et restent à reprendre.

## Écart connu : en-tête des pages publiques (#872)

- `masterclass-03-first-steps` montre brièvement `/doc/admin`. Depuis l'ajout de
  « Pour qui ? » dans l'en-tête des pages publiques, l'en-tête filmé n'a pas
  cette entrée. Ni la narration ni les sélecteurs de capture ne sont touchés :
  à reprendre à la prochaine régénération de cette vidéo.

## Écart connu : frise au clavier (#1075)

Chaque jour de la frise de la page publique est maintenant un seul arrêt de Tab ;
les flèches passent d'un créneau à l'autre, y compris les créneaux qu'on ne peut
pas choisir, et une ligne « ← → : même poste · ↑ ↓ : poste voisin · Tab : quitter
le planning » s'affiche sous la frise pendant l'usage au clavier.

- `accessibility-keyboard-display` (scène « public ») : la capture atteint le
  créneau « Accueil » au clavier ; `tabTo` (`videos/lib/record-accessibility.ts`)
  passe maintenant aux flèches dans la frise. Une nouvelle capture montrerait la
  ligne des touches et d'autres touches pressées : à régénérer.
- `shift-roster-visibility` : « La vue Liste permet de parcourir tous les détails
  au clavier » reste vrai, mais la frise le permet aussi désormais : narration à
  revoir à la prochaine régénération.
- `volunteer-choose-shifts` : rien de visible à la souris ; à revoir seulement si
  la vidéo montre le clavier.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : liste des organisations du super admin (#1081)

La liste `/super-admin/organizations` a maintenant une colonne « Activité »
(événement en cours, à venir, dernier événement ou aucun), placée après « État »,
et sous « État » une ligne quand aucun propriétaire n'est actif (« Propriétaire
jamais activé (lien expiré le …) », « Lien d'activation valable jusqu'au … »,
« Aucun compte propriétaire »).

- `platform-internal-administration` : la scène d'accueil filme l'ancienne liste
  et sa narration ne cite ni l'activité ni la ligne du propriétaire ; les
  chapitres de création et d'activation montreraient cette ligne changer. À
  revoir à la prochaine régénération.

Cette vidéo n'a pas été régénérée dans la même PR.
