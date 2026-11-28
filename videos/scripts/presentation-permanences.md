# Des bénévoles chaque semaine, sans refaire le planning

**Identifiant stable :** `RECURRING_PRESENTATION`

Deux voix (récit Kore, accroches Puck), ton de récit chaleureux, vouvoiement dans la conclusion. Narration validée par le propriétaire le 28 novembre 2026 (`.claude/agent-rules/videos-presentation-v2-draft.md`), moins la phrase sur les fermetures, que l'écran de création depuis un modèle ne montre pas.

## Utilité

Donner envie d'essayer benevol.app aux associations dont l'activité revient toute l'année (repair café, épicerie participative, distribution alimentaire, permanence d'accueil, café associatif) : une saison décrite une fois, des bénévoles qui prennent plusieurs dates d'un coup, le suivi et le rapport annuel.

## Démonstration

1. Carton titre (accroche : « Votre association n'a pas un grand jour par an… »), puis l'espace du Repair Café de Montvert, encore sans événement.
2. Carton « Une fois pour toute la saison », puis « Nouvel événement », modèle « Repair café », titre « Repair Café de Montvert », premier jour (le premier samedi au moins deux jours plus tard), « Ce qui sera créé », « Créer le brouillon » ; publication depuis la vérification.
3. Carton « Et les bénévoles ? », puis la page d'inscription : le groupe « Choisir le mois », Sarah choisit deux réparations du premier mois et une du suivant, remplit le formulaire, confirme.
4. Sa page « Mes inscriptions », ouverte depuis son vrai email de confirmation, et la carte « Mon calendrier ».
5. Carton « Et en fin d'année ? », puis « Où manque-t-il du monde ? » et, dans Membres, « Heures par bénévole, pour une période (CSV) ».
6. Carton « Décrivez votre permanence une fois », la page « Demander un espace », puis le carton « Essayez benevol.app ».

Vignette : « Une permanence, toute la saison » (`thumbnailTitle`), sur une image de la page d'inscription avec ses boutons de mois.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts repair-cafe-presentation` (organisation dédiée `repair-cafe-montvert`, Europe/Zurich, sans événement). Une prise par seed : la prise crée et publie la saison, et inscrit Sarah.
- Recorder : `videos/lib/record-recurring-presentation.ts`, branché dans `videos/tools/record.ts` ; la revue audiovisuelle vérifie d'abord le jeu fictif (`videos/lib/verify-repair-cafe-review-fixture.ts`).
- Faits : `content/pages/PLANNING-PERMANENCES-BENEVOLES.md` (quatre modèles, repair café un samedi sur deux, jours fériés exclus), `content/pages/FEATURES.md` (saison en liste, plusieurs créneaux en une inscription, Mes inscriptions et Mon calendrier, rappels, heures par bénévole pour le rapport annuel).

## Révision

- Révision 1 (2026-11) : création. Sources écrites par Claude, capture par Codex.
