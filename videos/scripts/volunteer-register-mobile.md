# S’inscrire comme bénévole depuis son téléphone

## Objectif

Montrer en moins d’une minute comment choisir un créneau, remplir le formulaire et retrouver son accès personnel après l’inscription.

## Public

Une personne qui découvre l’événement depuis un lien partagé par l’association.

## Ton

Chaleureux, détendu et complice. Les bénévoles donnent de leur temps : on les guide simplement, sans jargon et sans ton commercial.

## Préparation

- Base locale jetable, jamais la production.
- Seed principal puis `scripts/seed-demo.ts`.
- Événement fictif « Fête du village de Montvert ».
- Vue mobile de 390 × 844 pixels.
- Identité fictive : Alex Martin, `alex.martin.video.<horodatage>@example.org`.
- Créneau choisi : Accueil, 15 h–18 h.

## Séquences

### 0. Scanner le QR code — plan réel facultatif, 3 à 4 s

- **Écran** : appareil photo du téléphone dirigé vers le QR code public téléchargé depuis la page d’administration de l’événement.
- **Action** : toucher la proposition d’ouverture de la page.
- **Montage** : ce plan vient d’un téléphone réel, car l’appareil photo et sa bannière appartiennent au système. Ne pas les imiter dans Playwright.
- **Alternative** : commencer directement sur la page si la personne a reçu le lien.

### 1. Bienvenue — environ 8 s

- **Écran** : titre de l’événement et début du planning.
- **Action** : aucune ; laisser le temps de situer la page.
- **Voix** : « Envie de donner un coup de main ? Ouvre le lien reçu, ou scanne le QR code affiché par l’association. Tu peux choisir ton créneau directement depuis ton téléphone. »

### 2. Découvrir le planning — environ 7 s

- **Écran** : planning de la journée.
- **Action** : faire apparaître le créneau Accueil de 15 h à 18 h.
- **Voix** : « Sur la page de l’événement, tu retrouves les horaires, les postes et le nombre de places encore disponibles. »

### 3. Choisir — environ 8 s

- **Action** : toucher Accueil 15 h–18 h, montrer le récapitulatif, puis Continuer.
- **Voix** : « Choisis simplement le créneau qui te convient. Ici, on rejoint l’équipe d’accueil de quinze heures à dix-huit heures. »

### 4. Coordonnées — environ 9 s

- **Action** : remplir prénom, nom, e-mail et téléphone avec un rythme lisible.
- **Voix** : « Ajoute ensuite tes coordonnées. Elles servent uniquement à l’organisation de l’événement et à l’envoi des informations utiles. »

### 5. Questions et consentements — environ 9 s

- **Action** : choisir la taille M, puis accepter la convention et l’utilisation des données.
- **Voix** : « Réponds aux quelques questions pratiques, puis accepte la convention et l’utilisation de tes données pour cet événement. »

### 6. Confirmation — environ 6 s

- **Action** : faire défiler jusqu’au récapitulatif puis toucher Confirmer mon inscription.
- **Voix** : « Un dernier coup d’œil au récapitulatif, et c’est parti : confirme ton inscription. »

### 7. Succès — environ 10 s

- **Écran** : confirmation et indication de l’e-mail envoyé.
- **Action** : laisser le résultat visible. Le lien personnel n’est volontairement jamais révélé à l’écran après une inscription anonyme ; il part uniquement par e-mail.
- **Voix** : « Et voilà, tu fais partie de l’équipe ! Un e-mail de confirmation arrive dans ta boîte. Il contient ton lien personnel pour retrouver, modifier ou annuler ton inscription. »

## Transcript

Envie de donner un coup de main ? Ouvre le lien reçu, ou scanne le QR code affiché par l’association. Tu peux choisir ton créneau directement depuis ton téléphone.

Sur la page de l’événement, tu retrouves les horaires, les postes et le nombre de places encore disponibles.

Choisis simplement le créneau qui te convient. Ici, on rejoint l’équipe d’accueil de quinze heures à dix-huit heures.

Ajoute ensuite tes coordonnées. Elles servent uniquement à l’organisation de l’événement et à l’envoi des informations utiles.

Réponds aux quelques questions pratiques, puis accepte la convention et l’utilisation de tes données pour cet événement.

Un dernier coup d’œil au récapitulatif, et c’est parti : confirme ton inscription.

Et voilà, tu fais partie de l’équipe ! Un e-mail de confirmation arrive dans ta boîte. Il contient ton lien personnel pour retrouver, modifier ou annuler ton inscription.

## Contrôles avant publication

- Aucun nom, e-mail, téléphone ou jeton réel.
- Si le plan QR est utilisé, son code pointe uniquement vers l’événement public de démonstration ou vers une URL publique explicitement destinée à la vidéo.
- Les libellés prononcés correspondent à l’interface publiée.
- Le pointeur ne masque aucun texte.
- Les sous-titres ont été relus et restent synchronisés.
- Aucun lien personnel n’est révélé sur la page de succès d’une inscription anonyme.
- La vidéo reste compréhensible sans le son.
- La voix reste compréhensible sans regarder l’image.
