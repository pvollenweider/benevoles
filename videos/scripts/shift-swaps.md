# Échanges de créneaux entre bénévoles

**Identifiant stable :** `SHIFT_SWAPS`

Voix Kore, une prise continue. Narration au vouvoiement pour les organisateurs, à la troisième personne pour les bénévoles ; leurs pages restent au tutoiement.

## Utilité

Montrer la fonction bêta des échanges de créneaux (#1174, #1175) : l'option de l'événement, un échange entre deux créneaux du même poste, puis un échange entre deux postes d'un même secteur, validé par l'organisation.

## Démonstration

1. Informations du Festival de Montvert, carte Échanges de créneaux : activer Autoriser les demandes d'échange de créneaux ; Valider chaque échange reste désactivé.
2. Page Mes inscriptions de Léa (Bar Grande Scène, samedi 14h à 18h) : Je cherche à échanger ce créneau, « Demande publiée ».
3. Page de Jules (deux créneaux du même bar le dimanche) : Échanges proposés par d'autres bénévoles, sans le nom de Léa ; choisir le créneau de 14h à 18h, Proposer cet échange.
4. Page de Léa : « Jules H. te propose un échange », Tu cèdes et Tu reçois, Accepter l'échange, Oui, échanger : « Échange effectué ». Tous mes créneaux, puis le vrai email « Échange effectué » dans la boîte locale.
5. Informations de l'événement : activer Valider chaque échange.
6. Noah (Accueil Scène du Lac, samedi matin) publie sa demande ; Lou (Accueil Grande Scène, dimanche matin, même secteur Accueil) la voit avec le nom du poste et propose son créneau.
7. Noah accepte : la confirmation dit que l'organisation devra valider ; état « En attente de la validation de l'organisation ».
8. Inscriptions, section Échanges de créneaux, À valider : Valider l'échange, confirmation, « Échange validé et effectué ».
9. Page de Noah : Échanges terminés.

## Résultat visible

Deux échanges réels, l'un effectué tout de suite, l'autre après validation, avec leurs emails.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts shift-swaps` (organisation dédiée inscrite à la bêta, fonctions Secteurs et Échanges de créneaux ouvertes, événement un samedi et un dimanche au moins deux semaines plus tard, secteurs Bars et Accueil, échanges désactivés). Une prise par seed.
- Les pages des bénévoles s'ouvrent par leur lien personnel, comme depuis leurs emails ; aucun nom de la personne qui demande n'apparaît dans les propositions.
- La narration dit « Jules, initiale H », la forme lue par les lecteurs d'écran ; l'écran montre « Jules H. ».
- Ne pas annoncer d'email non observé : seul l'email « Échange effectué » de Léa est ouvert.
- Rendu en attente (sources seulement, 2026-10-28).
