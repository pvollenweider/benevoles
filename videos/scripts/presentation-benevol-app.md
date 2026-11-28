# benevol.app en deux minutes

**Identifiant stable :** `PRODUCT_PRESENTATION`

Deux voix (récit Kore, accroches Puck), ton de récit chaleureux (on raconte la fête d'une association à une autre), vouvoiement dans la conclusion. Narration validée par le propriétaire le 28 novembre 2026, à partir du premier jet `.claude/agent-rules/video-presentation-draft.md`.

## Utilité

Montrer en deux minutes à quoi sert benevol.app, à quelqu'un qui ne le connaît pas : l'histoire d'une fête de village (le jeu de démonstration « Fête du village de Montvert »), de la préparation au bilan, sur les vrais écrans. Pour l'accueil, `/fonctionnalites`, YouTube et l'email de la 2.9.

## Démonstration

Deux voix : le récit (Kore) et une voix vive pour les accroches et l'appel final (Puck), chacune générée en une prise continue. Chaque réplique de la voix vive s'accompagne d'un carton plein écran.

1. Carton « benevol.app en deux minutes » (accroche : « Des dizaines de bénévoles… »), puis la page de l'événement « Fête du village de Montvert ».
2. Carton « Préparer », puis « Dupliquer l'événement », la frise des créneaux et la navette (21 ans minimum, sur validation).
3. Carton « Un lien, c'est tout », puis la page d'inscription : Léa choisit l'accueil de 9 h à 12 h, remplit le formulaire, accepte la convention et l'usage de ses données, confirme ; la page de résultat.
4. Carton « Gratuit », « Et sans compte pour les bénévoles ».
5. « Où manque-t-il du monde ? », puis « Messages » avec un modèle.
6. Carton « Le jour J », puis « Documents à imprimer » (badges) et « Résumé de l'événement ».
7. Carton de fin « Essayez benevol.app » (« Gratuit · Open source · Hébergé en France »), la page « Demander un espace », puis le carton « Demandez votre espace ».

Vignette : « Vos bénévoles, sans le tableur » (`thumbnailTitle`), sur une image de la frise (`posterAtMs` à régler au tournage sur la frise pleine).

## Points d'attention

- Seed : le jeu de démonstration (`scripts/seed-demo.ts`), remis à zéro avant chaque prise : la prise ajoute la demande d'inscription de Léa.
- Recorder : `videos/lib/record-product-presentation.ts`, branché dans `videos/tools/record.ts`. Aucun message n'est envoyé (le modèle est seulement chargé), aucune écriture en base hors de l'inscription réelle de Léa.
- Faits (tous dans `content/pages/FEATURES.md`) : reprise de l'édition précédente avec ses dates décalées, inscription sans compte ni mot de passe, email de confirmation, rappels automatiques, créneaux à compléter triés, modèles de messages, documents à imprimer et badges, bilan des bénévoles et des heures, gratuit et open source, développé en Suisse, hébergé en France, sans cookie de pistage. « Est gratuit » décrit l'état actuel, sans promesse.
- Ne jamais montrer un logo ou l'écran d'un autre outil ; le tableur n'est que cité dans l'accroche.

## Révision

- Révision 1 (2026-11) : création. Sources écrites par Claude, capture par Codex.
