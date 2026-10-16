# Créer, dupliquer et redimensionner depuis la Frise

**Identifiant stable :** `SHIFT_TIMELINE_QUICK_ACTIONS`

## Démonstration

1. Dessiner un créneau dans une zone vide.
2. Compléter puis enregistrer le formulaire prérempli.
3. Redimensionner la barre depuis son bord droit.
4. Ouvrir les actions rapides.
5. Cliquer sur « Dupliquer » pour créer la relève suivante.
6. Revenir à l’éditeur détaillé.

## Résultat visible

- Les heures suivent le dessin et le redimensionnement.
- La copie reste indépendante.
- Les champs avancés restent accessibles dans l’éditeur complet.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration à régénérer intégralement en une passe avec la même voix, `continuousPauseTags: false`. En attente du TTS (plafond mensuel connu), sans monter l’ancienne voix. Phrases modifiées :

- `resize` : Pour corriger une durée, attrapez le bord droit du créneau et déplacez-le. Ici, la barre s’allonge de quarante-cinq minutes, par pas de quinze minutes. Rouvrez ensuite les actions rapides : l’heure de fin a bien changé. Vérifiez-la avant de fermer.
- `copy` : Dupliquer reprend le poste, la durée, la capacité et les informations du créneau. La nouvelle plage commence juste après l’originale. Ouvrez cette copie : elle est indépendante. Donnez-lui le libellé Relève suivante, puis ajustez ses heures. Ici, on la décale de quinze minutes avec le bouton Décaler. Fermer et enregistrer conserve le nouveau libellé.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des réglages hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `welcome` : La Frise n’est pas seulement une vue de lecture. Elle permet aussi de construire rapidement un planning visuel : dessiner une plage libre, ajuster sa durée, dupliquer une relève et ouvrir le détail sans quitter le contexte de la journée.
- `draw` : Dans la ligne d’un poste, cliquez dans une zone vide puis faites glisser jusqu’à l’heure de fin souhaitée. Le créneau est créé, et ses actions rapides s’ouvrent avec les horaires calculés. Donnez-lui un libellé, ajustez les places, puis fermez avec Fermer et enregistrer.
- `resize` : Pour corriger une durée, attrapez le bord droit du créneau et déplacez-le. Ici, la barre s’allonge de quarante-cinq minutes, par pas de quinze minutes. Rouvrez ensuite les actions rapides : l’heure de fin a bien changé. Vérifiez-la avant de fermer.
- `popover` : Un clic sur la barre ouvre ses actions rapides. On y retrouve les heures, l’état des inscriptions et les commandes utiles. Le choix Appliquer au poste propose Ce jour ou Tout l’événement pour étendre les réglages au poste sur la période choisie. C’est le bon endroit pour une petite correction, sans parcourir tout le formulaire.
- `copy` : Dupliquer reprend le poste, la durée, la capacité et les informations du créneau. La nouvelle plage commence juste après l’originale. Ouvrez cette copie : elle est indépendante. Donnez-lui le libellé Relève suivante, puis ajustez ses heures. Ici, on la décale de quinze minutes avec le bouton Décaler. Fermer et enregistrer conserve le nouveau libellé.
- `detail` : Pour ajouter une consigne à cette relève, passez en Liste, puis cliquez sur Modifier. L’éditeur détaillé contient aussi le lieu, le contact, l’âge minimum et les règles d’inscription. Ici, saisissez Venir dix minutes avant dans Consigne pratique, puis enregistrez. Ce conseil appartient à la copie, sans modifier l’original.
- `result` : De retour en Liste, les deux créneaux sont bien présents après rechargement. L’original conserve son libellé, et Relève suivante a ses propres horaires et trois places. Cette relecture permet de contrôler le résultat réel des gestes de Frise avant publication.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.
