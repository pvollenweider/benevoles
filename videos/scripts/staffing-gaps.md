# Voir précisément où il manque du monde

Vidéo autonome 40. Voix unique Kore, souriante et patiente. Le rapport est un outil de décision, pas une preuve de présence.

## Parcours à capturer

1. Depuis la page de l'événement, ouvrir le rapport des besoins.
2. Lire places pourvues/capacité, nombre de créneaux, attentes et demandes. Distinguer places et personnes différentes.
3. Poste Photos vide : deux créneaux, six places ; ouvrir le vrai planning et vérifier ses horaires.
4. Besoins triés, fermeture exclue ; suivre Buvette 18–22 vers les inscriptions filtrées et le message ciblé, sans envoyer ce message.
5. Navette : 0 confirmation, 2 demandes sur 2 places ; retrouver Lucas et Marc. Ne pas confondre ratio de confirmations et nombre de places encore disponibles.
6. Buvette 14–18 : quatre confirmations, trois attentes, positions visibles après ouverture du créneau.
7. Postes sans responsable : ouvrir la gestion, montrer les responsables déjà existants.
8. Créneaux complets : Accueil 12–15 confirmé, Navette sur demandes.
9. Ajouter réellement Julien aux Photos du samedi depuis l'inscription filtrée. Retourner au rapport et vérifier que les besoins diminuent d'une place, le poste sort des entièrement vides.

## Données

Scénario `staffing-gaps`, à exécuter après le seed de base et hors de toute capture en cours. Photos est créé avec deux horaires et six places, Accueil du matin a six places, Accueil 15–18 est fermé. Tous les groupes du rapport sont vérifiés avec le helper réel `staffingSummary`.

La capacité globale comprend les créneaux fermés, mais le total des manques ne les compte pas. Les demandes soustraient une place du manque ; les offres et attentes ne sont pas des confirmations. Ne pas présenter la barre seule comme une disponibilité réelle.

## État

Source du rapport examinée, narration de neuf chapitres générée, seed exécuté et vérifié avec le helper réel, recorder préparé ; TypeScript passe. Le 5 octobre 2026, un contrôle navigateur en lecture seule a confirmé que les quatre liens de démonstration (Buvette soir, Buvette avec attentes, Navette avec demandes, Photos samedi) existent chacun exactement une fois. Le recorder utilise leur format réel HH:MM, distinct du format oral du sélecteur de créneau.

Le contrôle indépendant de narration est interrompu par HTTP 402 (crédits prépayés Gemini épuisés). Capture et MP4 restent à produire ; aucun audio nouveau n'est présenté comme contrôlé.
