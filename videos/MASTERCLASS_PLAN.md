# Plan de la masterclass benevol.app

## Ambition

Créer une formation vidéo complète, consultable par thème depuis un carrousel, qui illustre **100 % des fonctionnalités destinées aux utilisateurs** et **100 % des sujets des guides publics** : `FEATURES.md`, `GUIDE_ADMIN.md` et `GUIDE_BENEVOLE.md`. `FONCTIONNALITES.md` sert de contrôle complémentaire pour ne laisser aucune fonction livrée hors champ.

Les documents techniques (`docs/architecture.md`, `docs/api.md`, déploiement, sauvegardes, configuration serveur) ne font pas partie de la formation des associations. Ils pourront alimenter plus tard un cursus séparé « Exploiter sa propre instance ».

## Format éditorial commun

- Une vidéo = un objectif concret et autonome, compréhensible sans avoir vu les autres.
- Durée cible : **4 à 8 minutes** ; jusqu’à 10 minutes pour un parcours complexe.
- Une courte introduction situe le cas d’usage, sans dire « comme vu dans la vidéo précédente ».
- Voix d’homme et de femme alternées, toujours chaleureuses, souriantes, patientes et naturelles.
- Une même vidéo garde strictement la même voix et la même interprétation du début à la fin.
- Manipulations lentes et lisibles : clic visible, champ affiché avant la saisie, saisie à vitesse humaine, résultat laissé à l’écran.
- La page concernée est entièrement chargée **avant** le début de sa narration.
- Un titre en surimpression sépare les chapitres d’une même vidéo.
- Sous-titres, transcript texte et chapitrage systématiques.
- Chaque vidéo indique ce qui est réellement envoyé ou enregistré, et ce qui n’est qu’un aperçu.
- Les données sont fictives (`example.org`) et la pile vidéo reste isolée sur ses ports dédiés.

### Contrat de couverture d’une fonctionnalité

Une fonctionnalité n’est considérée comme couverte que si la vidéo montre et explique les quatre
éléments suivants. La voir brièvement dans un menu ou la citer dans la narration ne suffit pas.

1. **Pourquoi** — le problème concret qu’elle résout et les situations où elle est utile.
2. **Comment** — le chemin pour la trouver, les champs ou choix importants et l’action complète,
   à une vitesse qui permet de la reproduire.
3. **Résultat** — l’état enregistré, le retour de l’interface et, lorsque c’est pertinent, ce que
   voit ou reçoit le bénévole, le responsable ou un autre administrateur.
4. **Limites et conséquences** — ce qui n’est pas automatique, les permissions nécessaires, les
   notifications déclenchées, les données exposées et la manière d’annuler ou corriger l’action.

Chaque script de vidéo doit donc contenir quatre rubriques explicites : `Utilité`, `Démonstration`,
`Résultat visible` et `Points d’attention`. Chaque fonction citée dans la matrice de couverture doit
pointer vers un passage horodaté où ces quatre aspects sont traités.

### Structure narrative obligatoire

- **Situation de départ** : un besoin associatif crédible, visible dans les données de démonstration.
- **Utilité** : pourquoi l’écran ou l’action évite un problème réel.
- **Démonstration guidée** : navigation, saisie, validation et éventuelle confirmation.
- **Résultat organisateur** : changement visible dans l’administration.
- **Résultat destinataire** : page publique, page personnelle, email, notification, export ou vue
  responsable, selon la fonction.
- **Correction ou retour arrière** : comment modifier, annuler, désactiver ou retrouver l’action.
- **Conclusion autonome** : ce qui est désormais prêt, sans référence à une autre vidéo.

## Organisation du carrousel

Le site présente neuf thèmes. Chaque carte affiche la durée, le niveau, le public visé et les notions couvertes. Les vidéos peuvent être vues dans n’importe quel ordre ; un parcours conseillé relie néanmoins les cartes.

## Identité technique des vidéos

Chaque module possède un identifiant fonctionnel stable en majuscules, sans numéro ni langue,
par exemple `ORG_FIRST_STEPS`, `EVENT_CREATE` ou `VOLUNTEER_REGISTER`. Le numéro éditorial,
le titre français, le slug du manifeste, la catégorie et la place dans le carrousel peuvent
évoluer sans changer cet identifiant. `videos/catalog.json` est le catalogue central utilisé par
les scripts et les futures références depuis la documentation. Les variantes linguistiques
partageront le même identifiant.

---

## Thème 1 — Découvrir et prendre en main l’administration

### 01. Visite guidée de l’administration

**Identifiant :** `ADMIN_NAVIGATION`.

**Public :** toute personne qui organise. **Durée :** 5 min.

- navigation principale sur ordinateur et mobile ;
- menu du compte, aide et déconnexion ;
- événements, membres, paramètres et recherche ;
- raccourci clavier `Ctrl+K` / `Cmd+K` et lien « Aller au contenu » ;
- différence entre tableau de bord de l’organisation et page de pilotage d’un événement.

**Jeu de données :** organisation avec trois événements (brouillon, publié, terminé), 40 membres et plusieurs alertes.

### 02. Première connexion et sécurité du compte

**Public :** propriétaire et organisateur. **Durée :** 5 min.

- accepter une invitation administrateur et créer son compte ;
- règles de mot de passe ;
- connexion, mot de passe oublié et réinitialisation ;
- changer son mot de passe depuis « Mon compte » ;
- autres sessions déconnectées ;
- blocage temporaire après trop d’essais, expliqué sans le déclencher réellement.

**Jeu de données :** une invitation admin non utilisée et un compte actif.

### 03. Les premiers pas d’une nouvelle organisation

**Identifiant :** `ORG_FIRST_STEPS`.

**Public :** propriétaire. **Durée :** 6 min.

- checklist automatique ;
- nom, page publique et charte ;
- fuseau horaire ;
- premier événement, créneaux, publication et inscription de test ;
- étapes facultatives et possibilité de masquer la checklist.

**Jeu de données :** organisation neuve, sans événement.

### 04. Lire le tableau de bord et traiter les priorités

**Public :** équipe organisatrice. **Durée :** 7 min.

- demandes à valider ;
- créneaux incomplets et urgence à moins de deux jours ;
- offres de liste d’attente proches de l’expiration ;
- jalons en retard ;
- invités sans créneau ;
- postes sans responsable ;
- journées trop chargées ;
- événements à archiver ;
- chiffres clés et taux de remplissage.

**Jeu de données :** événement imminent contenant au moins un exemple de chaque alerte.

### 05. Tout retrouver avec la recherche globale

**Identifiant :** `GLOBAL_SEARCH`.

**Public :** équipe organisatrice. **Durée :** 4 min.

- ouvrir et fermer la recherche au clavier ;
- chercher bénévoles, inscriptions, événements et créneaux ;
- recherche multi-mots, insensible aux accents et à la casse ;
- comprendre la limite des vingt premiers résultats ;
- arriver directement sur la bonne vue filtrée.

**Jeu de données :** noms accentués, homonymes, événements et postes aux noms proches.

---

## Thème 2 — Configurer l’organisation et son équipe

### 06. Identité publique, adresse et titre de l’organisation

**Identifiant :** `ORG_PUBLIC_IDENTITY`.

**Public :** propriétaire. **Durée :** 5 min.

- nom interne et titre public ;
- identifiant public et adresse `organisation.benevol.app` ;
- conséquences d’un changement d’identifiant ;
- vue publique de l’organisation et liste des événements visibles.

**Jeu de données :** organisation avec deux événements répertoriés et un événement non répertorié.

### 07. Fuseau horaire, charte et réglages communs

**Identifiant :** `ORG_TIMEZONE_CHARTER`.

**Public :** propriétaire. **Durée :** 6 min.

- choisir le fuseau horaire ;
- effet sur horaires, rappels, délais et changements d’heure ;
- écrire et prévisualiser la Convention des Bénévoles ;
- parcours d’acceptation côté bénévole.

**Jeu de données :** créneaux autour du passage heure d’été/hiver et charte réaliste.

### 08. Propriétaires, organisateurs et permissions

**Identifiant :** `ORG_TEAM_PERMISSIONS`.

**Public :** propriétaire. **Durée :** 6 min.

- inviter un membre de l’équipe admin ;
- propriétaire versus organisateur ;
- modifier un rôle, désactiver un accès ;
- ce que chaque rôle peut voir et modifier ;
- pourquoi la suppression définitive et les réglages sensibles sont réservés au propriétaire.

**Jeu de données :** deux propriétaires, deux organisateurs, une invitation en attente.

### 09. Régler les emails de l’organisation

**Identifiant :** `ORG_EMAIL_SETTINGS`.

**Public :** propriétaire. **Durée :** 6 min.

- rappels automatiques J-2, J-1 et jour J ;
- prévenir les administrateurs à chaque inscription ;
- adresse de réponse ;
- envoyer un email de test ;
- réglage global et désactivation possible par événement.

**Jeu de données :** boîte Mailpit vidéo avec emails de test et rappels fictifs.

---

## Thème 3 — Créer et faire vivre un événement

### 10. Créer un événement depuis une page blanche

**Identifiant :** `EVENT_CREATE_BLANK`.

**Public :** organisateur. **Durée :** 8 min.

- assistant en trois étapes ;
- titre, dates, description et lieu ;
- coordonnées GPS ou lien OpenStreetMap/Google Maps ;
- instructions publiques, téléphone obligatoire, confirmation et couleur ;
- brouillon automatique, quitter puis reprendre l’assistant.

**Jeu de données :** fête associative sur deux jours avec adresse et coordonnées GPS.

### 11. Démarrer avec un modèle

**Identifiant :** `EVENT_CREATE_TEMPLATE`.

**Public :** organisateur. **Durée :** 6 min.

- comparer page blanche et modèles ;
- festival, buvette, sport, fête de village, montage/exploitation/démontage ;
- aperçu de ce qui sera créé ;
- adapter les postes, horaires et capacités ;
- rappeler que rien n’est publié automatiquement.

**Jeu de données :** une copie de chacun des modèles, supprimée après comparaison.

### 12. Vérifier, prévisualiser et publier

**Identifiant :** `EVENT_REVIEW_PUBLISH`.

**Public :** organisateur. **Durée :** 7 min.

- écran de vérification ;
- éléments obligatoires et recommandations facultatives ;
- impossibilité de publier sans créneau ;
- aperçu complet du parcours bénévole et des messages automatiques ;
- publication sans envoi automatique.

**Jeu de données :** événement presque prêt avec une recommandation manquante.

### 13. Visibilité et période d’inscription

**Identifiant :** `EVENT_VISIBILITY_REGISTRATION_WINDOW`.

**Public :** organisateur. **Durée :** 6 min.

- brouillon, publié répertorié, publié non répertorié, archivé ;
- inscriptions ouvertes, fermées ou programmées ;
- page publique avant l’ouverture et après la fermeture ;
- événement partagé uniquement par lien ou QR code ;
- barre d’étapes du cycle de vie.

**Jeu de données :** quatre événements illustrant chaque état et plusieurs fenêtres d’inscription.

### 14. Dupliquer l’événement de l’année précédente

**Identifiant :** `EVENT_DUPLICATE`.

**Public :** organisateur. **Durée :** 6 min.

- nouveau titre et premier jour ;
- décalage de toutes les dates ;
- copier créneaux, réglages, pages et responsables ;
- emails envoyés aux responsables recopiés ;
- éléments jamais copiés : inscriptions et jalons ;
- copie créée en brouillon.

**Jeu de données :** festival de l’année précédente, pages, programme et responsables complets.

### 15. Programme, pages d’information et QR code

**Identifiant :** `EVENT_PROGRAM_PAGES_QR`.

**Public :** organisateur. **Durée :** 7 min.

- programme des spectacles, y compris une fin après minuit ;
- repères visuels dans le planning ;
- pages Accès, FAQ et Règlement en Markdown ;
- ordre, modification, suppression et rendu public ;
- QR code PNG, SVG et fiche imprimable.

**Jeu de données :** festival avec trois spectacles et trois pages publiques.

### 16. Jalons et pilotage de la préparation

**Identifiant :** `EVENT_MILESTONES`.

**Public :** organisateur. **Durée :** 5 min.

- créer, dater, terminer et rouvrir un jalon ;
- jalon en retard ;
- apparition sur la page de l’événement et le tableau de bord ;
- exemples utiles avant, pendant et après l’événement.

**Jeu de données :** huit jalons, dont un en retard, deux terminés et plusieurs à venir.

### 17. Archiver puis supprimer définitivement

**Identifiant :** `EVENT_ARCHIVE_DELETE`.

**Public :** propriétaire. **Durée :** 6 min.

- différence entre fermer les inscriptions et archiver ;
- ce qui reste consultable après archivage ;
- export préalable ;
- suppression définitive, récapitulatif et confirmation renforcée ;
- restrictions de rôle.

**Jeu de données :** ancien événement complet créé uniquement pour être archivé et supprimé.

---

## Thème 4 — Construire un planning précis

### 18. Comprendre postes, créneaux et vues du planning

**Identifiant :** `SHIFTS_ROLES_VIEWS`.

**Public :** organisateur. **Durée :** 6 min.

- poste versus créneau ;
- vues Timeline et Liste ;
- couleurs et ordre des postes ;
- plusieurs jours et même poste avec horaires différents ;
- navigation clavier et boutons Monter/Descendre.

**Jeu de données :** six postes sur trois jours et quinze créneaux.

### 19. Ajouter et modifier un créneau dans le détail

**Identifiant :** `SHIFT_CREATE_EDIT_DETAIL`.

**Public :** organisateur. **Durée :** 8 min.

- poste, libellé, date, début, fin et capacité ;
- couleur, statut et ouverture ;
- lieu de rendez-vous, carte, consigne et contact opérationnel ;
- modification et annulation ;
- notification des bénévoles lors d’un changement d’horaire ou d’une annulation.

**Jeu de données :** créneau déjà inscrit afin de montrer l’avertissement et l’email de modification.

### 20. Créer une série de créneaux

**Identifiant :** `SHIFT_CREATE_SERIES`.

**Public :** organisateur. **Durée :** 6 min.

- plage horaire, durée, capacité et aperçu ;
- séries sur une journée et répétitions ;
- ajuster un seul créneau après création ;
- prévenir les erreurs de découpage.

**Jeu de données :** buvette de 10 h à 22 h par tranches de deux heures.

### 21. Créer, copier et redimensionner depuis la Timeline

**Identifiant :** `SHIFT_TIMELINE_QUICK_ACTIONS`.

**Public :** organisateur. **Durée :** 6 min.

- dessiner un créneau ;
- l’agrandir ou le raccourcir ;
- copier un créneau ;
- ouvrir l’éditeur détaillé ;
- limites et confirmations des modifications rapides.

**Jeu de données :** planning partiellement rempli laissant des espaces visibles.

### 22. Horaires de nuit et changements d’heure

**Identifiant :** `SHIFT_NIGHT_DST`.

**Public :** organisateur. **Durée :** 6 min.

- créneau finissant le lendemain ;
- affichage `24 h–26 h` versus `0 h–2 h` selon le contexte ;
- durée réelle au passage heure d’été/hiver ;
- impact sur emails, calendriers et heures planifiées.

**Jeu de données :** trois créneaux : nuit ordinaire, passage au printemps et passage à l’automne.

### 23. Capacités, listes d’attente et offre de place

**Identifiant :** `SHIFT_WAITLIST_OFFER`.

**Public :** organisateur. **Durée :** 8 min.

- activer la liste d’attente ;
- ordre et position ;
- libération d’une place ;
- offre valable 24 heures ;
- accepter, refuser ou laisser expirer ;
- passage à la personne suivante ;
- affichage côté admin et côté bénévole.

**Jeu de données :** créneau complet avec trois personnes en attente et une offre proche de l’expiration.

### 24. Postes sur validation

**Public :** organisateur et bénévole. **Durée :** 7 min.

- configurer un poste sensible ;
- demande qui réserve la place ;
- lire les informations du candidat ;
- accepter ou refuser avec message facultatif ;
- emails et statut sur la page personnelle ;
- retirer sa demande.

**Jeu de données :** conduite, caisse et sécurité avec demandes aux profils différents.

### 25. Règles d’accès : âge, quotas et postes réservés

**Public :** organisateur. **Durée :** 8 min.

- âge minimum et date de naissance ;
- maximum de créneaux par personne pour un poste ;
- poste réservé par étiquette de membre ;
- inscription via invitation comme preuve ;
- messages de refus clairs côté bénévole ;
- téléphone obligatoire au niveau de l’événement.

**Jeu de données :** mineur, adulte, membre avec le bon tag et membre sans le tag.

---

## Thème 5 — Le parcours complet du bénévole

### 26. Trouver et lire la page d’inscription

**Public :** bénévole. **Durée :** 5 min.

- accès par lien, QR code ou invitation ;
- en-tête, instructions, description, lieu et carte ;
- pages complémentaires ;
- planning sur téléphone et ordinateur ;
- défilement horizontal sur mobile ;
- légende des états et programme des spectacles.

**Jeu de données :** événement public riche, avec tous les états visuels de créneau.

### 27. Choisir un ou plusieurs créneaux

**Public :** bénévole. **Durée :** 7 min.

- sélectionner et retirer ;
- places restantes ;
- créneau complet avec ou sans liste d’attente ;
- poste réservé et sur validation ;
- maximum par poste ;
- chevauchement empêché ;
- créneaux déjà possédés reconnus.

**Jeu de données :** bénévole invité et déjà inscrit à un créneau.

### 28. Remplir le formulaire et comprendre le récapitulatif

**Public :** bénévole. **Durée :** 8 min.

- identité, email, téléphone, commentaire et date de naissance ;
- questions obligatoires et facultatives ;
- convention et consentement ;
- ordre des créneaux, pauses, nuit et données transmises ;
- infos pratiques, carte et contact masqué avant inscription ;
- avertissements de journée chargée et d’enchaînement.

**Jeu de données :** sélection de trois créneaux, dont un le lendemain et un soumis à âge minimum.

### 29. Confirmation, erreurs et inscription robuste

**Public :** bénévole. **Durée :** 6 min.

- page de succès et email de confirmation ;
- lien personnel non affiché, sauf inscription via invitation ;
- champ invalide, place prise entre-temps et chevauchement ;
- perte de connexion et bouton Réessayer ;
- absence de double inscription ;
- email introuvable et courrier indésirable.

**Jeu de données :** scénarios contrôlés d’erreurs de validation, conflit de capacité et reprise réseau.

### 30. Gérer ses inscriptions depuis le lien personnel

**Public :** bénévole. **Durée :** 8 min.

- créneaux, infos pratiques, carte et contact ;
- annuler une inscription ;
- quitter une liste d’attente, refuser une offre, retirer une demande ;
- dernier créneau annulé ;
- retour à l’événement pour s’inscrire ailleurs.

**Jeu de données :** une confirmation, une attente, une offre et une demande pour la même personne.

### 31. Ajouter son planning au calendrier

**Public :** bénévole. **Durée :** 5 min.

- télécharger un créneau ou tout le planning au format ICS ;
- ouvrir dans Apple, Google ou Outlook ;
- informations incluses ;
- absence de synchronisation automatique ;
- retélécharger après modification sans créer de doublon dans la plupart des calendriers.

**Jeu de données :** trois créneaux confirmés, dont un de nuit et un avec carte.

### 32. Retrouver son lien, sa session et ses disponibilités

**Public :** bénévole. **Durée :** 7 min.

- session reconnue sur la page de l’événement ;
- quitter une session sur appareil partagé ;
- renvoyer le lien depuis la page personnelle ;
- récupérer un lien invalide ou perdu par email ;
- réponse identique pour protéger la vie privée ;
- limitation des renvois ;
- matin, après-midi, soir et note de disponibilité.

**Jeu de données :** lien valide, lien annulé et adresse sans inscription.

### 33. Activer les notifications sur téléphone

**Public :** bénévole. **Durée :** 5 min.

- bouton depuis la confirmation ou la page personnelle ;
- permission du navigateur ;
- J-2, J-1, jour J et message urgent ;
- email toujours envoyé ;
- retirer l’autorisation ;
- navigateurs ou installations sans push.

**Jeu de données :** navigateur avec push activé et second profil sans support.

---

## Thème 6 — Membres, invitations et responsabilités

### 34. Construire et entretenir la liste des membres

**Public :** organisateur. **Durée :** 7 min.

- créer et modifier une fiche ;
- email, téléphone, tags, notes et disponibilités ;
- membre sans email ;
- recherche avec accents ;
- désactiver puis retrouver un membre ;
- activité événement par événement, sans score.

**Jeu de données :** 60 membres, homonymes, tags et historiques variés.

### 35. Importer des membres depuis CSV ou Excel

**Public :** organisateur. **Durée :** 8 min.

- préparer le fichier ;
- reconnaître les colonnes ;
- tags et disponibilités ;
- aperçu avant import ;
- créations, mises à jour, doublons et erreurs ;
- sécurité contre les formules dans les cellules exportées/importées ;
- corriger puis relancer.

**Jeu de données :** fichier de 40 lignes contenant nouveaux membres, mises à jour, accents, doublons et erreurs volontaires.

### 36. Inviter des membres à un événement

**Public :** organisateur. **Durée :** 7 min.

- sélectionner, filtrer par tag et inviter individuellement ou par lot ;
- message d’accompagnement ;
- lien personnel prérempli ;
- inscriptions à des postes réservés ;
- invitations envoyées, utilisées et sans réponse.

**Jeu de données :** tags accueil, permis B, caisse et sécurité ; invitations dans chaque état.

### 37. Relancer les invités sans créneau

**Public :** organisateur. **Durée :** 5 min.

- identifier les invitations anciennes ;
- distinguer absence de réponse, liste d’attente et créneau confirmé ;
- relance groupée ou message ciblé ;
- lien d’invitation conservé ;
- tableau de bord après la relance.

**Jeu de données :** invitations de moins et de plus de trois jours, avec différents résultats.

### 38. Responsables de secteur

**Public :** organisateur et responsable. **Durée :** 7 min.

- expliquer l'utilité : une personne référente suit l'équipe d'un poste sans recevoir un accès à toute l'administration ;
- nommer un responsable manuellement ou depuis une inscription, puis montrer le résultat côté organisateur ;
- distinguer le responsable du contact opérationnel indiqué aux bénévoles : la nomination ne rend pas automatiquement ses coordonnées publiques ;
- montrer l'email de nomination et ouvrir réellement son lien personnel, sans compte ni mot de passe ;
- parcourir sa vue avec une équipe déjà inscrite : créneaux, noms, coordonnées, commentaires et liste d'attente ;
- montrer la consultation sur téléphone et expliquer comment retrouver et contacter les personnes de son équipe ;
- expliquer les limites : vue du poste concerné, en lecture seule, sans modification du planning ni gestion des inscriptions ;
- illustrer la notification d'une nouvelle inscription au poste ;
- rappeler que le lien donne accès à des coordonnées personnelles et ne doit pas être partagé publiquement ;
- retirer un responsable et vérifier que son ancien lien ne donne plus accès à l'équipe.

**Jeu de données :** responsables Accueil et Buvette, plus un poste sans responsable ; plusieurs créneaux et bénévoles avec coordonnées fictives, commentaires et liste d'attente. Une nomination et une nouvelle inscription doivent produire de vrais emails dans la boîte de démonstration.

**Format :** vidéo autonome, avec explication du besoin, manipulation, résultat côté organisateur puis côté responsable. Ne pas annoncer un bouton de renvoi du lien sans vérifier qu'il existe dans la version filmée.

---

## Thème 7 — Suivre les inscriptions et communiquer

### 39. Lire, filtrer et gérer les inscriptions

**Public :** organisateur. **Durée :** 8 min.

- colonnes, statuts, source et réponses ;
- filtre poste, créneau, demandes et recherche ;
- ajout manuel ;
- sélectionner une ou plusieurs lignes ;
- renvoyer un lien, désigner un responsable, retirer avec délai d’annulation ;
- conflits et avertissements de charge.

**Jeu de données :** au moins 80 inscriptions couvrant tous les statuts et toutes les sources.

### 40. Voir précisément où il manque du monde

**Public :** organisateur. **Durée :** 6 min.

- taux global ;
- postes sans personne ;
- créneaux à compléter triés par besoin ;
- listes d’attente ;
- demandes qui gardent une place ;
- créneaux complets et postes sans responsable ;
- liens directs pour agir.

**Jeu de données :** planning volontairement déséquilibré.

### 41. Écrire un message ciblé

**Public :** organisateur. **Durée :** 8 min.

- tous les inscrits, poste, créneau, liste d’attente, invités sans créneau ;
- compteur de destinataires ;
- modèles et variables `{prénom}`, `{événement}`, `{poste}`, `{créneau}` ;
- erreurs de variables ;
- aperçu individualisé ;
- email plus notification ;
- double confirmation ;
- historique et résultat de l’envoi.

**Jeu de données :** audiences non vides pour chaque ciblage et abonnements push partiels.

### 42. Rappels et notifications de changement

**Public :** organisateur. **Durée :** 7 min.

- rappel manuel ponctuel ;
- message libre joint au récapitulatif ;
- rappels automatiques J-2, J-1 et jour J ;
- horaires locaux ;
- événement qui coupe ses rappels ;
- modification d’horaire et annulation envoyées aux inscrits ;
- ce qui ne part pas aux demandes non confirmées.

**Jeu de données :** créneaux à plusieurs échéances et boîte Mailpit montrant chaque type d’email.

### 43. Suivre les emails et traiter un échec

**Public :** propriétaire et organisateur. **Durée :** 6 min.

- en attente, tentative, envoyé et échec ;
- raison de l’échec sans exposer de secret ;
- renvoyer après correction ;
- distinguer emails automatiques et campagnes conservées ;
- durée de conservation de l’historique visible.

**Jeu de données :** emails réussis, différés et rejetés avec adresse fictive erronée.

---

## Thème 8 — Préparer et vivre le jour J

### 44. Générer les rapports utiles

**Public :** organisateur. **Durée :** 8 min.

- export complet en couleur ;
- planning par jour, par poste et par bénévole ;
- feuille de présence ;
- réponses aux questions ;
- liste avec téléphones réservée aux organisateurs ;
- imprimer ou enregistrer en PDF ;
- confidentialité des documents terrain.

**Jeu de données :** événement de 80 bénévoles avec questions et téléphones.

### 45. Créer et imprimer les badges

**Public :** organisateur. **Durée :** 6 min.

- tous les postes ou un poste ;
- tous les bénévoles ou réimpression individuelle ;
- couleur du poste, de l’événement ou noir et blanc ;
- nom et créneaux facultatifs ;
- dix badges par feuille et découpe.

**Jeu de données :** noms courts et longs, bénévoles multi-postes et plusieurs couleurs.

### 46. Faire l’émargement et corriger une présence

**Public :** équipe du jour J. **Durée :** 6 min.

- filtrer par créneau ;
- marquer une ou plusieurs personnes présentes ;
- annuler une présence ;
- différence entre heures planifiées et heures attestées ;
- cas d’un créneau annulé après émargement ;
- export après l’événement.

**Jeu de données :** arrivées progressives, absent, retard et créneau annulé après présence.

### 47. Réagir aux changements de dernière minute

**Public :** organisateur. **Durée :** 7 min.

- déplacer ou annuler un créneau ;
- prévenir les personnes concernées ;
- trouver un remplaçant via disponibilités et messages ciblés ;
- liste d’attente et offre de place ;
- vérifier le nouvel état de couverture ;
- journaliser ce qui s’est passé.

**Jeu de données :** désistement, créneau sous-effectif et bénévoles disponibles.

---

## Thème 9 — Traçabilité, données et administration avancée

### 48. Comprendre le journal d’un événement

**Public :** organisateur. **Durée :** 7 min.

- filtres, auteur, date et type d’objet ;
- inscriptions, désinscriptions et modifications ;
- mode Rejouer ;
- mode Récit et chaîne causale d’une liste d’attente ;
- différence entre état importé et action réelle.

**Jeu de données :** historique dense sur deux semaines, avec modification, annulation et promotion.

### 49. Journal d’activité de l’organisation

**Public :** propriétaire. **Durée :** 6 min.

- actions transversales hors d’un événement ;
- qui a modifié les réglages ou l’équipe ;
- filtres et export ;
- utilité en travail collaboratif.

**Jeu de données :** plusieurs admins ayant réalisé des actions distinctes.

### 50. Exporter et conserver ses données

**Public :** propriétaire. **Durée :** 7 min.

- export des membres ;
- export du journal ;
- archive JSON complète d’un événement ;
- contenu et usages de chaque export ;
- sécurité CSV ;
- suppression et conservation ;
- données qui appartiennent à l’organisation.

**Jeu de données :** organisation complète contenant accents, numéros commençant par `+` et valeurs ressemblant à des formules.

### 51. Confidentialité et sécurité vues par l’utilisateur

**Public :** propriétaire et bénévole. **Durée :** 6 min.

- séparation entre organisations ;
- liens personnels à ne pas partager ;
- preuve par email avant affichage d’un lien ;
- récupération qui ne révèle pas si une personne est inscrite ;
- pages légales ;
- données visibles par organisateur, responsable et bénévole ;
- bonnes pratiques sur les exports imprimés.

**Jeu de données :** deux organisations isolées et comptes aux noms similaires.

### 52. Accessibilité : utiliser benevol.app autrement

**Public :** tous. **Durée :** 7 min.

- parcours clavier ;
- focus visible et lien d’évitement ;
- zoom, mobile et contraste élevé ;
- annonces de lecteur d’écran ;
- planning et sélection de créneau au clavier ;
- déclaration publique, tests réalisés et limites connues ;
- signaler un problème.

**Jeu de données :** événement court conçu pour une démonstration VoiceOver/NVDA et contraste élevé.

### 53. Administrer la plateforme (cursus interne)

**Public :** super-administrateur uniquement. **Durée :** 8 min.

- créer, modifier et désactiver une organisation ;
- premier propriétaire ;
- état de santé du service ;
- nouveautés produit ;
- limites strictes du rôle super-admin ;
- ne jamais utiliser de données réelles dans une démonstration publique.

**Jeu de données :** trois organisations fictives, dont une inactive.

---

## Jeux de données vidéo

Plutôt qu’un seed gigantesque, utiliser des **scénarios composables**. Chaque scénario repart d’une base jetable propre et déclare ses invariants.

| Scénario | But | Volume indicatif |
|---|---|---:|
| `fresh-organization` | onboarding, identité, charte, équipe | 0 événement |
| `village-festival` | parcours général, planning, pages et programme | 24 membres, 12 créneaux |
| `large-festival` | filtres, recherche, rapports, badges | 120 membres, 35 créneaux, 90 inscriptions |
| `staffing-alerts` | toutes les alertes du dashboard | 6 événements, 12 alertes |
| `waitlist-lab` | attente, offre, expiration, refus | 4 créneaux, 12 personnes |
| `approval-lab` | demandes à accepter/refuser | 3 postes sensibles, 8 demandes |
| `eligibility-lab` | âge, quotas, tags réservés | 12 profils contrastés |
| `night-and-dst` | nuit et changements d’heure | 6 créneaux ciblés |
| `communications-lab` | audiences, push, rappels, échecs | 30 destinataires, tous statuts email |
| `event-history` | rejouer et récit | 40 entrées causales |
| `privacy-lab` | isolation et récupération de liens | 2 organisations |
| `day-of-event` | présence et changements urgents | 80 inscriptions |

Chaque seed doit être :

- idempotent ;
- daté relativement au jour de la prise ;
- sans données personnelles réelles ;
- capable d’indiquer dans sa sortie les URLs et identités de démonstration ;
- contrôlé par des assertions avant l’enregistrement (nombre de demandes, listes d’attente, alertes, etc.).

## Matrice de couverture documentaire

| Source documentaire | Vidéos |
|---|---|
| GUIDE_ADMIN — connexion, compte, mot de passe | 02 |
| GUIDE_ADMIN — premiers pas | 03 |
| GUIDE_ADMIN — tableau de bord | 04 |
| GUIDE_ADMIN — recherche | 05 |
| GUIDE_ADMIN — organisation, équipe, emails, fuseau, charte | 06–09 |
| GUIDE_ADMIN — création, modèles, publication, cycle de vie | 10–14, 17 |
| GUIDE_ADMIN — programme, pages, QR code, jalons | 15–16 |
| GUIDE_ADMIN — créneaux et postes | 18–25 |
| GUIDE_ADMIN — inscriptions et manque de bénévoles | 39–40 |
| GUIDE_ADMIN — membres, invitations, responsables | 34–38 |
| GUIDE_ADMIN — communications et rappels | 41–43 |
| GUIDE_ADMIN — rapports, badges et présences | 44–46 |
| GUIDE_ADMIN — journaux, exports et conservation | 48–50 |
| GUIDE_BENEVOLE — trouver et lire le planning | 26 |
| GUIDE_BENEVOLE — choisir ses créneaux | 27 |
| GUIDE_BENEVOLE — formulaire et infos pratiques | 28 |
| GUIDE_BENEVOLE — confirmation et erreurs | 29 |
| GUIDE_BENEVOLE — page personnelle et annulations | 30 |
| GUIDE_BENEVOLE — calendrier | 31 |
| GUIDE_BENEVOLE — session, lien et disponibilités | 32 |
| GUIDE_BENEVOLE — notifications push | 33 |
| FEATURES — préparation du planning | 10–25 |
| FEATURES — inscription | 23–30 |
| FEATURES — information des bénévoles | 31–33, 41–43 |
| FEATURES — suivi quotidien | 04–05, 34–40, 48–49 |
| FEATURES — jour J | 44–47 |
| FEATURES — identité de l’association | 06–09, 15 |
| FEATURES — fiabilité, données et accessibilité | 43, 48–52 |
| FONCTIONNALITES — super administration | 53 |

Cette matrice doit devenir un contrôle automatisé simple : chaque titre de section des guides porte un identifiant stable et doit être référencé par au moins une fiche vidéo.

## Ordre de production recommandé

## État de production

| Vidéo | État | Scénario de données | Vérification |
|---|---|---|---|
| 01 — Visite guidée de l’administration | Prévisualisation générée | `demo` | À visionner et valider avant publication |
| 03 — Les premiers pas d’une nouvelle organisation | Prévisualisation générée | `fresh-organization` | À visionner et valider avant publication |
| 05 — Tout retrouver avec la recherche globale | Prévisualisation générée | `demo` | Synchronisation automatique validée ; visionnage final en attente |
| 06 — Identité publique, adresse et titre | Prévisualisation générée | `demo` | Synchronisation automatique validée ; visionnage final en attente |
| 07 — Fuseau horaire et convention | Prévisualisation régénérée | `demo` | Recalage sémantique effectué ; synchronisation automatique validée ; visionnage final en attente |
| 08 — Propriétaires, organisateurs et permissions | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 09 — Régler les emails de l’organisation | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; Mailpit vérifié ; visionnage final en attente |
| 10 — Créer depuis une page blanche | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 11 — Démarrer avec un modèle | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; 10 créneaux vérifiés ; visionnage final en attente |
| 12 — Vérifier, prévisualiser et publier | Prévisualisation à corriger | `demo` | Audit indépendant du 5 octobre : paroles déplacées entre accueil/vérifications et aperçu/publication ; vérifier aussi les mots manquants. Durées correctes mais synchronisation éditoriale non validée |
| 13 — Visibilité et période d’inscription | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 14 — Dupliquer l’événement précédent | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 15 — Programme, pages et QR code | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 16 — Jalons et pilotage | Prévisualisation générée | `demo` | Contrôle technique et planche complète validés ; visionnage final en attente |
| 17 — Archiver puis supprimer | Prévisualisation générée | `demo` | Copie jetable réellement archivée et supprimée ; contrôle technique et planche complète validés |
| 18 — Postes, créneaux et vues | Prévisualisation générée | `demo` | Timeline, Liste, déplacement et palette réellement manipulés ; contrôle technique et planche validés |
| 19 — Ajouter et modifier un créneau | Prévisualisation générée | `demo` | Création complète, options, GPS, contact et réouverture réellement manipulés ; contrôle technique et planche validés |
| 20 — Créer une série de créneaux | Prévisualisation générée | `demo` | Série 10 h–22 h réellement créée, aperçu et modification isolée contrôlés ; planche validée |
| 21 — Actions rapides de la Timeline | Prévisualisation générée | `demo` | Dessin, redimensionnement, duplication et retour à l’éditeur réellement exécutés ; planche validée |
| 22 — Horaires de nuit et changements d’heure | Prévisualisation générée | `demo` | Trois nuits dédiées créées, Europe/Zurich et affichages 22 h–2 h / 1 h–5 h vérifiés ; planche validée |
| 23 — Capacités, listes d’attente et offre de place | Prévisualisation générée | `demo` | Trois positions, désinscription réelle, offre de 24 h et vues bénévole/admin vérifiées ; contrôle technique et planche validés |
| 24 — Postes soumis à validation | Prévisualisation générée | `demo` | Critères, demande, message de refus, acceptation réelle et résultat bénévole/admin vérifiés ; contrôle technique et planche validés |
| 25 — Âge, quotas et postes réservés | Prévisualisation générée | `demo` | Âge 18+, limite atteinte, poste réservé anonyme et accès par invitation autorisée vérifiés ; contrôle technique et planche validés |
| 26 — Trouver et lire la page d’inscription | Prévisualisation générée | `demo` | Lien, QR, pages, carte, programme, états, défilement mobile et invitation autorisée réellement montrés ; 9 scènes synchronisées et planche validée |
| 27 — Choisir un ou plusieurs créneaux | Prévisualisation générée | `demo` | Ajouts/retraits, capacités, attente, validation, réservé, chevauchement, session existante et quota montrés ; 9 scènes synchronisées et planche contrôlée |
| 28 — Formulaire et récapitulatif | Prévisualisation générée | `demo` | Coordonnées, naissance, questions, convention, consentement, nuit, pauses, carte, charge et correction réellement montrés ; 8 scènes synchronisées et planche contrôlée |
| 29 — Confirmation et erreurs | Prévisualisation générée, couverture à compléter | `demo` | Validation, capacité devenue insuffisante, coupure/reprise, succès sans lien public et email contrôlés ; 8 scènes synchronisées. Restent la preuve visuelle de non-duplication après réponse perdue, le conflit serveur d’horaire et la comparaison du succès via invitation |
| 38 — Responsables de secteur | Prévisualisation générée, contrôle final en cours | `demo` | Deux nominations, email avec ouverture du lien, équipe remplie, mobile, notification réelle de Nora et révocation ; dix paragraphes contrôlés indépendamment après correction de deux frontières audio |
| 02, 04, 30–37, 39–53 | Planifiées | À créer selon le tableau « Jeux de données vidéo » | Non commencées |

Une vidéo ne passe à « terminée » qu’après validation du contrat de couverture, visionnage complet
et vérification de sa synchronisation. La génération d’un MP4 ne suffit pas.

### Contrôle obligatoire avant livraison

L’agent qui produit une vidéo effectue lui-même ces vérifications avant de la présenter :

1. lancer le contrôle technique (`video:validate`) : une seule prise vocale, scènes complètes,
   ordre correct, absence de chevauchement et durées cohérentes ;
2. générer une planche de contrôle couvrant toute la vidéo et examiner chaque transition ;
3. visionner le MP4 complet avec le son, sans se limiter au scénario ou à la timeline ;
4. vérifier pour chaque phrase d’action que l’écran correspondant est déjà chargé et visible ;
5. vérifier que le clic, la saisie, l’ouverture, la fermeture et le résultat arrivent au moment où
   ils sont annoncés, pas dans le chapitre suivant ;
6. vérifier qu’aucune ancienne page ne reste affichée pendant que la voix aborde un nouveau sujet ;
7. contrôler les blancs, les transitions et les titres de chapitre ;
8. recommencer la capture ou le découpage avant livraison si un seul de ces contrôles échoue.

Le statut « synchronisation automatique validée » ne vaut donc plus validation éditoriale. Une
vidéo ne peut être annoncée comme prête qu’après la passe visuelle et sonore réalisée par l’agent.

**Contrôle des frontières vocales ajouté le 5 octobre 2026 :** transcrire indépendamment chaque
extrait généré avec `videos/tools/audit-narration.ts`. Comparer les paroles réellement reconnues
au paragraphe prévu ; une phrase du chapitre voisin ou une fin manquante impose un nouveau
découpage de la prise continue, puis une nouvelle capture avec les durées corrigées. Le test
de durée seul ne détecte pas ce défaut. Les timestamps proposés par un modèle sont des pistes,
jamais une validation : ils doivent être dans la durée réelle du fichier et être confirmés par
la transcription de chaque extrait. Ce contrôle est également à appliquer aux prévisualisations
déjà générées avant leur validation finale. Il ne remplace pas la vérification phrase/action.

### Lot 1 — Fondations et parcours les plus demandés

Vidéos 03, 10, 12, 18, 19, 26, 27, 28, 30, 39, 41 et 44.

Objectif : constituer rapidement un premier carrousel cohérent, du paramétrage au jour J.

### Lot 2 — Cas métier différenciants

Vidéos 13 à 17, 20 à 25, 34 à 38, 40, 42, 45 à 48.

Objectif : traiter les fonctions qui remplacent réellement les tableurs et les échanges manuels.

### Lot 3 — Complétude et autonomie

Vidéos 01, 02, 04 à 09, 29, 31 à 33, 43 et 49 à 52.

Objectif : atteindre la couverture documentaire complète et répondre aux cas d’assistance.

### Lot 4 — Interne

Vidéo 53 et, ultérieurement, un cursus technique distinct pour l’auto-hébergement.

## Critères de validation de chaque vidéo

- [ ] La fiche cite les sections documentaires couvertes.
- [ ] Chaque fonctionnalité explique son utilité et le cas concret auquel elle répond.
- [ ] Chaque fonctionnalité est réalisée entièrement, du point d’entrée à la validation.
- [ ] Le résultat est montré dans l’administration et du côté destinataire lorsqu’il existe.
- [ ] Les limites, permissions, notifications et possibilités de correction sont expliquées.
- [ ] Le scénario montre chaque action annoncée par la voix.
- [ ] La page est visible avant que sa narration commence.
- [ ] Les saisies sont lisibles et les clics visibles.
- [ ] Aucun texte ne décrit une fonction absente de l’écran.
- [ ] Le jeu de données fait apparaître tous les états nécessaires.
- [ ] Aucun email, push ou suppression n’est réellement envoyé hors de la pile vidéo.
- [ ] Voix uniforme, souriante et bienveillante.
- [ ] Sous-titres relus et transcript fourni.
- [ ] Contrôle du début, du milieu et de la fin de chaque chapitre.
- [ ] Visionnage complet avant publication.
- [ ] La date/version du produit montrée dans la vidéo est consignée.
- [ ] La documentation et la vidéo ne se contredisent pas.

Une vidéo échoue à la validation si une fonctionnalité est seulement nommée, survolée, ou montrée
sans résultat. La matrice documentaire ne passe à « couvert » qu’après visionnage de la version
assemblée, jamais sur la seule base du transcript.

## Maintien dans le temps

- Ajouter au registre de chaque vidéo : version du produit, date de capture, pages et fonctions couvertes, seed utilisé et hash du transcript.
- Lorsqu’une fonctionnalité visible change, le même changement doit signaler les vidéos concernées.
- Une vérification périodique compare les titres des guides, `FEATURES.md` et `FONCTIONNALITES.md` à la matrice de couverture.
- Une vidéo obsolète reste masquée du carrousel jusqu’à sa nouvelle capture ; ne jamais laisser une procédure fausse en ligne.
- Les scripts, manifestes, sous-titres et seeds sont versionnés. Les MP4 restent des artefacts générés.
