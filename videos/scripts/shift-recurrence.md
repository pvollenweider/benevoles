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
9. Page publique de l'événement : « Choisir le mois », passer au mois suivant.

## Résultat visible

- Une permanence crée toutes ses dates, jours fériés et fermeture exclus, chacune expliquée.
- La modification s'applique aux dates suivantes seulement.
- Rien n'est annulé sans confirmation explicite ; les inscrits sont prévenus.
- Les bénévoles lisent la saison mois par mois.

## Points d'attention

- Les dates dépendent du jour de la prise : la narration ne cite ni date ni jour férié précis.
- Les jours fériés de la période varient selon la saison filmée ; seule la fermeture ajoutée est garantie dans l'aperçu.
