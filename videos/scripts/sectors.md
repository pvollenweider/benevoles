# Organiser les postes par secteurs

**Identifiant stable :** `SECTORS`

Voix Puck, une prise continue, narration au vouvoiement (organisateurs).

## Utilité

Montrer la fonction bêta des secteurs (#1147, #1170, #1182 à #1187) de bout en bout : activer l'option sur un événement, créer les secteurs d'abord, ajouter un poste dans un secteur, ranger les postes existants, lire la frise et l'export complet groupés, puis suivre un secteur avec le filtre et lui écrire.

## Démonstration

1. Informations du Festival de Montvert, carte Secteurs : activer Organiser les postes par secteurs, puis suivre Organiser les secteurs dans Créneaux.
2. Créneaux, Gérer les postes : la partie Secteurs en haut du panneau. Nouveau secteur « Parking », Ajouter le secteur, puis « Backline ». Le bouton devient Gérer les secteurs et postes.
3. Ajouter un poste dans « Backline » : formulaire « Nouveau poste : premier créneau », poste « Backline Scène du Lac », premier jour, 14:00 à 18:00, 4 places, Ajouter.
4. Autres postes : Déplacer… « Parking Nord » vers Parking, puis « Parking Mairie ». « Bar Grande Scène » et « Accueil Chapiteau » restent dans Autres postes.
5. Frise : en-têtes de secteur avec leur nombre de postes, replier puis déplier Parking, Autres postes en dernier.
6. Documents, Export complet : en-têtes de secteur dans la frise et le récapitulatif, puis Autres postes.
7. Inscriptions, champ Secteur sur Parking : l'adresse garde le choix (la page rouverte reste sur Parking). Même champ sur Où manque-t-il du monde ?, Jour J et Documents.
8. Inscriptions filtrées, Écrire au secteur Parking : « Les bénévoles d'un secteur » choisi, « 5 personnes recevront ce message. ». Aucun envoi.

## Résultat visible

Un événement organisé par secteurs, ses postes rangés, ses vues filtrées et un message préparé pour un secteur.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts sectors` (organisation dédiée inscrite à la bêta, fonction Secteurs seule ouverte, événement qui commence demain pour que Jour J soit proposé, secteurs désactivés). Une prise par seed : la prise enregistre des secteurs, ce qui ne peut plus être défait.
- Les bénévoles ne voient jamais les secteurs : ne rien montrer côté page d'inscription.
- Le compteur de 5 personnes vient des inscriptions confirmées de Parking Nord (Aline, Nicolas, Léa, Noah) et Parking Mairie (Sarah).
- L'adresse de la page n'est pas visible dans la capture : la narration le montre en rouvrant la page, sans afficher l'identifiant du secteur.
- Rendu en attente (sources seulement, 2026-10-28).
