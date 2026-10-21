# Gérer l’équipe et les permissions

**Identifiant stable :** `ORG_TEAM_PERMISSIONS`

## Utilité

Donner un compte nominatif à chaque membre de l’équipe et limiter les droits sensibles aux
personnes qui en portent réellement la responsabilité.

## Démonstration

1. Lire la liste d’une équipe contenant deux propriétaires et une organisatrice.
2. Comparer précisément les deux rôles.
   Distinguer aussi le responsable de secteur : il consulte les informations
   de sa mission par un lien personnel, ce n’est pas un troisième rôle de compte admin.
3. Inviter Léa comme organisatrice et montrer son statut en attente.
4. Montrer la confirmation d’envoi par email du lien d’activation valable sept jours, sans lien à copier.
5. Modifier son rôle avec la confirmation explicite « Appliquer ».
6. Se connecter comme organisatrice et montrer l’interface en lecture seule de l’équipe.

## Résultat visible

- Chaque personne utilise son propre compte.
- L’invitation en attente n’accorde pas encore d’accès.
- Le rôle détermine réellement les commandes visibles et les opérations autorisées.

## Points d’attention

- Avoir deux propriétaires actifs est une précaution recommandée, pas une obligation du logiciel.
- Un espace en attente de validation ne peut pas inviter d’autres administrateurs.
- Une invitation expirée et jamais acceptée libère l’adresse après une heure si son espace compte déjà un administrateur actif ; les comptes actifs et invitations valables sont conservés.
- Un rôle n’est changé qu’après le bouton « Appliquer ».
- Retirer un accès ne supprime pas l’historique.
- Les réglages sensibles et les suppressions définitives restent réservés aux propriétaires.


## Révision du 2026-10-16 — lot 22-6

Relecture du produit `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased], PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 (onglets), #1022 (correction #1013). Navigation par onglets, libellés et repères de phrases contrôlés.

Texte de narration conservé ; réutilisation soumise au contrôle des empreintes ou à une reconnaissance indépendante du WAV restauré.

Bilan final du lot 22-6 (2026-10-16) : READY ; BUILD_ID `mmgd3Xkj4ODeijoElwvVr`. Durée 144.8 s, musique 14.3–19.4 LU sous la voix, zéro tutoiement du spectateur dans le VTT final. Voir le rapport et les preuves du rendu local.


## Révision du 2026-10-17 — lot 26

Produit filmé : `490a44c306da8b93b4920ece009a452baf27fdbf` (#1061, #1063).
La confirmation d’invitation est montrée sans lien à copier. Le jeu de formation
est un espace validé. Narration Puck entièrement régénérée en une seule prise,
sans balises de pause ; la frontière avant « limits » a été recalée puis auditée.

## Reprise du 2026-10-21 — lot 27-2

La phrase du WAV Puck conservé « On choisit d’abord… Appliquer » est bornée
à 1,716–5,509 s du chapitre. La reconnaissance du court extrait
3,75–5,65 s retrouve uniquement « puis on confirme avec Appliquer », terminé
vers 5,23 s. Le cue intra-phrase est calculé à 4,07 s : centre de cette
proposition (4,49 s), moins les 420 ms de déplacement du pointeur de `tap`.
Le repère `at("On choisit d’abord Propriétaire dans")` reste enregistré.
La répétition `--rehearse --audio-timing` utilise les vrais WAV et demeure
inassemblable ; son clic réel à +4,542 s tombe dans la proposition nommée.
Les preuves conservent le WAV par empreinte, l’ASR et les images avant/après.
