# Voir précisément où il manque du monde

Vidéo autonome 40. Voix unique Kore, souriante et patiente. Le rapport est un outil de décision, pas une preuve de présence.

## Parcours à capturer

1. Dans Aperçu, suivre Voir les créneaux à compléter pour ouvrir le rapport Où manque-t-il du monde ?.
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

Révision batch 14 : seuls les impératifs des chapitres overview, requests et full changent : « lisez aussi les attentes », « Suivez le lien des demandes… puis examinez leurs informations », « Lisez donc aussi les mentions ». Tous les autres mots du transcript sont conservés.


## Révision du 2026-10-16 — lot 22-4

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` et PR fusionnées (dont #1021, lot 2, et #1022 pour #1013) : en-tête partagé et onglets, Aperçu centré sur les besoins, Communication pour les messages et rappels, Documents à imprimer, vocabulaire Places / Étiquettes / Modifier / Heures prévues. La page personnelle affiche Mes réponses et S’inscrire à d’autres créneaux ; les responsables peuvent recevoir les changements de réponses liés à leur poste. Les sélecteurs et les ancres suivent les écrans actuels.

Narration textuelle conservée : aucun changement de style. Réutilisation conditionnée à la concordance exacte du texte et des WAV restaurés, contrôlée séparément.

Contrôle des WAV restaurés le 2026-10-16 : la reconnaissance indépendante retrouve encore le tutoiement de l’ancienne prise. Le texte actuel au vouvoiement reste inchangé, mais cet audio ne lui correspond pas. WAITING TTS : régénération intégrale obligatoire, aucune combinaison de phrases anciennes et nouvelles. Phrases au vouvoiement à produire dans cette prise :

- Depuis l'événement, ouvrez Où manque-t-il du monde.
- Cette vue regroupe les besoins pour savoir où concentrer vos efforts, plutôt que de parcourir tout le planning.
- La phrase de besoin et la barre donnent un aperçu, mais lisez aussi les attentes et les demandes.
- Cliquez sur le poste pour retrouver le planning et vérifier les dates, les horaires et la mission.
- Avant de recruter, assurez-vous que la demande est claire : quelqu'un doit comprendre ce qu'il fera, où et pendant combien de temps.
- Suivez le lien des demandes pour retrouver Lucas et Marc, puis examinez leurs informations avant de décider.
- Dans Personnes en liste d'attente, vous repérez les horaires où des personnes attendent une place.
- En cliquant, vous retrouvez les noms et leurs positions dans la liste.
- Vous pouvez ensuite réfléchir à une place supplémentaire ou à un autre horaire ; ce rapport ne les inscrit pas automatiquement sur un créneau différent.
- Lisez donc aussi les mentions de statut, pas seulement le ratio.
- Vous pouvez vérifier le résultat, puis vous concentrer sur le besoin suivant.
