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


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des réglages hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `welcome` : Une épicerie, un accueil ou une distribution reviennent chaque semaine, toute la saison. Plutôt que de créer chaque date, décrivez la permanence une fois : toutes ses dates sont créées, jours fériés et fermetures exclus. L’événement porte la saison : ici, treize semaines. Ouvrons Répéter chaque semaine.
- `describe` : Pour le poste, écrivons Caisse et accueil. Le texte sous le champ rappelle que les réglages du poste s’appliquent aux nouveaux créneaux. Cochez les jours, le mardi et le jeudi, et gardez le rythme Chaque semaine ; une semaine sur deux convient par exemple à un repair café. La plage va de dix-sept heures à dix-neuf heures trente, en un seul créneau, avec deux personnes par créneau.
- `exclusions` : Les jours fériés suisses sont proposés d’après le fuseau horaire de l’organisation. Ajoutons une fermeture : un mardi où le local reste fermé. L’aperçu donne le nombre de dates et de créneaux, les premières dates, puis chaque date exclue avec sa raison : jour férié ou fermeture.
- `create` : Créons les créneaux. La permanence rejoint la liste Permanences récurrentes, avec son rythme, sa période et le nombre de dates à venir. Chaque date est un créneau ordinaire : les bénévoles s’y inscrivent et reçoivent leurs rappels comme d’habitude.
- `change` : Finalement, la caisse a besoin de trois personnes. Modifier à partir d’une date change le nombre de personnes sur toutes les dates suivantes, sans toucher aux dates passées. Si l’horaire change, les bénévoles inscrits sont prévenus par email.
- `stop` : La réception des livraisons s’arrête à partir de la cinquième semaine. Les dates sans inscrit sont supprimées. Ici, deux dates ont déjà des inscrits : elles sont d’abord listées, et rien ne change tant que vous ne confirmez pas. Confirmons : ces deux créneaux sont annulés et chaque personne est prévenue par email.
- `volunteer` : Côté bénévoles, une saison de quatre semaines ou plus n’affiche plus les jours passés. À partir de huit dates, le planning se lit mois par mois : chaque bouton de mois indique son nombre de dates.
- `result` : Une permanence se décrit une fois, se modifie ou s’arrête d’un seul geste, et chaque date reste modifiable seule. Pour la saison suivante, dupliquez l’événement : les permanences sont recréées sur les mêmes jours de la semaine.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.
