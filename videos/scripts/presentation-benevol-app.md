# benevol.app en deux minutes

**Identifiant stable :** `PRODUCT_PRESENTATION`

Voix Kore, une prise continue, ton de récit chaleureux (on raconte la fête d'une association à une autre), vouvoiement dans la conclusion. Narration validée par le propriétaire le 28 novembre 2026, à partir du premier jet `.claude/agent-rules/video-presentation-draft.md`.

## Utilité

Montrer en deux minutes à quoi sert benevol.app, à quelqu'un qui ne le connaît pas : l'histoire d'une fête de village (le jeu de démonstration « Fête du village de Montvert »), de la préparation au bilan, sur les vrais écrans. Pour l'accueil, `/fonctionnalites`, YouTube et l'email de la 2.9.

## Démonstration

1. Carton titre, puis la page de l'événement « Fête du village de Montvert » (Élodie, l'organisatrice du jeu de démonstration).
2. « Dupliquer l'événement » (reprendre la fête de l'an dernier), puis la frise des créneaux.
3. La page d'inscription publique : Léa (nom du casting, adresse example.org) choisit l'accueil de 9 h à 12 h, « Continuer », remplit son nom, son email et son téléphone, accepte la convention et l'usage de ses données, « Confirmer mon inscription » ; la page de résultat.
4. « Où manque-t-il du monde ? », puis « Messages » avec un modèle choisi dans « Partir d'un modèle ».
5. « Documents à imprimer », jusqu'aux badges.
6. La section « Résumé de l'événement ».
7. Carton « Gratuit et open source » (« Développé en Suisse, hébergé en France, sans cookie de pistage »), puis la page « Demander un espace ».

## Points d'attention

- Seed : le jeu de démonstration (`scripts/seed-demo.ts`), remis à zéro avant chaque prise : la prise ajoute la demande d'inscription de Léa.
- Recorder : `videos/lib/record-product-presentation.ts`, branché dans `videos/tools/record.ts`. Aucun message n'est envoyé (le modèle est seulement chargé), aucune écriture en base hors de l'inscription réelle de Léa.
- Faits (tous dans `content/pages/FEATURES.md`) : reprise de l'édition précédente avec ses dates décalées, inscription sans compte ni mot de passe, email de confirmation, rappels automatiques, créneaux à compléter triés, modèles de messages, documents à imprimer et badges, pointage depuis un téléphone, bilan des bénévoles et des heures, gratuit et open source, développé en Suisse, hébergé en France, sans cookie de pistage. « Est gratuit » décrit l'état actuel, sans promesse.
- Ne jamais montrer un logo ou l'écran d'un autre outil ; le tableur n'est que cité dans l'accroche.

## Révision

- Révision 1 (2026-11) : création. Sources écrites par Claude, capture par Codex.
