# Préparer, publier et partager un planning bénévole

Révision rédactionnelle du 13 octobre 2026 : narration adressée aux organisateurs au vouvoiement, impératifs compris. Les citations destinées aux bénévoles conservent leur ton initial. Seules les phrases modifiées sont renarrées, avec la même voix que la prise d’origine et sans balises de pause. Les anciennes preuves ne valident pas ce nouveau texte ; narration, sous-titres, synchronisation et MP4 final sont à recontrôler après régénération.

## Objectif

Montrer un parcours organisateur réaliste : choisir entre un modèle et une page blanche, créer un événement depuis zéro, configurer plusieurs types de postes, programmer les inscriptions, prévisualiser et publier le planning, diffuser un QR code, importer un premier vivier de membres et envoyer des invitations.

## Ton

Chaleureux, souriant et complice. La narration vient d’une personne habituée à organiser des événements associatifs, contente de montrer une méthode simple à une autre personne. Aucun ton commercial.

## Découpage

1. **Point de départ** — liste des événements, puis « Nouvel événement » ; présentation du choix entre un modèle prérempli et une page blanche. La démonstration continue avec la page blanche pour tout créer depuis le début.
2. **Informations essentielles** — titre, description, lieu et dates ; création en brouillon.
3. **Accueil** — rappel que les créneaux peuvent être créés manuellement, puis série de deux créneaux de 10 h à 14 h pour montrer le raccourci utile quand les horaires se répètent.
4. **Livraison** — créneau manuel de 9 h à 12 h, âge minimum de 18 ans, avec « permis B valide obligatoire » dans la description et la consigne publique.
5. **Caisse** — créneau de 12 h à 16 h, avec inscription « Sur validation » pour que l’organisateur accepte ou refuse chaque demande.
6. **Période d’inscription** — ouverture et fermeture programmées ; sans date d’ouverture, les inscriptions sont disponibles dès la publication.
7. **Vérification** — récapitulatif des trois postes, quatre créneaux et huit places.
8. **Aperçu** — simulation d’une inscription complète avant publication : choix d’un créneau, saisie des coordonnées, confirmation, message final et aperçu de l’email automatique. Rien n’est enregistré ni envoyé.
9. **Publication** — publication sans envoi automatique.
10. **QR code** — fiche imprimable et téléchargements PNG/SVG.
11. **Import initial** — fichier CSV fictif de douze membres pour constituer rapidement sa première liste, analyse préalable, puis confirmation.
12. **Invitations** — filtre sur l’étiquette « caisse » ; les invitations peuvent partir par lot ou individuellement, avec un message d’accompagnement.
13. **Résultat public** — planning final vu par les bénévoles.

## Données fictives importées

- Sophie Roch — tag `caisse` ;
- Malik Diallo — étiquettes `livraison`, `permis-b` ;
- Ana Silva — tag `accueil`.
- Léa Morel — étiquettes `accueil`, `matin` ;
- Hugo Bernard — tag `logistique` ;
- Camille Dubois — étiquettes `caisse`, `soir` ;
- Noah Petit — tag `accueil` ;
- Emma Garcia — tag `logistique` ;
- Lucas Robert — étiquettes `livraison`, `permis-b` ;
- Chloé Richard — tag `accueil` ;
- Adam Durand — tag `caisse` ;
- Inès Laurent — tag `logistique`.

Les adresses utilisent exclusivement `example.org`.

## Précision fonctionnelle

L’application ne vérifie pas administrativement la validité d’un permis. L’exigence est affichée dans la description et la consigne du poste. La fonction « Sur validation » sert à examiner la demande avant confirmation, notamment pour la conduite, la caisse ou la sécurité.

## Garde-fous

- Utiliser uniquement la base locale E2E et des données fictives.
- Ne montrer aucun mot de passe : la connexion est effectuée avant la capture.
- L’événement reste en brouillon jusqu’à la scène de publication.
- Toute la narration est régénérée en une seule prise continue avec la voix Kore, sans mélange d’extraits.


Révision du 15 octobre 2026 (batch 22-1) : revue du build 43c1aae7 ; onglets persistants et accès Partage, Réglages et Documents contrôlés. Vocabulaire actualisé. Narration complète régénérée en une seule prise continue avec la même voix, continuousPauseTags: false ; aucun mélange d’extraits.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des réglages hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `overview` : Voici comment préparer et partager un planning bénévole. Pour démarrer, vous pouvez choisir un modèle déjà prêt, avec ses postes et ses horaires, ou partir d’une page blanche. Ici, on va tout créer depuis le début.
- `basics` : Donnez-lui un nom clair, ajoutez une courte description, le lieu et les dates. L’événement reste en brouillon : rien n’est visible tant que vous n’avez pas terminé votre planning.
- `series` : Les postes et leurs créneaux peuvent être ajoutés un par un, manuellement. Quand les horaires se répètent, la création en série va plus vite : pour l’accueil, indiquez la plage horaire, la durée et le nombre de places, et les créneaux sont préparés automatiquement.
- `delivery` : Ajoutez ensuite manuellement un poste Livraison. Il faut avoir au moins dix-huit ans et posséder un permis B valide. Ces conditions sont visibles par les bénévoles, avec la consigne précisant que le véhicule est fourni.
- `cash` : Pour un poste sensible comme la Caisse, activez l’inscription sur validation. Chaque personne peut proposer son aide, mais l’organisateur accepte ou refuse la demande avant de la confirmer.
- `registration` : Vous pouvez aussi décider quand les inscriptions commenceront et quand elles se termineront, dans le fuseau horaire de votre organisation. Si vous ne programmez pas de date d’ouverture, elles seront disponibles dès la publication.
- `review` : L’écran de vérification résume maintenant les trois postes, les quatre créneaux et toutes les places. Vous pouvez encore revenir corriger un horaire, un effectif ou une consigne.
- `preview` : Avant de publier, ouvrez l’aperçu bénévole et simulez une vraie inscription. Choisissez un créneau, renseignez les coordonnées du bénévole et confirmez ses choix. Vous pouvez ainsi vérifier tout le parcours qu’il verra, sans créer de véritable inscription.
- `preview-result` : L’aperçu montre aussi le message affiché après l’inscription et l’email automatique qui serait envoyé, avec son objet, son contenu et son lien personnel. Rien n’est réellement enregistré ni expédié pendant ce test.
- `publish` : Quand tout est prêt, publiez le planning. La page d’inscription devient accessible, mais aucun message n’est envoyé automatiquement : vous gardez la main sur sa diffusion.
- `qr` : Pour une affiche, un comptoir ou les réseaux sociaux, ouvrez le QR code. Vous pouvez le télécharger en PNG ou en SVG, ou imprimer directement cette fiche prête à être scannée.
- `import` : Si c’est la première fois que vous utilisez l’application, l’import permet de constituer rapidement votre liste de membres depuis un CSV ou un fichier Excel. L’application analyse les colonnes, les étiquettes et les doublons, puis montre exactement ce qui sera créé avant confirmation.
- `invite` : Retournez ensuite dans les invitations de l’événement. Filtrez les membres par étiquette et sélectionnez les personnes concernées. Vous pouvez envoyer les invitations par lot, ou inviter une seule personne individuellement si vous le souhaitez, avec un petit mot personnalisé.
- `public` : Et voilà le résultat côté bénévoles : plusieurs postes bien expliqués, les contraintes importantes et les demandes soumises à validation. Le planning est prêt à circuler par lien, QR code ou invitation !
