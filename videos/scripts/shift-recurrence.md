# Créer des permanences récurrentes

**Identifiant stable :** `SHIFT_RECURRENCE`

## Utilité

Une activité qui revient chaque semaine (épicerie participative, accueil, distribution) se décrit une fois pour toute la saison, au lieu de créer chaque date.

## Démonstration

1. Ouvrir la page des créneaux de l'événement « Épicerie de la Gare — permanences » (13 semaines à partir du lundi qui suit la prise, `scripts/seed-video-recurrence.ts`), qui a déjà la permanence « Réception des livraisons » (chaque mercredi).
2. Ouvrir « Répéter chaque semaine ».
3. Poste « Caisse et accueil », mardi et jeudi, « Chaque semaine », 17:00 à 19:30, un créneau sur toute la plage, 2 personnes.
4. Garder les jours fériés suisses proposés, ajouter la fermeture du mardi de la troisième semaine.
5. Lire l'aperçu : résumé, dates créées, dates exclues avec leur raison.
6. Créer les créneaux ; la permanence apparaît sous « Permanences récurrentes ».
7. « Modifier à partir d'une date » sur « Caisse et accueil » : 3 personnes par créneau, « Modifier ces dates ».
8. « Arrêter à partir d'une date » sur « Réception des livraisons », à partir du mercredi de la cinquième semaine : deux dates avec inscrits listées, puis « Annuler aussi ces 2 dates et prévenir les inscrits ».
9. Page publique de l'événement : les boutons de mois indiquent chacun leur nombre de dates ; passer au mois suivant. « Choisir le mois » est le nom accessible du groupe, pas un titre affiché : ne pas le décrire comme un texte visible.

## Résultat visible

- Une permanence crée toutes ses dates, jours fériés et fermeture exclus, chacune expliquée.
- La modification s'applique aux dates suivantes seulement.
- Rien n'est annulé sans confirmation explicite ; les inscrits sont prévenus.
- Les bénévoles lisent la saison mois par mois.

## Points d'attention

- Les dates dépendent du jour de la prise : la narration ne cite ni date ni jour férié précis.
- Les jours fériés de la période varient selon la saison filmée ; seule la fermeture ajoutée est garantie dans l'aperçu.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration conservée : aucun libellé cité ni comportement décrit ne contredit l’écran actuel. Les WAV référencés par les anciennes métadonnées sont absents de cette copie ; ne pas prétendre avoir réutilisé un audio disponible.

## Révision du 2026-10-16 — lot 22-14

Nouvelle narration Puck intégrale, sans mélange de phrases. La première prise est écartée avant tournage : deux reconnaissances indépendantes et un contrôle ciblé lisent « café accueil » au lieu de « Caisse et accueil ». La phrase devient « Pour le poste, écrivons Caisse et accueil. », avec une nouvelle génération complète et un nouvel audit. Le repère final du recorder utilise « Pour la saison suivante », qui figure réellement dans la narration.
