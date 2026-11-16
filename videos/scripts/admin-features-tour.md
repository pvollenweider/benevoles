# Organiser ses bénévoles, du premier paramètre au jour J

Révision du 14 octobre 2026 : narration entièrement régénérée en une seule prise continue avec la voix Kore, sans balises de pause ni réutilisation d’anciens extraits. Le vouvoiement est conservé partout pour les organisateurs, impératifs compris. Les citations destinées aux bénévoles conservent leur ton initial. La création d’une page est suivie de son enregistrement et de son déplacement avec « Monter la page ». Les badges sont décrits selon les champs réels « Poste » et « Bénévole (réimpression) ». Narration, sous-titres, synchronisation et MP4 final sont recontrôlés après régénération.

## Objectif

Présenter l’administration dans un ordre métier complet : identité de l’organisation, équipe et responsabilités, cycle de vie d’un événement, construction détaillée des créneaux, bénévoles, communication, terrain et traçabilité.

## Ton

Souriant, sympathique et concret. La narration ressemble à une visite faite par une personne expérimentée à une autre personne du monde associatif. Aucun ton commercial.

## Parcours

1. Identité publique, slug, sous-domaine, fuseau horaire et Charte des bénévoles.
2. Propriétaire, organisateur et responsable de secteur ; périmètre du lien personnel du responsable.
3. Cycle de vie, visibilité et ouverture programmée des inscriptions.
4. Apparence, lieu et coordonnées OpenStreetMap.
5. Duplication d’une édition précédente.
6. Créneaux depuis la liste, par copie, par dessin et redimensionnement, ou en série.
7. Champs détaillés d’un créneau et options d’inscription.
8. Inscriptions, demandes, actions et présences.
9. Membres et activité individuelle.
10. Questions personnalisées.
11. Pages publiques : titre et contenu, enregistrement, puis ordre avec les flèches Monter / Descendre.
12. Messages ciblés, modèles et variables.
13. Rappels automatiques.
14. Documents à imprimer, listes et badges : filtre Poste et sélection Bénévole (réimpression), sans filtre par créneau.
15. Journal d’activité et recherche globale.

Toutes les données montrées sont fictives et locales. Toute la narration utilise une seule nouvelle prise continue ; aucun ancien audio n’est repris.


Révision du 15 octobre 2026 (batch 22-1) : revue du build 43c1aae7 ; onglets persistants et accès Partage, Paramètres et Documents contrôlés. Vocabulaire actualisé. Narration complète régénérée en une seule prise continue avec la même voix, continuousPauseTags: false ; aucun mélange d’extraits.

La phrase d’adresse reste générale (« votre sous-domaine sur benevol point app ») pour éviter une lecture ambiguë des tirets. La dernière prise complète remplace intégralement la précédente.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des paramètres hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `intro` : Voici une visite complète de l’administration, dans l’ordre où vous l’utiliserez vraiment : préparer votre organisation, construire un événement, accueillir les bénévoles, communiquer, puis préparer le jour J.
- `organization` : Tout commence avec l’identité de l’organisation. L’adresse de votre espace détermine votre sous-domaine sur benevol point app. Vous choisissez aussi le nom affiché, le fuseau horaire et la Charte des bénévoles que chacun devra accepter.
- `team` : Côté équipe, le propriétaire administre l’organisation et ses accès. Les organisateurs préparent les événements, les membres et les communications. Les responsables de secteur reçoivent un lien personnel limité à leur poste, avec les noms et coordonnées des inscrits, sans accès au reste de l’administration.
- `lifecycle` : Un événement suit un cycle clair : brouillon pendant la préparation, publié quand la page est prête, puis archivé une fois terminé. Même publié, il peut rester non répertorié et accessible seulement par son lien. Les inscriptions peuvent être immédiates, fermées, ou programmées à une date précise.
- `appearance` : Dans ses paramètres, vous réglez le titre, les dates, les messages et une couleur d’en-tête accessible. Le lieu peut recevoir des coordonnées : les bénévoles obtiennent alors un lien OpenStreetMap dans la page, les emails et leur espace personnel.
- `duplicate` : Pour repartir d’une édition précédente, dupliquez l’événement et décalez toutes les dates. Vous choisissez ce qui est repris : les créneaux, les paramètres, les pages d’information et les responsables.
- `shift-methods` : Pour construire le planning, trois méthodes se complètent : ajouter un créneau depuis la liste, copier un créneau existant, ou dessiner directement sa plage sur la frise puis l’élargir. Pour des horaires répétitifs, la création en série prépare plusieurs créneaux d’un coup.
- `shift-fields` : Chaque créneau peut préciser le poste, le libellé, la date, les horaires et le nombre de places, mais aussi une description, un lieu de rendez-vous, une carte, un contact, une consigne, des notes internes et un âge minimum. La liste d’attente et l’inscription sur validation s’activent ici.
- `registrations` : La vue des inscriptions montre qui est inscrit, sur quel créneau et par quel moyen. Vous pouvez filtrer, ajouter quelqu’un manuellement, accepter une demande, renvoyer son lien, désigner un responsable, retirer une inscription et noter les présences.
- `members` : La liste des membres rassemble inscrits et personnes importées, avec coordonnées, étiquettes, notes, disponibilités, heures prévues et activité. La fiche d’une personne retrace ses invitations, inscriptions et présences d’un événement à l’autre.
- `questions` : Le formulaire peut poser quelques questions utiles : taille de t-shirt, régime alimentaire ou permis de conduire, sous forme de texte, de nombre, de choix unique ou de cases à cocher. Une question de suivi peut s’afficher seulement pour certaines réponses à une question précédente. Vous décidez si la réponse est obligatoire, en évitant les données sensibles inutiles.
- `pages` : Vous pouvez aussi créer des pages publiques pour l’accès, le parking, la foire aux questions ou le règlement. Donnez un titre et rédigez le contenu, puis enregistrez la page. Puis organisez leur ordre avec les flèches : ces pages apparaissent directement avec la page d’inscription.
- `messages` : Les messages ciblent tous les inscrits, un poste, un créneau, la liste d’attente ou les invités sans créneau. Les modèles réutilisables acceptent des variables comme le prénom, l’événement, les créneaux ou le lien personnel. Vous choisissez un envoi immédiat ou programmé et prévisualisez toujours le résultat avant l’envoi. La section Messages programmés permet de suivre les envois à venir.
- `reminders` : Les rappels automatiques peuvent partir deux jours avant, la veille et le jour même. L’organisation choisit lesquels activer, où arrivent les réponses, et si ses admins doivent être prévenus à chaque nouvelle inscription.
- `reports` : Pour le terrain, Documents à imprimer propose le planning complet, une vue par poste, une vue par bénévole, la feuille de présence et la liste avec téléphones réservée aux organisateurs. Les badges se génèrent en PDF, avec un filtre par poste et une sélection de bénévole pour la réimpression, prêts à imprimer et découper.
- `activity` : Enfin, le journal d’activité garde la chronologie : création et modification des créneaux, inscriptions, désinscriptions, invitations et actions des organisateurs. On sait ce qui s’est passé, qui l’a fait et quand. La recherche globale permet ensuite de tout retrouver rapidement.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.
