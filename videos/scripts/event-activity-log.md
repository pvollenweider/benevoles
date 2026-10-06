# Comprendre ce qui a changé dans son événement

Révision rédactionnelle du 6 octobre 2026 : narration adressée aux organisateurs au vouvoiement, impératifs compris. Les citations destinées aux bénévoles conservent leur ton initial. Les anciennes preuves audio ne valident pas ce nouveau texte ; narration, sous-titres, synchronisation et MP4 final sont à recontrôler après régénération.

Vidéo autonome 48. Une narration continue Puck, souriante et posée. Sources fonctionnelles vérifiées : section Journal de l'événement du guide admin, Explorer, filtres, Rejouer, Récit et génération d'état initial. Aucun écran vide présenté comme une démonstration réussie.

## Parcours à filmer

1. Ouvrir le journal depuis un événement fictif dont l'historique est fourni. Lire type, horodatage, origine, action et changements. Distinguer l'auteur de la personne concernée ; montrer au moins une action bénévole, admin et système.
2. Filtrer réellement Type d'élément, Qui et Action, puis réinitialiser. Le filtre Qui est un type d'auteur, pas une recherche de prénom. Montrer les autres familles disponibles : invitations, pages, responsables de secteur et jalons.
3. Renseigner Depuis et Jusqu'à, montrer un résultat réduit et un résultat vide expliqué par la période, puis revenir à la liste. Prévoir assez d'entrées pour montrer Charger plus sans fabriquer le bouton.
4. Rejouer un créneau avec plusieurs étapes vérifiables : point de départ, capacité modifiée, autre modification. Lire les différences enregistrées avant/après : l'écran ne reconstitue pas un état complet du planning. Utiliser précédent, suivant, curseur et Changer d'élément. Vérifier en base que cette lecture ne modifie aucun créneau.
5. Montrer une véritable chaîne causale : une annulation faite par la route normale, une place libérée et une offre de liste d'attente effectivement produite. Vérifier `causedByLogId`, le nouvel état de l'inscription et l'email dans Mailpit. Ne pas fabriquer ce lien entre deux entrées indépendantes.
6. Sur un second événement possédant des éléments sans historique, générer réellement l'état initial. Lire la mention « Généré, pas une action réelle ». Vérifier les entités couvertes, puis refaire une requête autorisée de contrôle et vérifier l'absence de doublons. Ne pas faire croire que le bouton récupère des actions passées.
7. Montrer une modification de page ou de coordonnées sans afficher leur contenu dans les changements du journal. Expliquer les droits et le fait que des noms d'auteurs restent visibles.
8. Revenir aux inscriptions ou aux créneaux pour montrer la distinction entre consulter et agir. Aucun bouton Rejouer ne doit être décrit comme une restauration.

## Données et preuves nécessaires

- Deux événements locaux dédiés et des identités uniquement fictives.
- Historique couvrant une période significative ; les dates préparées pour la démonstration restent explicitement fictives.
- Plusieurs entrées sur les mêmes identifiants pour les reconstitutions, suffisamment d'entrées pour la pagination.
- Une chaîne causale créée par les vraies actions de l'application, pas par une simple proximité temporelle.
- Un témoin ancien sans journal pour l'état initial, indépendant de la chaîne causale.
- Preuves avant/après : états des entités, filtres renvoyés par l'API, pagination, invariance après Rejouer, absence de doublons après génération, email local réellement produit.

## État

Script et manifeste préparés le 5 octobre 2026, puis explication de Rejouer corrigée : il montre les différences enregistrées, pas un état complet reconstitué. Une nouvelle prise Puck et ses neuf transcriptions indépendantes passent. Le seed prépare deux événements isolés et trois inscriptions fictives. La préparation utilise les vraies routes : état initial du premier événement, 56 modifications de capacité, création/modification d'une page, désinscription bénévole et offre système avec lien causal et email effectivement reçu dans Mailpit. Les changements de page ne recopient pas son contenu. Rapport `preparation.json` ; second événement toujours sans journal jusqu'à son chapitre de démonstration.

Le recorder dédié a terminé ses neuf chapitres après correction des sélecteurs pour les filtres, le choix d'élément et la racine causale. Le MP4 est assemblé ; durées et narration source passent le validateur. Une reconnaissance indépendante de l'audio extrait du MP4 final passe également sur les neuf chapitres (0 à 3,9 % de différence, sans consigne ajoutée ni phrase déplacée signalée). La planche des 36 images a été inspectée : filtres, pagination, Rejouer, Récit, état initial, pages et retour au planning sont présents. Ces preuves ne valent pas une revue audiovisuelle intégrale.

Les actions préparées datent du jour courant ; le jeu couvrant deux semaines prévu dans le plan reste à compléter avant validation de couverture. Rien n'est publié.

Le contrôle local en lecture seule `verify-event-log-coverage.ts` confirme
64 entrées, une pagination réelle, la chaîne causale et les trois entrées
d'état initial. La période mesurée n'est que d'environ huit secondes : elle
ne satisfait donc pas le scénario d'historique sur deux semaines.
Le rapport `coverage-check.json` marque explicitement ce manque. Ce contrôle
ne constitue pas un garde-fou complet pour envoyer la vidéo à un service
externe et n'autorise aucun upload. Aucun horodatage n'a été réécrit.
