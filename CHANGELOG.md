# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

<!-- Source de la page publique /nouveautes : versions publiées seulement, sections publiques
     seulement, et une puce terminée par le commentaire HTML « interne » en est écartée.
     Convention dans CONTRIBUTING.md, section « Le CHANGELOG et la page Nouveautés ». -->

---

## [Unreleased]

### Ajouté

- **Accueil : bien démarrer en un clic** (#764) : la page d'accueil de benevol.app propose, dès le premier écran et à côté de « Demander un espace », un lien « Guide : créer son premier événement » vers le parcours pas à pas, et un bloc « Bien démarrer » avec les fiches essentielles dans l'ordre (créer son premier événement, configurer les créneaux, ouvrir les inscriptions, partager le lien, suivre les inscriptions), puis le guide bénévole et toute la documentation.
- **« Créer son premier événement », un parcours en une page** (#758) : la nouvelle fiche `/doc/creer-son-premier-evenement` mène un nouvel organisateur, en huit étapes courtes, de la demande d'espace au lien d'inscription partagé (créer l'événement, poser les postes et les créneaux, ouvrir les inscriptions, publier, faire une inscription de test, partager le lien, suivre les inscriptions), avec la vidéo « Préparer, publier et partager un planning bénévole » ; chaque étape renvoie à la fiche qui la détaille. Elle ouvre le thème « Démarrer » et le guide administrateur, et `/doc` ainsi que la page Fonctionnalités y renvoient.
- **Page « Nouveautés »** (#757) : `/nouveautes` dit ce qui a changé dans benevol.app, version par version, la plus récente en premier, chacune avec sa date et ce qu'elle apporte, en clair, sans passer par GitHub. Elle est rendue directement depuis ce journal des versions : les versions publiées seulement, sans les sections techniques (mise à jour d'une installation, outils de développement). Liens depuis le pied de page, la documentation et la page Fonctionnalités.
- **Page « Fonctionnalités » repensée pour décider vite** : `/fonctionnalites` ne déroule plus une longue liste, elle répond en quelques minutes à « est-ce fait pour nous ? ». La promesse et deux boutons (« Demander un espace », un email déjà rédigé, et « Voir comment ça marche »), une image du produit et la vidéo de présentation à ouvrir sur place ; un sommaire « Sur cette page » ; trois étapes ; puis chaque besoin (préparer le planning, inscrire les bénévoles, garder chacun informé, voir où il manque du monde, tenir le jour J, après l'événement, vos membres et leurs données) avec ses avantages, une image tirée du tutoriel vidéo, la vidéo elle-même et les fiches de documentation qui en disent plus. Suivent ce qui fait la confiance (gratuit, open source, hébergé en France, aucun cookie de pistage, cadre écrit pour les données, accessibilité), un encadré pour le bénévole arrivé là par erreur, « Démarrer » avec le même bouton, et ce que benevol.app ne fait pas, volontairement. Texte en 16 px et lignes plus courtes. `FEATURES.md` reste la seule source de la page.
- **Page introuvable digne de ce nom** : une adresse inconnue n'affiche plus la page 404 anglaise par défaut, mais « Cette page est tombée à l'eau. », un événement annulé pour cause de pluie (avec une pluie qui s'arrête quand le système demande de réduire les animations), en clair ou en sombre selon le système, et les liens utiles : accueil, fonctionnalités, documentation, guides bénévole et organisateurs, tutoriels vidéo et espace organisateur. Sur l'adresse d'une organisation, le lien principal ramène à ses événements. Un événement inconnu ou non publié répond désormais par cette page (et un vrai code 404) au lieu de « Événement introuvable. ».
- **Bibliothèque de tutoriels vidéo publique et référencée** : `/videos` et chaque vidéo publiée (`/videos/<ID>`) sont désormais indexables par les moteurs de recherche, avec une adresse canonique, des données structurées `VideoObject` (titre, résumé, miniature, durée réelle, date, fichier vidéo, transcription complète) et un fil d'Ariane, et un sitemap vidéo dédié (`/video-sitemap.xml`, cité dans `robots.txt`). Un lien partagé (WhatsApp, X, LinkedIn, Facebook...) s'affiche avec l'image de la vidéo, son titre et sa description ; la galerie a sa propre image d'aperçu. Les vidéos « À venir » restent hors index. Lien « Tutoriels vidéo » dans le pied de page, sur `/doc` et sur `/fonctionnalites`.
- **Affiche des vidéos** : le lecteur (bibliothèque et fiches de documentation) montre une image de la vidéo avant la lecture, extraite du rendu publié.
- **Filtre de la documentation, des réponses plus directes** : quand une fiche est trouvée par une de ses questions (et non par son titre ou son résumé), la ou les questions concernées (deux au plus) s'affichent sous le résultat, chacune avec un lien qui ouvre directement la réponse dans la fiche. Sans aucun résultat, le filtre propose les « Questions fréquentes » du guide (des deux guides depuis `/doc`) et, pour les organisateurs, la fiche « Aide et retours ».
- **Deux nouveaux tutoriels vidéo** : « Poser les bonnes questions à ses bénévoles » (questions du formulaire, réponses, synthèse et évolution du formulaire sans perdre les réponses) et « Repérer les doublons et fusionner sans perdre le fil » (doublons possibles, aperçu, choix des valeurs et fusion). Les fiches « Questions aux bénévoles » et « Doublons et fusion de fiches » les proposent. Deux autres sont annoncés « À venir » : les heures de bénévolat avec l'attestation, et les rappels par notification sur téléphone.
- **Aperçus de liens et référencement du site** (#746, #747) : chaque page publique de benevol.app (fonctionnalités, documentation, chaque fiche, pages légales) a sa propre image d'aperçu (titre de la page, sa rubrique et benevol.app), affichée en grand quand le lien est collé dans WhatsApp, X, Facebook, LinkedIn, Slack, iMessage, Signal ou Telegram, avec son titre et sa description. La page publique d'une organisation a désormais aussi un aperçu (titre, « {organisation} cherche des bénévoles… », image de la plateforme). Les moteurs de recherche reçoivent des données structurées (site, éditeur, application gratuite et open source, fil d'Ariane, fiche de documentation comme article technique) et un index des sitemaps, `/sitemap-index.xml`, qui regroupe celui de www.benevol.app et celui de chaque organisation active. `robots.txt` autorise explicitement les principaux moteurs de recherche et assistants IA sur les pages publiques (l'administration et les liens personnels restent exclus), et `/llms.txt` (avec `/llms-full.txt`, le texte complet) résume le site pour les assistants IA, généré à partir des mêmes sources que les pages.
- **Accord de sous-traitance et liste des sous-traitants publiés** : deux nouvelles pages légales, `/legal/sous-traitance` (accord art. 28 RGPD et art. 9 nLPD, avec la description du traitement et les mesures de sécurité en annexe) et `/legal/sous-traitants` (hébergement, envoi des emails, copie de sauvegarde hors site, suivi des erreurs et notifications du navigateur, avec pour chacun les données concernées, la localisation et les garanties). La politique de confidentialité et les CGU y renvoient.

### Modifié

- **Titres des pages publiques** : « Titre | benevol.app » au lieu de « Titre — benevol.app ». La politique de confidentialité et les CGU sont maintenant dans le sitemap, avec leur adresse canonique et leur aperçu.
- **Acceptation de la convention des bénévoles obligatoire** : une inscription publique sans la case « J'ai lu et j'accepte la convention des bénévoles » est refusée, avec un message qui invite à cocher la case ou à recharger la page ; chaque inscription publique garde la preuve de l'acceptation.
- **Fiches communes aux organisateurs et aux bénévoles** : liste d'attente, inscriptions sur validation, âge minimum et rappels s'ouvrent sur une courte introduction, puis « Côté bénévole » et enfin « Côté organisation », dans l'ordre des liens en haut de la fiche. Les liens et anciennes adresses vers ces sections fonctionnent comme avant.
- **Changer de créneau, expliqué** : la fiche « Ma page personnelle » a désormais une section « Changer de créneau » qui explique comment faire en deux temps (s'inscrire au nouveau créneau, puis annuler l'ancien, ou l'inverse si les deux se chevauchent) ; la question fréquente du guide bénévole y mène.
- **Créer un événement** : la fiche décrit le chemin dans l'interface (**Événements → Nouvel événement**, **Modifier** sur la page de l'événement) au lieu d'adresses internes de l'application.
- **Tutoriels vidéo refilmés** : se repérer dans l'administration, recherche globale, créer un événement depuis une page blanche, importer et gérer les membres, inviter des membres à un événement et relancer les invités sans créneau, repérer les doublons et fusionner, poser des questions aux bénévoles, exporter ses données et garder une copie (qui expliquent désormais les colonnes des derniers envois et de la dernière acceptation de la Convention), créer une série de créneaux, règles d'éligibilité, créneaux de nuit et changement d'heure, actions rapides de la Frise (vocabulaire « Frise » à l'écran et dans la narration), et pointage des présences, qui montre désormais aussi la page Jour J. Leurs réponses « utile ? » repartent de zéro. Le tutoriel sur le suivi de livraison des emails est maintenant en ligne.
- **Vidéos lues dans la documentation** : dans une fiche de documentation, « Voir la vidéo : titre (durée) » ouvre le lecteur sur place au lieu de quitter la documentation pour la bibliothèque. La vidéo ne se charge qu'à l'ouverture et démarre dès ce clic ; les sous-titres, la transcription et la question « utile ? » sont sous le lecteur, avec un lien pour l'ouvrir dans la bibliothèque. Sans JavaScript, le lien vers la bibliothèque reste.
- **Menu de la documentation par public** : sur grand écran, le menu latéral d'une fiche range ses thèmes sous trois titres visibles, « Bénévoles », « Organisateurs » puis « Commun » (thèmes qui concernent les deux), dans le même ordre sur toutes les pages ; seule l'ouverture du thème de la fiche en cours change.
- **Liste « Toutes les fiches » plus lisible** : sur `/doc` et les guides, le titre de chaque fiche est sur sa propre ligne, son résumé en dessous en plus petit.
- **Lecture de la documentation** : titres plus grands et mieux hiérarchisés (titre de page en 30 px), paragraphes et listes limités à 70 caractères de large, interligne qui suit la taille du texte ; la page se lit sans défilement horizontal à 320 px, même avec un espacement du texte agrandi.
- **Chemins dans l'interface plutôt qu'adresses internes** : les fiches des organisateurs indiquent où trouver chaque page avec les libellés de l'application (par exemple **Événements**, puis l'événement, puis **Gérer les créneaux**) au lieu d'adresses `/admin/…`.

### Corrigé

- **Lien « premiers pas » de la page Fonctionnalités** : les boutons « Lire les premiers pas » de `/fonctionnalites` menaient à une page introuvable (`/guide/premiers-pas.md`) ; ils ouvrent maintenant la fiche `/doc/premiers-pas`, comme les liens du texte.
- **Bibliothèque vidéo plus légère** : `/videos` ne transmet plus au navigateur la narration complète et les notes de production de chaque vidéo, seulement ce que les cartes, les filtres et la recherche utilisent ; la page est environ dix fois moins lourde à charger.
- **Ancienne adresse d'une vidéo** : `/videos/<nom-de-la-video>` redirige désormais de façon permanente vers `/videos/<IDENTIFIANT>`, pour que les moteurs de recherche ne gardent qu'une adresse par vidéo.
- **Adresses en `http://`** : un lien tapé ou copié sans `https` (par exemple `http://www.benevol.app/`) affichait la page d'erreur brute du serveur (« 404 page not found »). Toutes les adresses de benevol.app en `http://` redirigent maintenant vers `https://` (#759).
- **Organisation inconnue** : une adresse `nom.benevol.app` qui ne correspond à aucune organisation (faute de frappe, organisation supprimée) affichait une copie de la page d'accueil, indexable par les moteurs de recherche. Elle répond maintenant par la page introuvable, avec un vrai code 404 (#759).
- **Une seule adresse par page** : `https://benevol.app/…` (sans « www ») affichait les mêmes pages que `https://www.benevol.app/…`, en double pour les moteurs de recherche. Il redirige maintenant de façon permanente vers l'adresse www, chemin et paramètres compris (#759).
- **Adresse canonique en « localhost »** : `/doc`, `/accessibilite` et les pages légales annonçaient aux moteurs de recherche et aux aperçus de liens une adresse `http://localhost:3000/…` au lieu de `https://www.benevol.app/…`. Ces pages étaient générées lors de la construction de l'image, qui ne connaît pas l'adresse du site ; toutes les pages prennent maintenant l'adresse à la requête.
- **Bénévole sans adresse email** : annuler un créneau (ou toute autre action qui prévient les bénévoles par email) ne met plus en file un message pour une personne ajoutée à la main sans adresse. Le message ne pouvait jamais partir : il échouait six fois et déclenchait l'alerte de santé de la file d'envoi.
- **Dates du plan du site** : dans `sitemap.xml`, la date de dernière modification de chaque page de documentation et de contenu est celle de la dernière modification réelle de son texte, et non plus l'heure de construction de l'application, identique pour toutes les pages à chaque mise en ligne.
- **Filtre de la documentation** : le champ « Filtrer les fiches » occupe sa place dès l'affichage de la page, la liste ne descend plus quand il apparaît ; sans JavaScript, il ne laisse aucun espace vide.

## [2.1.0] — 2026-10-06

### En bref

- **Documentation refondue** : les deux longs guides (administrateur et bénévole) deviennent 49 fiches courtes, une par tâche, rangées par thème, avec recherche, questions fréquentes, menu de navigation, liens « Aide » depuis chaque écran d'administration et redirection des anciens liens. Détails sous « Modifié ».
- **Près de 3 heures de formation en vidéo** : 52 tutoriels narrés et sous-titrés (environ 2 h 40, de 1 à 7 minutes chacun) montrent l'application en démonstration et expliquent chaque tâche, pour les organisateurs, les bénévoles et l'opérateur. Ils sont réunis dans une bibliothèque `/videos`, organisée en parcours par thème et par niveau, et reliés aux fiches de documentation ; deux autres sont prévus. Détails sous « Ajouté ».
- **Membres et données personnelles** : effacement à la demande en gardant l'historique anonyme, doublons et fusion de fiches, adresses à vérifier, attestation de bénévolat et heures attestées.
- **Jour J et organisation** : page de suivi des présences sur téléphone, recherche de bénévoles pour les créneaux à compléter, alerte de désistement, logo de l'organisation, un seul rappel par jour.
- **Accessibilité** : clavier, focus et lecteurs d'écran revus sur la page Créneaux, les inscriptions, l'inscription publique et les fenêtres de l'administration.

### Mise à jour depuis 2.0.x

Mise à jour sans préparation particulière : toutes les migrations sont additives (nouvelles tables, nouvelles colonnes facultatives, aucune donnée existante réécrite) et passent comme d'habitude par le Job `k8s/job-migrate.yaml` avant la mise à jour de l'application.

- **Migrations** : `member_invite_declined`, `release_check`, `delivery_outcome`, `member_merge_tombstone`, `duplicate_dismissal`, `charter_acceptance`, `event_day_contact`, `organization_logo` (le logo est stocké en base, dans sa propre table), `member_erasure` (registre des effacements) et `video_feedback` (réponses anonymes « utile ? » aux vidéos).
- **Nouvelle dépendance** : `sharp`, qui traite les logos côté serveur (type réel, taille, métadonnées).
- **Vérification de nouvelle version** (#612) : nouveau CronJob `k8s/cronjob-release-check.yaml`, protégé par `CRON_SECRET` comme les autres. `RELEASE_CHECK=off` la désactive, sans aucune requête sortante.
- **Copie hors site** (#524, #697) : le CronJob `backup-offsite-dropbox` est remplacé par `backup-offsite`, qui copie vers Infomaniak Swiss Backup (remote rclone `swissbackup`, container dans le nouveau secret `OFFSITE_BUCKET`, obligatoire) ; supprimer l'ancien à la main si ce n'est pas déjà fait (`kubectl delete cronjob backup-offsite-dropbox -n benevoles`). Dropbox n'est plus un fournisseur possible : `OFFSITE_PROVIDER` disparaît, et la section `[dropbox]` peut être retirée de `rclone.conf` avant de recréer le secret `rclone-config`, une fois les anciennes copies supprimées. `scripts/restore-test-offsite.sh` (`make restore-test-offsite`) vérifie qu'une copie distante se télécharge et se déchiffre ; étapes dans `docs/deploiement.md` (« Copie hors site »).
- **`AUTH_SECRET` sert aussi de clé aux empreintes d'adresse** (résultats d'envoi, registre des effacements, #516) : avant de le changer, et avant toute restauration de sauvegarde, exporter le registre des effacements (`scripts/erasure-register.ts export`), puis le rejouer sur la base restaurée (`replay`) pour que les données des membres effacés ne reviennent pas. Procédure : `docs/rgpd/procedure-effacement.md`.
- **Bibliothèque vidéo** (#644) : `VIDEO_MEDIA_BASE_URL`, facultative, indique où sont servis les fichiers des vidéos ; sans elle, chaque vidéo affiche « Vidéo bientôt disponible ».

### Ajouté

- **« Cette vidéo vous a-t-elle été utile ? »** (#646) : sous chaque vidéo tutorielle, deux boutons **Oui** et **Non**, visibles pendant toute la lecture et pas seulement à la fin, sans commentaire à écrire. La réponse est anonyme : ni compte, ni cookie, ni adresse IP enregistrée. Les super admins voient les réponses par vidéo et par révision dans **Avis sur les vidéos** ; une vidéo entièrement régénérée repart de zéro.
- **Effacer les données personnelles d'un membre, même avec un historique** (#516) : depuis la page Activité d'un membre, un propriétaire ou un organisateur répond à une demande d'effacement sans passer par l'opérateur. La fiche devient « Bénévole effacé », vidée de ses données et de ce qui la concerne (invitations, réponses, emails, abonnements), tandis que ses inscriptions restent, sans identité, pour garder justes les effectifs et les heures. La confirmation récapitule ce qui est effacé, supprimé et conservé et demande de saisir « effacer » ; l'action est irréversible et limitée à l'organisation.
- **Page « Jour J » pour suivre les présences sur place** (#561) : pendant les dates d'un événement, **Ouvrir le jour J** affiche sur téléphone les créneaux en cours et ceux des 3 prochaines heures, avec pour chacun les présents sur les attendus, les places libres et le contact. Chaque personne a son téléphone en un toucher et un bouton **Marquer présent**, qui fait la même chose que dans les inscriptions ; recherche par nom ou par poste.
- **Chercher des bénévoles pour les créneaux à compléter** (#566) : depuis « Où manque-t-il du monde ? », **Chercher des bénévoles** liste les membres par ordre alphabétique, sans score, avec les raisons visibles (tags, disponibilités, déjà inscrit ou invité, chevauchement d'horaire). Vous cochez chaque personne vous-même, voyez un aperçu, puis chacune reçoit un seul email avec les créneaux qu'elle peut prendre et son lien pour s'inscrire.
- **« Avant ta mission », contact le jour J et responsable du poste** (#560) : en haut de sa page personnelle, le bénévole retrouve son prochain créneau confirmé, le lieu avec **Voir sur la carte**, qui contacter sur place, la consigne et **Écrire à l'organisation**. Le nouveau champ facultatif **Contact le jour J** de l'événement prend le relais pour les créneaux sans contact, et le nom du responsable de secteur du poste est indiqué ; ces informations ne sont montrées qu'aux bénévoles confirmés (page personnelle, rappels, planning individuel), jamais sur la page publique.
- **Logo de l'organisation** (#300) : un propriétaire envoie le logo (PNG ou JPEG, 2 Mo au plus) depuis les paramètres, avec un aperçu, puis peut le remplacer ou le retirer. Il apparaît à côté du nom de l'organisation sur sa page publique et celle des événements, les feuilles à imprimer, les badges, l'attestation de bénévolat et en haut des emails ; il est servi par benevol.app même, sans service tiers.
- **Les organisateurs sont prévenus d'un désistement** (#559) : quand un bénévole annule une place confirmée ou une demande, les administrateurs et les responsables du poste reçoivent un email (qui, quel créneau, combien de places manquent, si la liste d'attente a repris la place), avec le mot facultatif laissé par le bénévole. Réglage dans **Paramètres → Emails**, activé par défaut.
- **Un membre invité peut répondre qu'il n'est pas disponible** (#558) : depuis l'email d'invitation ou son lien personnel, après une confirmation, sans raison à donner. La liste des invitations montre ce troisième état et un filtre « Sans réponse », et les relances et messages aux invités sans créneau laissent ces personnes de côté en disant combien.
- **Adresses à vérifier et résultat de chaque envoi** (#598, #599) : chaque email est classé par destinataire (accepté par notre serveur d'envoi, rejet permanent, échec temporaire), sans conserver l'adresse en clair ni la réponse brute du serveur. Un membre dont l'adresse a reçu un rejet définitif pour un message important affiche « Adresse à vérifier », avec un filtre dans la liste des membres, un point du tableau de bord et un résumé quotidien par email (désactivable) ; changer l'adresse lève le statut.
- **Doublons possibles et fusion de fiches** (#600, #601) : les fiches qui se ressemblent (même nom, même téléphone, adresses proches, même date de naissance) sont suggérées sous **Doublons possibles**, avec les raisons en mots, jamais fusionnées automatiquement. Un propriétaire peut fusionner deux fiches confirmées comme la même personne, avec un aperçu complet et un choix champ par champ : inscriptions, invitations et réponses rejoignent la fiche conservée, et les liens personnels déplacés sont régénérés.
- **Supprimer définitivement un membre sans historique** (#667) : une fiche inactive qui n'a aucune inscription peut être supprimée, et non plus seulement désactivée, depuis la liste des membres ou sa page Activité. La confirmation nomme la personne et liste ce qui disparaît avec elle.
- **Attestation de bénévolat** (#556) : depuis l'activité d'un membre, un document imprimable pour une période choisie, avec le détail par événement et les heures attestées par les présences enregistrées. Les heures des créneaux confirmés sans présence enregistrée peuvent être ajoutées à part, sous leur propre intitulé ; texte libre et zone de signature.
- **Résumé d'un événement dans Rapports** (#557) : bénévoles distincts, dont les nouveaux et ceux de retour, présences enregistrées, heures planifiées et attestées, taux de remplissage global et par poste, et créneaux restés incomplets. Tant que l'événement n'est pas terminé, le résumé est signalé comme provisoire.
- **Heures attestées par bénévole** (#557) : la liste des membres gagne les colonnes triables « Heures attestées » et « Dernière participation », et un export CSV donne les heures planifiées et attestées de chaque membre pour une période (douze derniers mois par défaut).
- **Synthèse des réponses aux questions** (#686) : la page **Questions** d'un événement compte les réponses de chaque question (par choix, oui et non, ou textes courts regroupés), par exemple pour commander des t-shirts par taille. Les bénévoles confirmés et ceux en attente sont comptés à part, une fois chacun ; la synthèse se télécharge en CSV et s'imprime.
- **Partager le lien d'un événement, avec un aperçu** (#564) : une fois l'événement publié, **Copier le lien** et **Partager** apparaissent sur sa page d'administration et sa page de vérification. Collé dans une messagerie ou un réseau social, le lien montre le titre, la description et l'image de benevol.app ; un brouillon ou un événement archivé ne dévoile toujours rien.
- **Vérification avant publication plus complète** (#565) : sans bloquer la publication, l'étape signale aussi les créneaux sans lieu ni contact, l'état des inscriptions, les rappels automatiques et, une fois l'événement publié, la couverture des créneaux. Chaque point mène à l'endroit où le corriger.
- **Rappels automatiques, case par événement** : le formulaire d'un événement a une case **Rappels automatiques**, cochée par défaut. Décochée, aucun rappel ne part pour cet événement ; cochée, les réglages des emails de l'organisation s'appliquent.
- **Preuve d'acceptation de la convention des bénévoles** (#569) : chaque inscription faite depuis le formulaire public garde quelle version exacte de la convention a été acceptée et à quelle date, affichées dans la liste des inscriptions et incluses dans l'export CSV des membres. La case reste obligatoire et est désormais vérifiée aussi par le serveur.
- **Aide contextuelle et comment faire un retour** (#568) : sous le titre des principaux écrans d'administration, un lien « Aide : … » ouvre dans un nouvel onglet la page de documentation qui explique cet écran. La documentation indique comment signaler un problème ou proposer une amélioration (contact@benevol.app, GitHub en option).
- **Bibliothèque de tutoriels vidéo** (#644, #645) : une page non référencée, `/videos`, présente 54 tutoriels pour les organisateurs, les bénévoles et l'opérateur, dont 52 déjà filmés, avec filtres par thème, niveau et public, recherche, sous-titres et transcription. Chaque vidéo a sa fiche (ce qu'elle montre, les étapes, les points à retenir) ; celles qui n'ont pas encore de film affichent « Vidéo bientôt disponible ». Une page de documentation qui a son tutoriel l'annonce par un lien « Voir la vidéo : titre (durée) », affiché seulement quand le film est en ligne. Le contenu éditorial est sous licence CC BY-SA 4.0 (`videos/LICENSE`), hors nom et logo Benevol.
- **Alerte de nouvelle version pour les instances auto-hébergées** (#612) : une fois par jour, l'instance compare sa version à la dernière release publique sur GitHub et prévient les super admins par email et par une bannière masquable. La page **Santé du service** montre la dernière version connue ; désactivable avec `RELEASE_CHECK=off`.
- **Invalider les liens bénévoles après une fuite** (#542) : `scripts/regenerate-links.ts` régénère les liens personnels des inscriptions, responsables de secteur et invitations d'une organisation ou d'un événement, et peut renvoyer les nouveaux liens. Simulation par défaut, `--yes` pour appliquer ; voir `docs/rgpd/procedure-violation.md`.

### Modifié

- **Durées de conservation en langage clair** : la politique de confidentialité (`/legal/privacy`) et le tableau des durées de conservation listent les données sans numéro de ticket ni nom de champ technique.
- **Documentation en fiches courtes, une par tâche** (#649) : les longs guides administrateur et bénévole deviennent une cinquantaine de fiches publiées à `/doc/<fiche>`, rangées par thème : se connecter, créer un événement, configurer les créneaux, publier, suivre les inscriptions, présences le jour J, membres, emails, réglages de l'organisation pour les organisateurs ; trouver la page d'inscription, choisir ses créneaux, s'inscrire, sa page personnelle et son lien personnel pour les bénévoles, au tutoiement. La liste d'attente, les inscriptions sur validation, l'âge minimum et les rappels ont une fiche commune (« Côté organisation », « Côté bénévole »), avec des liens qui mènent directement à chaque partie. Les questions fréquentes sont reprises dans les fiches qu'elles concernent.
- **Trouver et parcourir la documentation** (#649) : `/doc`, `/doc/admin` et `/doc/benevole` listent toutes les fiches par thème, chaque guide dans son ordre (« Démarrer » d'abord pour les organisateurs, « S'inscrire à un créneau » pour les bénévoles), avec un champ **Filtrer les fiches** (titre, résumé et questions, sans tenir compte des accents) et en tête un bloc « Questions fréquentes » qui mène aux quatre réponses les plus demandées. Sur grand écran, un menu à gauche montre tous les thèmes ; sur téléphone, « Dans ce thème » liste les autres fiches ; « Précédent » et « Suivant » mènent à la fiche voisine du même thème. Le texte passe en 16 px, plus contrasté, avec des lignes d'environ 70 caractères. Les anciens liens vers une section des guides (`/doc/admin#…`, `/doc/benevole#…`) ouvrent la fiche qui la reprend.
- **Un seul rappel par bénévole, événement et jour** (#672) : au lieu d'un rappel J-2, J-1 et du jour par créneau, un bénévole reçoit un seul email par rappel, qui liste tous ses créneaux du jour dans l'ordre avec heure, poste, lieu, contact et consignes. L'encadré des rappels de la page d'un événement dit maintenant ce qui partira vraiment (selon la case de l'événement, les réglages de l'organisation et les créneaux à venir) et avec quels délais.
- **Case de consentement de l'inscription** (#706) : elle dit désormais « J'accepte que l'association qui organise cet événement utilise mes données pour gérer ses bénévoles, pour cet événement et les suivants. », car les coordonnées rejoignent la liste des membres de l'organisation. Un lien juste en dessous ouvre la politique de confidentialité dans un nouvel onglet.
- **Texte par défaut de la convention des bénévoles** (#569) : un désistement se signale « dès que possible » et non plus « au moins 48 heures à l'avance », puisque les bénévoles peuvent se désister à tout moment et que les organisateurs en sont prévenus. Une convention personnalisée n'est pas touchée.
- **Page personnelle et rappels plus lisibles** (#560) : les créneaux sont regroupés sous « Tous mes créneaux », un numéro de téléphone s'appelle d'un toucher (rappels compris) et le contact d'un créneau s'intitule « Contact pour ce créneau » partout où les bénévoles le lisent.
- **Copie de sauvegarde hors site en Suisse** (#524, #697) : la copie chiffrée de la base part chaque nuit vers Infomaniak Swiss Backup (Suisse) au lieu de Dropbox (États-Unis), qui n'est plus un fournisseur possible. La politique de confidentialité et la page d'accueil le disent. Étapes pour l'opérateur : voir « Mise à jour depuis 2.0.x ».
- **Un rejet permanent n'est plus réessayé** (#598) : quand le serveur destinataire refuse définitivement un email (boîte inexistante, adresse refusée), l'envoi s'arrête aussitôt au lieu de 6 essais sur environ 2 h 30. Un incident temporaire garde les mêmes tentatives.
- **« Heures planifiées » ne compte plus que les créneaux passés** (#557) : dans la liste des membres, les créneaux à venir et les créneaux annulés n'y entrent plus.
- **Page Rapports d'un événement réorganisée** : l'export complet, qui contient les téléphones et emails des bénévoles, est rangé dans « Pour les organisateurs seulement », et l'archive de l'événement passe en fin de page.
- **Heures d'ouverture et de fermeture des inscriptions** (#565) : la page publique et l'administration écrivent « le samedi 6 juin à 18h », comme ailleurs, et non plus « à 18 h 00 ».

### Corrigé

- **Image Docker allégée** : la compilation n'embarque plus tout le dépôt (sources, tests, déploiement, documentation interne) dans le serveur de production à cause de deux lectures de fichiers à chemin dynamique (plan du site, pages de contenu publiques) ; le serveur passe de 143 à 128 Mo. Les fichiers Markdown publiés restent copiés explicitement par le `Dockerfile`.
- **Bénévoles bloqués quand ils partagent une connexion** (#609) : la page personnelle, les annulations et les disponibilités avaient une limite commune à toutes les personnes d'une même connexion (club, famille, Wi-Fi du lieu), et retirer six créneaux d'un coup était refusé. Seuls les liens invalides comptent désormais par connexion ; un lien valable a sa propre limite, plus large.
- **Retirer un bénévole de son créneau envoie bien l'email annoncé** (#703) : la confirmation annonçait un email d'annulation qui ne partait jamais. Chaque personne retirée reçoit maintenant un seul email listant les créneaux annulés, et le récapitulatif compte les personnes et non plus les lignes.
- **Invitations et relances refusées par le serveur d'envoi** (#597) : elles étaient comptées comme envoyées. Elles comptent maintenant dans les échecs, et le résultat affiché le mentionne ; l'email de test signale aussi un échec.
- **Variables du message de confirmation d'un événement** : `{prénom}` (l'écriture des modèles de messages) s'affichait tel quel, et l'email de confirmation n'appliquait ni les variables ni la mise en forme. Les deux écritures sont acceptées partout, et `{date}` et `{heure}` reçoivent le premier créneau.
- **Annuler un créneau, depuis la page personnelle ou la page de l'événement** (#534, #584) : la fenêtre de confirmation garde le focus, se ferme avec Échap et dit ce qui est retiré. Le créneau n'est plus retiré avant la réponse du serveur : un échec est expliqué à côté du créneau, qui reste, et une annulation réussie est annoncée en mots, le focus allant sur le créneau suivant.
- **Créneaux déjà pris sur le planning public** (#583, #534) : ils s'affichaient et s'annonçaient comme des créneaux sélectionnés. Ils portent maintenant la mention « Ton créneau » (ou « Demande envoyée », « En liste d'attente », « Place proposée ») et un nom qui dit où on en est ; le contour de focus des barres n'est plus masqué et reste visible en contraste élevé.
- **Tutoiement sur toute l'inscription publique** (#534) : la page de l'événement, le récapitulatif et les messages d'erreur mélangeaient « vous » et « tu » ; ils tutoient partout, sans point médian, que les lecteurs d'écran lisaient tel quel.
- **Rappels push quand le site ne les propose pas** (#534) : le bouton s'affichait puis disparaissait sans rien dire. Il n'apparaît plus si le service n'est pas configuré, et un échec d'activation est annoncé.
- **Se déconnecter sur téléphone** : sur iPhone, toucher « Se déconnecter » dans le menu du compte refermait le menu sans déconnecter. La déconnexion fonctionne.
- **Adresses réservées** (#642) : le slug d'une organisation pouvait prendre un sous-domaine technique de benevol.app (`www`, `api`, `admin`…) ou une de ses variantes (pluriel, tirets, accents), qui ne mène jamais à sa page. Ces adresses sont refusées à la création comme au renommage, et une organisation créée sous un tel nom reçoit un suffixe.
- **Journal d'un événement** (#704) : les messages envoyés ou renvoyés, les questions et les demandes d'inscription acceptées ou refusées s'affichaient en codes bruts. Chaque action a son libellé en français, et le journal se filtre aussi par messages et par questions.
- **Contraste des emails** : le bas des emails, les petites mentions, la ligne « Tu ne peux pas participer cette fois ? », les créneaux barrés et l'échéance d'une place proposée étaient trop pâles ; ils atteignent maintenant 4,5:1 au moins.
- **Récapitulatif d'inscription** : un créneau qui passe minuit disait deux fois qu'il finit le lendemain ; il ne le dit plus qu'une fois.
- **Page Créneaux au clavier et au lecteur d'écran** (#554, #587, #606) : le formulaire de créneau signale chaque champ manquant sous le champ et rend le focus au bon endroit, le panneau « Gérer les postes » ne perd plus le focus, et les postes se réordonnent aussi au clavier (Monter, Descendre). Les actions sont nommées avec leur créneau, heures et places sont lues en mots, « Timeline » devient « Frise », et les contrastes, la couleur choisie et les longs noms de postes s'affichent correctement, aussi en contraste élevé.
- **Page des inscriptions et des responsables** (#574, #582) : sur un petit écran, la liste des créneaux ne dépasse plus et ne coupe plus rien, et un ajout manuel sans créneau dit l'erreur sous le champ. Les noms des boutons et des cases et les annonces n'ont plus de point médian, de dièse ni de tiret entre deux heures, que les lecteurs d'écran lisaient à voix haute, et chaque case nomme le créneau en plus de la personne.
- **Réordonner les pages d'un événement au clavier** (#605) : les flèches Monter et Descendre gardent le focus et annoncent la nouvelle position ; un échec d'enregistrement rétablit l'ordre et le dit.
- **Formulaire et journal d'un événement** (#616) : l'enregistrement automatique est indiqué en haut du formulaire et annoncé aux lecteurs d'écran, et un échec reste affiché avec un bouton **Réessayer**. Les champs des messages et d'un spectacle ont leur étiquette, et les dates et compteurs du journal sont lisibles.
- **Fenêtres de l'administration** (#585) : Tab ne sort plus de la fenêtre d'import des membres, et sur Safari le focus revient sur le bouton qui a ouvert une fenêtre quand on la ferme.
- **Menu Super Admin** (#590) : il se referme quand on touche ailleurs sur tablette ou quand le focus clavier le quitte, indique la page actuelle et respecte « Réduire les animations ».
- **Lien « Aller au contenu » sur les pages publiques et l'espace super admin** (#534) : la page d'un événement, les documents légaux et l'espace de l'opérateur commencent par ce lien, et leur en-tête, contenu principal et pied de page sont annoncés comme tels.
- **Focus clavier en contraste élevé** (#579) : avec un thème de contraste Windows, la plupart des champs, les listes déroulantes et l'interrupteur de la charte n'affichaient aucun repère au focus ; ils affichent maintenant un contour dans la couleur système.

### Sécurité

- **Dépendances à jour** : Next.js 16.3.8, Sentry 11.4, nodemailer 10.0.13, pg, resend, sharp, Vite et Vitest ; `source-map-js` 1.2.2 et `postcss-selector-parser` 7.1.6 forcés (déni de service par entrée malveillante, outils de compilation uniquement).
- **Adresse d'un bénévole dans le texte d'une erreur d'envoi** (#598) : la raison affichée pour un email en échec pouvait citer la réponse brute du serveur SMTP, qui contient parfois l'adresse, et était journalisée telle quelle. Les échecs sont décrits par une phrase normalisée, sans adresse ni réponse brute, y compris pour les lignes déjà en base.

---

## [2.0.2] — 2026-10-01

### Sécurité

- **Organisation choisie par l'en-tête de la requête** (#541) : sur le domaine principal, sans `?org=`, un en-tête `x-org-slug` envoyé par le navigateur était transmis tel quel aux pages et routes publiques, qui s'en servent pour choisir l'organisation. Il est désormais toujours supprimé avant que le proxy n'ajoute la sienne. Seules des données publiques étaient concernées.
- **Lecture d'une invitation de membre** (#541) : l'adresse qui pré-remplit le formulaire d'inscription à partir d'une invitation (nom, email, téléphone du membre) n'avait aucune limite de requêtes. Elle est limitée à 30 lectures par heure et par adresse IP, vérifiée avant toute lecture, et refuse une invitation qui n'appartient pas à l'organisation du site, avec la même réponse que pour un lien inconnu.
- **Formules dans les exports CSV** (#567) : un nom, un commentaire, une réponse ou un numéro saisi dans le formulaire public pouvait commencer par `=`, `+`, `-` ou `@` et s'exécuter comme une formule à l'ouverture de l'export dans Excel ou LibreOffice. Dans les exports des membres, du journal d'activité et des présences, ces valeurs sont précédées d'une apostrophe et s'affichent comme du texte ; les autres valeurs sont inchangées.

### Corrigé

- **Heures planifiées des membres** (#571) : la colonne « Heures cumulées » de la page Membres s'appelle « Heures planifiées », car elle additionne la durée prévue des créneaux confirmés, créneaux à venir et absences comprises, et non le temps passé. Un créneau pendant un changement d'heure y était compté une heure de trop ou de moins ; il compte maintenant sa durée réelle dans le fuseau de l'organisation.
- **Choisir un créneau au clavier sur la page des inscriptions** (#555) : dans le formulaire d'ajout manuel et dans le filtre par créneau, la liste des créneaux ne s'utilisait qu'à la souris. Elle s'ouvre et se parcourt maintenant au clavier (flèches, Début, Fin, première lettre du poste), Entrée choisit et Échap ferme sans rien changer ; chaque créneau a un nom complet pour les lecteurs d'écran (date, heures, poste, remplissage, déjà inscrit, conflit d'horaire), vérifié avec VoiceOver et Safari sur macOS ; NVDA, VoiceOver sur iOS, le zoom à 200 % et les petits écrans restent à vérifier (#574), et le filtre est nommé « Filtrer par créneau ». Le créneau choisi est coché, le créneau parcouru est entouré, et les mentions « Complet » et « ⚠ conflit » sont plus contrastées. Sur la même page : le tableau a un titre ; la barre d'actions sur la sélection est nommée et ses boutons ne perdent plus le focus pendant une action ; après « Annuler » ou un ajout manuel, le focus revient sur « + Ajouter manuellement » et l'ajout est annoncé.
- **Désinscription depuis la page d'un événement** : quand on fermait la confirmation de désinscription d'un créneau déjà pris, le focus clavier se perdait au lieu de revenir sur le bouton du créneau. Il y revient.

---

## [2.0.1] — 2026-10-01

### Sécurité

- **Emails sans serveur SMTP configuré** : en production, un envoi sans `SMTP_HOST` était compté comme réussi alors que rien ne partait, et le destinataire comme le contenu de l'email (liens personnels compris) étaient écrits dans les journaux du conteneur. L'envoi échoue désormais avec une raison sans donnée personnelle : la file d'envoi le retente puis alerte, et les envois directs le signalent à l'écran. En développement, les emails restent affichés dans la console. Les journaux d'un échec d'envoi ne contiennent plus l'adresse du destinataire.
- **Comptes d'une organisation supprimée** : le nettoyage nocturne effaçait une organisation désactivée depuis 30 jours sans effacer ses administrateurs actifs, qui restaient en base sans organisation (email et mot de passe haché conservés sans limite) et pouvaient encore se connecter, sans rien pouvoir administrer. Ils sont maintenant effacés avec l'organisation, comme lors d'une suppression par le super admin ; les comptes laissés sans organisation par un nettoyage précédent sont effacés au nettoyage suivant, et un compte d'organisation sans organisation ne peut plus se connecter.

### Modifié

- **Page d'accueil de benevol.app.** Elle dit ce que l'outil change pour une association : la page d'inscription sur téléphone, les trois étapes de la mise en place, trois captures (où il manque du monde, les messages, les feuilles du jour J), ce sur quoi compter (gratuit, open source, hébergé en France, sans pistage, accessible) et une foire aux questions. Pour les moteurs de recherche et les partages : titre et description réécrits, image de partage, données structurées (site, application, code source, questions fréquentes) et une icône propre au site à la place de l'icône par défaut.

### Documentation

- **Documentation relue contre le code.** API (routes manquantes, niveau propriétaire, limites de requêtes), architecture (couches, flux d'inscription, file d'envoi, observabilité), rôles et permissions (qui peut quoi), configuration (secrets Kubernetes, vérifications au démarrage), déploiement (ordre réel de `deploy.yml`, manifestes, seuils de la page Santé), rotation des journaux sur k3s, dossier RGPD et guide de contribution. Les durées de conservation des comptes administrateurs, dans le guide organisateur et la politique de confidentialité, décrivent ce que fait le nettoyage. La déclaration d'accessibilité liste exactement ce que les tests analysent et les limites connues de la page personnelle et du planning public.

---

## [2.0.0] — 2026-09-30

### Mise à jour depuis 1.x

Version majeure : une installation 1.x ne se met pas à jour sans préparation. `TOKEN_ENCRYPTION_KEY` est obligatoire en production (le serveur refuse de démarrer sans elle), les migrations passent par le Job `k8s/job-migrate.yaml` avant la mise à jour de l'application, et deux manifestes s'ajoutent (`k8s/ingressroute-tokens.yaml`, `k8s/traefik-config.yaml`). Pas de retour à 1.x sans restaurer une sauvegarde. Étapes complètes : [Mise à jour depuis 1.x](docs/deploiement.md#mise-à-jour-depuis-1x).

### Ajouté

#### Mise en route

- **Premiers pas** : une nouvelle organisation voit, en haut de la liste des événements et du tableau de bord, les étapes de mise en place dans l'ordre (page publique et charte, fuseau horaire, premier événement, créneaux, publication, inscription de test), avec un lien vers chacune. Les étapes se cochent d'elles-mêmes ; la liste disparaît une fois la mise en place faite, ou peut être masquée.
- **Ce qui demande votre attention** : le tableau de bord commence par les situations à traiter sur vos événements publiés (créneaux bientôt pas complets, places de liste d'attente qui expirent, jalons en retard, invitations non utilisées, postes sans responsable, événement qui commence, événement terminé à archiver), de la plus urgente à la moins urgente, avec un lien vers chacune.
- **Création en trois étapes** : informations, postes et créneaux, puis une page de vérification qui liste ce qui est prêt et ce qui manque, propose l'aperçu bénévole et publie (ou laisse en brouillon). L'assistant se quitte à tout moment, chaque étape restant une page normale de l'administration.
- **Modèles d'événement** : à la création d'un événement, cinq modèles (festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage) créent un brouillon déjà rempli de ses postes et créneaux à partir d'un titre et d'une date. Tout se modifie ensuite comme d'habitude.
- **Duplication avec choix** : **Dupliquer** ouvre une page où l'on choisit le titre de la copie, son premier jour (toutes les dates sont décalées d'autant) et ce qui suit : créneaux, messages et réglages d'inscription, pages personnalisées, responsables de secteur (décochés par défaut, chacun reçoit un email avec son lien). Un récapitulatif dit ce qui va être créé. Les inscriptions ne sont jamais copiées.

#### Suivre un événement

- **Alerte de charge** : plus de 8 h de créneaux dans une journée, ou plus de 6 h d'affilée sans pause d'au moins 30 minutes, sont signalés sans rien bloquer. Le bénévole le voit dans le récapitulatif avant de confirmer (créneaux déjà pris compris), l'organisateur sur la ligne de l'inscription, avant un ajout manuel et dans « Ce qui demande votre attention ». Heures réelles dans le fuseau de l'organisation, changement d'heure compris ; un créneau de nuit compte pour le jour où il commence ; la liste d'attente ne compte pas.
- **Où en est l'événement ?** : en haut de la page d'un événement, une barre d'étapes (Brouillon → Prêt à publier → Publié → Terminé → Archivé) dit ce qui manque encore et ce que l'étape signifie concrètement : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.
- **Où manque-t-il du monde ?** : chaque événement a une page qui s'ouvre sur une vue d'ensemble (places pourvues, barre de remplissage, phrase de synthèse), puis liste les postes sans personne, les créneaux à compléter du plus dégarni au plus proche du complet avec leur taux de remplissage, les personnes en liste d'attente, les postes sans responsable de secteur et les créneaux complets, chaque ligne menant là où on agit ; un message confirme quand il n'y a rien à faire. Sur la page de l'événement, le bloc « Créneaux à pourvoir » est remplacé par une phrase (« Il manque encore 12 personnes sur 20 places ») et le lien vers cette page.
- **Aperçu comme un bénévole** : depuis la page d'un événement, **Prévisualiser comme un bénévole** montre la page publique telle que la verront les bénévoles, même pour un brouillon. Le formulaire peut être rempli : l'aperçu affiche alors le message de confirmation et l'email que recevrait le bénévole, sans rien enregistrer ni envoyer.
- **Présences** : dans les inscriptions d'un événement, **Marquer présents** note qui est venu (badge **Présent**, compteur, journal), **Annuler la présence** corrige, et **Exporter les présences (CSV)** télécharge la feuille de présence. Sans terminal ni badge : juste savoir qui est venu.

#### Créneaux

- **Inscriptions sur validation** : un créneau peut être « Sur validation » (conduite, caisse, sécurité…). Une inscription y devient une demande qui garde sa place ; le bénévole le voit clairement (page, récapitulatif, email « Demande reçue », page personnelle où il peut la retirer). Dans les inscriptions, **Accepter** ou **Refuser** avec un récapitulatif, un filtre **Demandes à traiter**, et les demandes en attente dans « Ce qui demande votre attention ». Accepter envoie la confirmation habituelle ; refuser libère la place pour la liste d'attente et envoie un email sans raison, sauf message facultatif. Chaque décision est journalisée. Les demandes ne reçoivent pas les rappels, sont hors des feuilles de présence et de « tous les inscrits », et comptent pour les doublons, les chevauchements et la limite par personne. Copié avec l'événement. Une demande garde sa place : elle n'est pas comptée dans les places restantes de la page de l'événement ni comme manquante dans « Où manque-t-il du monde ? », qui l'affichent à part, et elle n'apparaît pas dans les coordonnées de l'export PDF.
- **Postes réservés à certains membres** : dans **Gérer les postes**, « Accès » réserve un poste aux membres portant une étiquette (par exemple `sécurité`). Ils s'y inscrivent avec le lien personnel de leur invitation ; sans ce lien, la page publique marque le poste « Réservé » et l'API refuse l'inscription, en lisant les étiquettes du membre au moment de l'inscription. Les étiquettes ne sont jamais montrées aux bénévoles ; l'ajout manuel reste possible ; copié avec l'événement.
- **Limite de créneaux par personne sur un poste** : dans **Gérer les postes**, un poste peut limiter le nombre de ses créneaux qu'une même personne prend (confirmés et liste d'attente comptés). La page publique le dit avant l'envoi ; le serveur le vérifie sous verrou, même pour deux inscriptions simultanées. L'administration peut dépasser la limite en ajoutant quelqu'un à la main, après un avertissement. Copiée avec l'événement.
- **Série de créneaux** : dans les créneaux d'un événement, **Créer une série** crée d'un coup tous les créneaux qui se suivent sur une plage horaire (par exemple une buvette de 10 h à 22 h par créneaux de deux heures), avec un aperçu avant création. Chaque créneau reste ensuite modifiable séparément.
- **Modifications rapides depuis le planning** : la fenêtre d'un créneau permet de le dupliquer (copie juste après, mêmes réglages), de décaler ses horaires (les inscrits sont prévenus), de fermer ou rouvrir ses inscriptions et d'appliquer un nombre de places à tous les créneaux du poste, jamais en dessous des inscrits déjà confirmés.
- **Infos pratiques par créneau** : un créneau peut porter un lieu de rendez-vous, une personne de contact (nom, téléphone) et une consigne courte. Le lieu et la consigne sont visibles sur la page d'inscription ; la personne de contact et son téléphone ne sont envoyés qu'aux inscrits (email de confirmation, rappels, page personnelle).

#### Page publique

- **Questions aux bénévoles** : jusqu'à 5 questions par événement dans le formulaire d'inscription (texte court, oui/non, choix unique ou multiple, obligatoire ou non), vérifiées par le serveur. Les réponses apparaissent sous chaque inscription, dans la feuille de présence CSV et l'archive, et dans le récapitulatif avant l'envoi. Une question avec réponses garde son type et ses choix utilisés ; retirée, elle quitte le formulaire mais ses réponses restent jusqu'à la suppression de l'événement. Copiées avec les réglages lors d'une duplication. Une réponse existante n'est remplacée qu'avec l'invitation du bénévole ; sans elle, seules les réponses manquantes sont ajoutées.
- **Ouverture et fermeture des inscriptions** : un événement publié peut montrer son planning sans accepter d'inscription. Dans l'édition, la section **Inscriptions** ouvre ou ferme les inscriptions et permet de programmer une ouverture et une fermeture (heure de l'organisation). La page publique explique pourquoi on ne peut pas s'inscrire et jusqu'à quand c'est ouvert ; l'API refuse toute inscription hors de la fenêtre, et la liste d'attente ne propose plus de place une fois fermé. Les copies et les modèles démarrent fermés.
- **Événements non répertoriés** : dans l'édition d'un événement, décocher **Afficher cet événement sur la page publique de l'organisation** le retire de la page d'accueil, de la liste publique et du sitemap (et des moteurs de recherche) tout en le laissant accessible par son lien, avec ses inscriptions. Utile pour un planning réservé aux organisateurs. Ce n'est pas un accès protégé : toute personne qui a le lien peut l'ouvrir. L'administration affiche « Publié — non répertorié » ; les copies et les modèles créent toujours un événement répertorié.
- **Couleur de la page publique** : dans les réglages d'un événement, une couleur de la palette (celle des postes) colore l'en-tête de la page d'inscription, avec un aperçu ; le texte reste blanc sur fond foncé. Elle est copiée avec les réglages lors d'une duplication. Pas encore de logo.
- **Voir sur la carte** : un événement et, au besoin, chaque créneau peuvent porter des coordonnées GPS (collez un lien OpenStreetMap ou Google Maps, ou « latitude, longitude ») ; un créneau sans coordonnées prend celles de l'événement. Les bénévoles ont un lien **Voir sur la carte** vers OpenStreetMap sur la page d'inscription, dans le récapitulatif, les emails de confirmation et de rappel et leur page personnelle. Aucune requête vers un service de cartes n'est faite avant le clic. Pas encore de recherche d'adresse.

#### Bénévoles et emails

- **Modèles de messages** : une organisation enregistre jusqu'à 20 modèles (nom, objet, texte) ; « Partir d'un modèle » les reprend dans « Écrire aux bénévoles », modifiables avant l'envoi. Variables `{prénom}`, `{événement}`, `{poste}`, `{créneau}`, remplacées pour chaque destinataire (notification comprise) ; une variable inconnue ou hors de son public bloque l'envoi au lieu de partir telle quelle.
- **Ajouter à mon calendrier** : la page personnelle du bénévole propose un fichier `.ics` de ses créneaux confirmés (ou d'un seul), aux heures du fuseau de l'organisation, changement d'heure et créneaux de nuit compris, avec le lieu, les infos pratiques et le lien vers la page. Seulement avec le lien personnel ; la liste d'attente n'est pas incluse. Réimporter le fichier remplace les créneaux au lieu de les dupliquer.
- **Écrire aux invités sans créneau confirmé** : nouveau public de « Écrire aux bénévoles », les membres invités qui n'ont encore aucune inscription confirmée (liste d'attente comprise, le compteur la distingue) ; leur email contient leur lien d'invitation « Choisir mes créneaux ». Le tableau de bord compte ces personnes et renvoie vers ce message ; la page des invitations parle de « sans créneau confirmé » et y renvoie aussi.
- **Notification avec un message ciblé** : « Écrire aux bénévoles » peut envoyer aussi une notification sur le téléphone des destinataires qui les ont activées ; l'email part à tous dans tous les cas. Le formulaire, l'aperçu et la confirmation indiquent le nombre d'appareils ; la notification montre l'objet et la première ligne et ouvre la page personnelle. Son résultat est suivi à part des emails dans l'historique, et les appareils disparus sont retirés.
- **Historique des messages** : sous « Écrire aux bénévoles », chaque message envoyé pour l'événement avec sa date, son auteur, son objet et son texte, le public choisi, le nombre de destinataires et la remise (envoyés, en échec, en attente), toujours juste après la purge nocturne de la file d'envoi. **Renvoyer les emails en échec** ne renvoie que ceux-là, une fois. Conservé 12 mois ; les destinataires ne sont pas listés.
- **Écrire aux bénévoles** : depuis un événement, un email avec objet et message à tous les inscrits, aux bénévoles d'un poste ou d'un créneau, ou aux personnes en liste d'attente. Le nombre de destinataires s'affiche, l'aperçu montre l'email tel qu'il sera reçu, et l'envoi est confirmé puis noté dans le journal. Chaque personne le reçoit une fois, avec ses créneaux concernés.
- **Disponibilités des bénévoles** (facultatives) : un bénévole peut indiquer sur sa page personnelle quand il est en général disponible (matin, après-midi, soir) et une remarque ; l'admin le voit et peut le modifier dans la fiche du membre, la liste des membres, les inscriptions et l'ajout manuel. Aucune attribution automatique : chacun choisit toujours ses créneaux.
- **Lien personnel expliqué** : la page personnelle rappelle que le lien est privé, la date du dernier email qui le contenait, propose de le recevoir à nouveau par email et, si l'organisation a une adresse de contact, d'écrire à l'organisation. Un lien invalide mène à une page qui explique pourquoi et permet de demander un nouveau lien en indiquant son adresse email.
- **Réglages des emails** : dans Paramètres → Emails, chaque organisation choisit quels rappels automatiques partent (J-2, J-1, jour J), si les administrateurs sont prévenus à chaque inscription, et l'adresse à laquelle arrivent les réponses des bénévoles ; un bouton envoie un email de test à votre propre adresse.
- **Emails envoyés** : dans les paramètres, la liste des emails de l'organisation (confirmations, rappels, messages…) avec leur état : en attente, nouvel essai prévu, envoyé, échec définitif, la raison du dernier échec et un bouton **Renvoyer** pour ceux en échec.

#### Rapports et exports

- **Rapports** : le lien **Rapports** de la page d'un événement remplace « Exporter PDF » et regroupe l'export complet (en couleur, en premier), l'archive de l'événement et des documents à imprimer, lisibles en noir et blanc et économes en encre : planning par jour, planning par poste (avec le responsable) et planning individuel par bénévole, en frise avec les prénoms dans les créneaux et, pour le planning individuel, les lieux, contacts et consignes ; feuille de présence avec cases à cocher et lignes vides ; liste avec téléphones pour les organisateurs, où chaque jour n'est écrit qu'une fois, suivi des horaires de ses créneaux.
- **Badges à imprimer** : depuis Rapports, un badge par bénévole inscrit (prénom, nom, poste, créneaux, bandeau à la couleur du poste ou de l'événement), dix par feuille A4 à découper ; filtre par poste et réimpression du badge d'une seule personne, choisie dans la liste des inscrits. Sans photo ni code QR.
- **Exports et portabilité** : archive JSON complète d'un événement (depuis Rapports), export CSV de tous les membres et de tout le journal d'activité ; le guide administrateur et la politique de confidentialité indiquent les durées de conservation et la procédure de suppression d'une organisation.

#### Administration

- **Rôle Organisateur** : à côté des propriétaires (tous les admins existants), un organisateur gère les événements, créneaux, inscriptions, membres et messages, mais pas l'équipe d'administration, les réglages de l'organisation ni la suppression définitive d'un événement. Un propriétaire choisit le rôle à l'invitation (Organisateur par défaut) et peut le changer ; l'organisation garde toujours un propriétaire actif. Les droits sont vérifiés côté serveur sur chaque route, d'après une matrice testée.
- **Activité d'un membre** : depuis la liste des membres, **Activité** ouvre la chronologie factuelle d'un membre (invitations, inscriptions, liste d'attente, annulations, présences, responsabilités de secteur, modifications de la fiche), datée dans le fuseau de l'organisation et reliée à chaque événement, avec un résumé en une phrase. Aucun score ni appréciation.
- **Aperçu avant l'import de membres** : l'import CSV ou Excel analyse d'abord le fichier sans rien enregistrer : membres à créer, à mettre à jour ou ignorés, lignes en erreur avec leur numéro et la raison, tags ajoutés ou réutilisés. L'import confirmé applique exactement cet aperçu ; si le fichier ou les membres ont changé entre-temps, rien n'est écrit et l'aperçu à jour s'affiche. Les emails en double dans le fichier sont signalés, la comparaison ignore les majuscules. Limites : 2 Mo et 5000 lignes par fichier, et un nombre d'analyses et d'imports par heure. L'import est inscrit une fois dans le journal d'activité, sans données personnelles.
- **Recherche globale** : la loupe **Rechercher** de la barre du haut de l'administration ouvre un champ (un clic, ou **Ctrl + K**, **⌘ + K** sur Mac ; **Échap** le referme) qui retrouve un bénévole, ses inscriptions, un événement ou un créneau dans toute l'organisation, sans tenir compte des accents, avec un lien vers la page Membres ou les inscriptions déjà filtrées sur le résultat.
- **Fuseau horaire par organisation** : dans les paramètres, une organisation peut choisir le fuseau de ses événements (Europe/Zurich par défaut). Il sert aux rappels, à l'heure limite des places proposées en liste d'attente, au journal de l'événement et à l'export PDF.
- **Santé du service** (super admin) : une page qui rassemble l'état de la base, de la file d'emails, des tâches planifiées (rappels, nettoyage), des sauvegardes (dump, copie hors site, dernier test de restauration), des migrations appliquées, de la version déployée et de la configuration (SMTP, push, secrets). Les tâches enregistrent leur dernier passage ; les sauvegardes le signalent par un battement de cœur.
- **Page Fonctionnalités** : `www.benevol.app/fonctionnalites` présente ce que fait benevol.app, besoin par besoin ; la page d'accueil et la documentation y renvoient. La page d'accueil et chaque page de documentation ont leur propre titre, leur description et leur adresse canonique.
- **Sitemap du site principal** : `www.benevol.app/sitemap.xml` liste la page d'accueil, la page Fonctionnalités et les pages de documentation, avec la date de dernière modification de leur contenu, et `robots.txt` le référence.

### Modifié

#### Politique de confidentialité

- **Copie de sauvegarde hors site** : la politique de confidentialité nomme désormais Dropbox, qui reçoit chaque nuit une copie chiffrée de la base (stockage aux États-Unis, offre sans accord de traitement spécifique), en précisant que c'est provisoire. Elle ne dit plus que chaque prestataire est lié par un accord de traitement.

#### Formulaires et actions de l'administration

- **Formulaires de l'administration** (connexion, mot de passe oublié, nouveau mot de passe, activation d'un compte, invitation d'un administrateur, membres et import, responsables de secteur, créneaux, séries et postes, jalons, pages d'information, invitations et relances, rappel manuel, super-admin) : les erreurs s'affichent à côté du champ concerné et sont annoncées, la saisie est conservée, un double clic n'envoie rien deux fois, une panne de réseau est expliquée avec **Réessayer** au lieu d'un écran figé, et le remplissage automatique convient aux gestionnaires de mots de passe. Supprimer ou désactiver (membre, responsable de secteur, créneau, poste, jalon, page, organisation) demande une confirmation qui dit ce qui va se passer, par exemple combien de bénévoles inscrits seront prévenus ; supprimer une organisation demande de taper son identifiant dans la fenêtre.
- **Actions groupées sur les inscriptions** (retirer de leur créneau, rendre responsable, renvoyer le lien, relancer les invités) : une confirmation récapitule d'abord ce qui va se passer (personnes concernées, emails envoyés, places proposées à la liste d'attente). Un retrait laisse ensuite 10 secondes pour changer d'avis : rien n'est enregistré ni envoyé avant, **Annuler le retrait** remet les lignes en place et **Retirer maintenant** n'attend pas. La sélection part en une seule opération, et rien n'est fait si une des inscriptions n'est plus valide ; « Renvoyer le lien » n'envoie qu'un email par bénévole. Une action qui échoue garde la sélection, dit si quelque chose a pu être appliqué et propose **Réessayer** ; une fois l'action faite, **Voir dans le journal** ouvre le journal de l'événement à la bonne date.
- **Publication** : un événement ne peut plus être publié sans créneau, quel que soit le chemin (formulaire d'édition, bouton Publier, API) ; le message l'explique. La création se fait toujours en brouillon, le choix du statut n'apparaît plus à cette étape.

#### Inscription des bénévoles

- **Formulaire d'inscription** : une erreur garde tout ce qui a été saisi et dit de quoi il s'agit (champ à corriger, créneau plus disponible, connexion interrompue, erreur du serveur), avec **Réessayer** quand c'est utile et l'assurance qu'un second envoi ne crée pas de doublon.
- **Récapitulatif avant de confirmer** : sur la page d'inscription, le récapitulatif reprend les créneaux choisis dans l'ordre avec le jour et les heures (« fin le lendemain » quand un créneau passe minuit), ce qui les sépare (enchaînés, pause, chevauchement signalé avant l'envoi), inscription ferme ou liste d'attente, âge minimum, et la liste exacte des données transmises à l'organisation.
- **Liste d'attente expliquée** : la même explication en cinq points (inscription pas encore confirmée, ordre, email avec 24 heures pour prendre la place, comment accepter, ce qui se passe sans réponse) apparaît dans le récapitulatif avant confirmation, sur la page de succès, dans l'email et sur la page personnelle, qui montre aussi les inscriptions en liste d'attente avec leur position et, quand une place est proposée, le délai et le lien pour la prendre.

#### Navigation et accessibilité

- **Documentation** : les captures d'écran des guides sont refaites sur un événement de démonstration et complétées (tableau de bord, « Où manque-t-il du monde ? », demandes à valider, questions, messages, rapports, membres et activité, page du responsable, sélection des créneaux, page personnelle), avec des textes alternatifs à jour.
- **Pied de page** : le nom, le numéro de version et le lien vers le code source forment un seul lien (« benevol.app v… »), précédé du logo GitHub.
- **Déclaration d'accessibilité** : une page publique `/accessibilite` (lien en pied de page) dit le niveau visé (WCAG 2.2 AA), l'état (partiellement conforme, en auto-évaluation), ce qui est vérifié et comment, ce qui ne l'est pas encore, les limites connues et comment signaler un problème. Les parcours critiques sont désormais analysés automatiquement par axe-core dans les tests de bout en bout.
- **Barre du haut de l'administration sur mobile** : sur un petit écran, les liens sont regroupés sous un bouton **Menu** au lieu de déborder de l'écran ; le menu du compte reste accessible. La page en cours est aussi soulignée, en plus d'être en couleur.
- **Menu du compte** : dans la barre du haut, votre nom ouvre un menu avec **Mon compte** et **Se déconnecter**. Le changement de mot de passe quitte la page Paramètres pour une page **Mon compte** dédiée, avec des libellés et messages d'erreur en français.
- **Filtres sans accents** : les filtres des pages Membres et Inscriptions ignorent les accents : « zoe » trouve Zoé, « francois » trouve François.
- **Accessibilité** : un lien « Aller au contenu », visible dès qu'on le tabule, ouvre chaque page de l'administration, de la documentation et de la page Fonctionnalités et saute la barre du haut. Dans la documentation et les pages légales, les liens sont soulignés, et le thème sombre de la documentation ne déborde plus sur la page d'accueil.

#### Fiabilité et technique

- **Politique de conservation vérifiable** : les durées de conservation ont une source unique ; le nettoyage quotidien les lit, et un test vérifie que le guide administrateur, la politique de confidentialité, la nouvelle page technique `docs/retention.md` et la rotation des sauvegardes disent la même chose. Les journaux techniques (90 jours) sont signalés comme une procédure manuelle sur le serveur.
- **Emails plus fiables** : les emails liés à une action (inscription, notification aux administrateurs et aux responsables, liste d'attente, créneau modifié ou annulé, invitation d'un responsable de secteur, invitation et bienvenue d'un administrateur, mot de passe oublié) passent par une file d'envoi enregistrée en même temps que l'action. L'action n'attend plus l'envoi, un arrêt du serveur au mauvais moment ne peut plus laisser une action faite sans son email, et un email en échec est renvoyé automatiquement.
- **Limitation des tentatives** (connexion, inscription, liens de gestion, mot de passe oublié) : les compteurs sont stockés dans la base de données. Ils ne sont plus remis à zéro à chaque redéploiement et restent justes si l'application tourne sur plusieurs instances.

### Corrigé

#### Navigation et affichage

- **Barre de l'administration** : les libellés (« Tableau de bord »…) ne passent plus sur deux lignes sur une tablette ou en super admin ; la barre resserre ses espacements et le nom de l'organisation se tronque à la place.

#### Inscriptions et liste d'attente

- **Dates vérifiées par l'API** : une date de naissance invalide, inexistante ou future est refusée (elle permettait de contourner l'âge minimum d'un créneau) ; les dates d'événement, de programme et de créneau doivent être des jours réels au format AAAA-MM-JJ, et la fin d'un événement ne peut plus précéder son début, y compris lors d'une modification ; un créneau (seul ou en série) doit tomber pendant son événement, et la date de départ d'une duplication ou d'un modèle doit être un jour réel.
- **Liste d'attente** : si la proposition d'une place libérée échoue au moment d'une annulation (panne ponctuelle), la tâche horaire la rattrape : pour chaque créneau à venir ayant une place libre et des personnes en attente, la place est proposée à la suivante. Auparavant elle pouvait rester libre durablement.
- **Inscription refusée** : une inscription publique refusée (créneau complet entre-temps, chevauchement, doublon) ne laisse plus de fiche membre créée pour une nouvelle adresse email.

#### Événements et créneaux

- **Heures après minuit** : des horaires enregistrés au-delà de 23 h 59 (par exemple 24:00, 25:30 ou 26:00 pour la nuit) s'affichaient tels quels (« 24h–26h »). Ils se lisent maintenant comme une heure d'horloge (« 0h–2h ») partout : sélecteur de créneau de l'administration, recherche, emails, exports et badges.
- **Dernier créneau annulé** : annuler le dernier créneau actif d'un événement publié (ou supprimer son dernier poste) le repasse en brouillon au lieu de laisser une page publique vide ; l'administration le signale et le journal le note.
- **Duplication d'un événement** : les créneaux copiés gardent leur âge minimum, leur liste d'attente et la couleur choisie pour le poste.
- **Création d'événement** : l'API ne peut plus créer un événement directement archivé ; tout statut envoyé à la création est ignoré.

#### Emails, invitations et horaires

- **Fichier calendrier (.ics)** : un point-virgule dans le lieu, la consigne ou le contact d'un créneau est désormais échappé comme le veut le format, au lieu d'être laissé tel quel.
- **Heures des rappels et des emails** : les heures des créneaux étaient traitées comme des heures UTC, ce qui décalait de 1 h (hiver) ou 2 h (été) les rappels « jour J » et l'heure d'expiration affichée dans l'email d'offre de liste d'attente ; même décalage dans les heures du journal de l'événement et de l'export PDF. Elles sont désormais calculées dans le fuseau des événements (`APP_TIME_ZONE`, Europe/Zurich par défaut) ; une valeur invalide empêche l'application de démarrer, avec un message explicite.
- **Lien d'invitation d'une organisation** : cliquer sur **Envoyer l'invitation par email** renouvelle le lien (l'ancien cesse de fonctionner) ; l'écran affiche désormais le nouveau lien au lieu de l'ancien, et la fiche d'une organisation permet de **Renvoyer l'invitation** à un administrateur en attente en montrant le lien généré.

#### Données et exploitation

- **Modifier l'email d'un membre** : une adresse déjà utilisée par un autre membre de l'organisation provoquait une erreur serveur ; le formulaire affiche maintenant le message à côté du champ Email.
- **Adresse avec une double barre oblique** : une adresse comme `benevol.app//events` faisait planter la page dans le navigateur. Elle redirige désormais vers l'adresse propre (`/events`), paramètres conservés.
- **Adresses email** : les majuscules et espaces ne sont plus pris en compte ; `Alice@Exemple.ch` et `alice@exemple.ch` désignent le même bénévole ou le même admin (connexion comprise), au lieu de créer deux fiches, et la base de données refuse deux fiches (bénévoles d'une même organisation, admins, responsables d'un même secteur) dont l'adresse ne diffère que par la casse ou des espaces. Les adresses existantes sont converties en minuscules, sauf les rares doublons qui ne diffèrent que par la casse, laissés tels quels pour un traitement manuel.
- **Statuts en base** : les contraintes sur les valeurs de statut s'appliquent aussi aux lignes existantes (vérifiées au préalable en production), et non plus seulement aux nouvelles.
- **Erreurs serveur** : les réponses d'erreur de la modification d'un événement et de l'import de membres ne contiennent plus de détails techniques.
- **Limites de tentatives partagées par tous** : derrière le Traefik de k3s, toutes les requêtes arrivaient avec l'adresse interne du nœud ; chaque limite était donc un seul compteur pour tous les visiteurs, et un lien d'invitation pouvait répondre « Trop de tentatives » à quelqu'un qui l'ouvrait pour la première fois. Nouveau manifeste `k8s/traefik-config.yaml` (`externalTrafficPolicy: Local`), documenté dans le guide de déploiement.

### Sécurité

#### Journaux et rapports d'erreurs

- **Liens personnels jamais journalisés** : les requêtes qui portent un lien personnel (page personnelle, liste d'attente, responsable, invitation) ne sont plus écrites dans les journaux d'accès du serveur, et les pages n'envoient plus leur adresse complète dans l'en-tête `Referer`. Le lien d'un responsable de secteur est aussi masqué dans les rapports d'erreurs, comme les autres liens personnels.

#### Comptes administrateurs

- **Inviter un organisateur** : l'invitation d'un administrateur avec le rôle Organisateur échouait (erreur serveur) ; elle fonctionne.
- **Sessions admin après un changement de mot de passe** : changer ou réinitialiser son mot de passe déconnecte toutes les autres sessions ouvertes auparavant (autres navigateurs, appareils, ou session volée). La session depuis laquelle le mot de passe est changé reste ouverte.
- **Changement de mot de passe** : la vérification du mot de passe actuel (page « Mon compte », profil du super admin) est limitée à 5 échecs par compte et 20 par adresse IP sur 15 minutes. Une session volée ne peut plus essayer des mots de passe à l'infini.
- **Longueur maximale des mots de passe admin** : un nouveau mot de passe est limité à 72 octets en UTF-8, la limite réellement prise en compte par le chiffrement (bcrypt). Une lettre accentuée occupe 2 octets, un emoji jusqu'à 4. Les mots de passe plus longs déjà définis continuent de fonctionner à la connexion.

#### Liens des bénévoles

- **Lien de gestion après inscription** : il n'est plus affiché sur la page de succès pour une adresse email nouvelle, seulement envoyé par email : n'importe qui pouvait inscrire une autre personne avec une adresse encore inconnue de l'organisation et obtenir son lien. Il reste affiché pour une inscription depuis un lien d'invitation membre.
- **Liens personnels des bénévoles, responsables de secteur et invitations** : ne sont plus lisibles dans une copie de la base. La base ne garde qu'une empreinte (pour reconnaître un lien) et une copie chiffrée avec la clé `TOKEN_ENCRYPTION_KEY` (pour renvoyer le lien par email) ; les liens existants sont chiffrés automatiquement par la tâche de nettoyage quotidienne et restent valables. **La clé est obligatoire en production** : sans elle, le serveur refuse de démarrer (voir [Mise à jour depuis 1.x](docs/deploiement.md#mise-à-jour-depuis-1x)).
- **Désinscription des notifications push** : elle exige le lien personnel du bénévole, comme l'inscription, ne retire que son abonnement et est limitée en fréquence ; une adresse d'abonnement seule ne suffit plus.

---

## [1.15.0] — 2026-09-28

### Ajouté

- **Téléphone obligatoire, par événement** : nouvelle option dans les paramètres de l'événement pour exiger un numéro de téléphone sur le formulaire d'inscription public (désactivée par défaut, reprise lors d'une duplication). Le numéro saisi est enregistré avec l'inscription et affiché en priorité dans la liste des inscriptions, l'export PDF et la page du responsable de secteur, y compris pour un bénévole déjà connu dont la fiche n'est pas modifiée par le formulaire public.
- **Renvoyer le lien de gestion** : action sur la page des inscriptions pour réémettre par email le lien personnel `/my/[token]` d'un ou plusieurs bénévoles qui l'ont perdu ou supprimé par erreur.
- **Badge « Responsable » sur les inscriptions** : affiché sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.
- **Nombre de places sur le planning public visible sur mobile** : le compteur (« 3/5 ») et l'heure de début s'affichent désormais dès qu'une barre de créneau est un peu plus large que le minimum, plutôt que de rester vides sur les tailles courantes sur téléphone.
- **Lien « Soutenir le projet »** dans le pied de page du site benevol.app et de la documentation (jamais sur les pages d'une organisation, de ses bénévoles ou de l'admin).
- **Heures cumulées par membre** (`/admin/members`) : colonne triable indiquant le total du temps sur des créneaux actifs, tous événements confondus. Volontairement absente de l'export PDF pour ne pas exposer un classement entre bénévoles.

### Modifié

- **Page des inscriptions** : les boutons par ligne (rendre responsable, renvoyer le lien, annuler) sont retirés au profit d'une sélection (cases à cocher) suivie d'une action dans la barre d'outils qui apparaît — la même mécanique que les actions groupées, désormais utilisée aussi pour une seule inscription. Le bouton « Annuler » est renommé « Retirer de leur créneau » pour éviter toute ambiguïté avec l'annulation d'une action en cours, et pour ne pas laisser croire à un retrait du rôle de responsable de secteur.

### Corrigé

- **Planning public** : le nombre de places restantes s'affiche dans la barre du créneau, et l'âge minimum d'un créneau sélectionné est rappelé dans la carte « Créneaux sélectionnés ».
- **Emails** : le texte de tous les emails (confirmations, rappels, invitations…) était centré par erreur ; il est désormais aligné à gauche, dans une mise en page un peu plus large.
- **Accessibilité du bouton de rappels push** : le résultat (« Rappels push activés » ou notifications bloquées) est annoncé aux lecteurs d'écran et reçoit le focus quand le bouton disparaît ; contraste du message de succès renforcé ; icônes décoratives masquées aux technologies d'assistance.
- **Inscriptions simultanées** : deux inscriptions envoyées en même temps pour la dernière place ne peuvent plus dépasser la capacité du créneau, un double envoi du formulaire ne crée plus deux inscriptions, et deux désistements simultanés proposent bien deux places à deux personnes différentes de la liste d'attente. Une place proposée à la liste d'attente reste réservée jusqu'à confirmation ou expiration. Les éventuels doublons existants (même personne inscrite deux fois au même créneau) sont annulés à la mise à jour, en gardant la plus ancienne inscription.
- **Âge minimum** : l'âge est désormais vérifié à la date du créneau et non à la date d'inscription ; un bénévole qui atteint l'âge requis entre son inscription et le créneau n'est plus refusé.
- **Super admin sans organisation sélectionnée** : l'espace admin ne bascule plus silencieusement sur la plus ancienne organisation ; il renvoie vers la liste des organisations pour en choisir une. L'en-tête affiche aussi désormais l'organisation réellement sélectionnée (il affichait toujours la plus ancienne).
- **Export PDF** : les heures qui passent minuit s'affichaient en brut au-delà de 23h (« 24h », « 26h ») au lieu de repartir à zéro ; la colonne « Libellé » s'affichait vide quand aucun créneau du jour n'avait de libellé distinct de son poste.
- **Sentry** : filtre le bruit bénin « The destination stream closed early » (abandon client, pas une erreur applicative). <!-- interne -->

### Sécurité

- **Inscription publique avec l'adresse email d'un autre bénévole** : le formulaire ne renvoie plus le lien de gestion d'un bénévole déjà connu (ni en cas d'inscription en double, ni après une nouvelle inscription), et ne modifie plus ses informations enregistrées (nom, téléphone, date de naissance). Le lien part uniquement par email, sauf pour une adresse nouvelle ou une inscription depuis un lien d'invitation membre. Deux inscriptions simultanées d'une même personne à des créneaux qui se chevauchent ne peuvent plus passer toutes les deux.
- **Isolation entre organisations renforcée** : toutes les opérations de l'espace admin sur les données d'une organisation (lectures, modifications, suppressions, créations, y compris pages d'événement, responsables de secteur, échéances et journaux) sont désormais limitées à l'organisation par construction, et non plus seulement par une vérification faite route par route.
- **Sessions admin** : un admin désactivé ou supprimé, ou un admin dont l'organisation est désactivée, perd immédiatement l'accès au lieu de le garder jusqu'à l'expiration de sa session (30 jours) ; un changement de rôle s'applique sans reconnexion.
- **Connexion admin** : après 10 échecs sur un même compte ou 30 depuis une même adresse IP en 15 minutes, les tentatives suivantes sont refusées jusqu'à la fin de la fenêtre.
- **Liens d'activation et de réinitialisation de mot de passe admin** : seule une empreinte (SHA-256) est conservée en base, jamais le lien lui-même ; une copie ou une sauvegarde de la base ne permet plus de prendre le contrôle d'un compte admin. Les liens déjà envoyés restent valables. Renvoyer l'invitation d'un compte en attente génère désormais un nouveau lien (l'ancien cesse de fonctionner).
- **Abonnements push** : s'abonner aux rappels push exige désormais le lien de gestion du bénévole (token d'inscription) au lieu d'une simple adresse email, et l'abonnement est rattaché au bénévole (donc à son organisation). Auparavant, n'importe qui pouvait abonner son navigateur à l'adresse email d'un autre bénévole et recevoir ses rappels, qui contiennent le lien `/my/[token]`. Les abonnements existants sont supprimés ; un navigateur déjà abonné est ré-enregistré automatiquement à la prochaine visite de la page de gestion.

## [1.14.0] — 2026-09-26

### Ajouté

- **Renommer ou supprimer un poste** : le panneau « Gérer les postes » (ex-« Réordonner les postes ») permet, poste par poste, de renommer d'un coup tous ses créneaux (refuse un nom déjà pris par un autre poste, pour ne pas fusionner deux postes par erreur) ou de tous les annuler — même confirmation et notification des bénévoles qu'une suppression de créneau individuelle.
- **Couleur d'un poste** : un point coloré cliquable dans « Gérer les postes » ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique »), appliqué à la timeline admin et à la page publique.
- **Documentation publique adaptée au mobile, avec un thème sombre** : les pages `/doc` s'affichent correctement sur petit écran (plus de débordement horizontal, zones de clic des liens de navigation agrandies) et proposent un bouton clair/sombre indépendant des préférences système, mémorisé d'une visite à l'autre.
- **Markdown complet dans les communications admin** : le composeur de « Nouveautés produit » et le message de confirmation d'inscription acceptent la syntaxe Markdown complète (titres, gras, italique, listes, citations, code, tableaux, texte barré, listes de tâches, liens automatiques), plus seulement le gras, les liens et les puces.
- **Adresse personnalisée pour « Envoyer un test »** : un champ optionnel permet d'envoyer l'email de test des « Nouveautés produit » à une adresse différente de celle du compte super-admin connecté, sans que cet envoi soit compté dans l'historique des diffusions.
- **Actions groupées sur la liste des inscriptions** : sélection multiple par cases à cocher (avec case d'en-tête pour tout sélectionner) pour annuler plusieurs inscriptions d'un coup ou désigner plusieurs responsables de secteur en une seule action.
- **Nombre de places sur le planning public** : chaque créneau affiche désormais, comme sur la timeline admin, le nombre d'inscrits sur la capacité totale (ex. « 3/5 »), pour faciliter la réservation en petit groupe.

### Corrigé

- **Ordre des postes qui change tout seul** : ajouter ou modifier un créneau d'un poste déjà réordonné pouvait ramener ce poste en tête de la timeline sans action volontaire de l'admin.
- **Duplication d'un événement** : les créneaux déjà supprimés de l'événement source réapparaissaient (rouverts) dans la copie.
- **Noms de postes tronqués** sur la timeline, surtout sur mobile (ex. « Chauffeurs... ») — les noms longs passent maintenant sur deux lignes.
- **Export PDF** : le planning affichait parfois la journée entière (00h–24h) au lieu de la plage réelle des créneaux ; l'ordre des postes dans l'export ne suivait pas toujours l'ordre choisi via « Gérer les postes ».
- **Menu admin sur deux lignes** pour un compte super-admin : les liens « Organisations » et « Communications admin » (ex-« Nouveautés produit ») sont regroupés dans un menu déroulant « Super Admin ».
- **Documentation** (`/doc`) : le pied de page ne reprenait pas le vrai pied de page du site (numéro de version, lien « Espace organisateur »…) ; plusieurs URLs d'exemple montraient l'organisation comme un segment de chemin (`/[org]/[évènement]`) au lieu du sous-domaine réel (`[org].benevol.app/[évènement]`) ; quelques libellés de l'interface décrits dans les guides ne correspondaient plus exactement à l'interface actuelle (inscriptions, créneaux à pourvoir, liste d'attente).
- **Heure de fin d'un nouveau créneau affichée « NaN:NaN »** pendant la saisie de l'heure de début, avant qu'elle ne soit complète ; l'écart par défaut proposé pour l'heure de fin passe de +1h30 à +1h.
- **Un nouveau poste rejoignait le début d'une liste réordonnée manuellement** au lieu de s'ajouter à la fin, dès son premier créneau.

---

## [1.13.0] — 2026-09-25

### Ajouté

- **Pages personnalisées d'événement** : en plus du champ unique « instructions publiques », un événement peut avoir plusieurs pages libres (règlement, FAQ, accès, ce qu'il faut apporter…), rédigées en Markdown par l'organisateur et rendues de façon sécurisée (`marked` + DOMPurify, allowlist explicite de balises/attributs, assainies à l'affichage et non à l'écriture). Gestion admin (créer, modifier, réordonner au clavier, supprimer) ; page publique `/[eventSlug]/[pageSlug]` ; liens listés sous les instructions publiques de l'événement ; modifications tracées dans le journal de l'événement (titre et adresse seulement, jamais le contenu).
- **robots.txt et sitemap.xml** : n'existaient pas auparavant — tout était indexable par défaut, y compris les URLs à jeton (`/my/[token]`, `/waitlist/[token]/confirm`) et les routes `/admin`, `/api/`. `robots.ts` interdit désormais ces routes sur le domaine de production, et interdit tout sur le sous-domaine de préproduction, tout hôte hors domaine de production et en développement. `sitemap.ts` est multi-tenant par sous-domaine : chaque organisation n'a que ses propres événements publiés et leurs pages personnalisées dans son `sitemap.xml`.
- **Responsables de secteur** : un ou plusieurs bénévoles peuvent être désignés responsables d'un poste (ex. « Bar »), avec un lien personnel (sans compte à créer) affichant en lecture seule qui est inscrit sur leur poste — nom, email, téléphone, groupés par créneau. Email de notification à chaque nouvelle inscription sur leur poste. Deux raccourcis pour éviter de ressaisir un nom déjà connu : « Depuis les inscrits » sur la page des responsables, et le bouton « Rendre responsable » directement depuis une ligne de la page des inscriptions. La fiche du bénévole concerné (`/admin/members`) reçoit automatiquement le tag « responsable », retiré quand il ne reste plus responsable d'aucun secteur.
- **Journal de l'événement** : historique complet (créneaux, inscriptions, pages, responsables, paramètres de l'événement, invitations) avec trois modes — **Explorer** (liste filtrable), **Rejouer** (reconstitue l'état d'une entité à un instant donné) et **Récit** (raconte en une phrase une chaîne d'événements liés, ex. une annulation qui déclenche une offre de liste d'attente). Une génération de référence (« baseline ») reconstitue un point de départ pour les créneaux et inscriptions antérieurs à cette fonctionnalité, visuellement distincte d'une action réelle. Aucune donnée personnelle des bénévoles ni contenu de page n'est jamais journalisé.
- **Journal d'activité de l'organisation** (`/admin/settings/activity`) : équivalent du journal d'événement pour les entités qui appartiennent à l'organisation et non à un événement précis — création/modification/désactivation d'un membre, invitation/retrait d'un compte admin. Liste filtrable, avec les mêmes principes de confidentialité (jamais de valeurs, seulement les champs modifiés).
- **Jalons de l'événement** : checklist simple de dates clés (ex. « Fermer les inscriptions », « Envoyer les rappels ») sur la page de l'événement — titre, échéance, coché ou non. Purement informatif, un jalon dépassé et non coché est mis en évidence.
- **Âge minimum sur un poste** : un créneau peut exiger un âge minimum (majorité, permis de conduire…). Affiché en info sur le planning public (ex. « 18+ »), le créneau reste sélectionnable — la date de naissance n'est demandée dans le formulaire d'inscription que si un créneau sélectionné l'exige, et l'inscription est refusée côté serveur si la condition n'est pas remplie.
- **Broadcasts produit aux beta-testeurs** : le super-admin peut rédiger (Markdown, aperçu en direct) et envoyer un email « nouveautés » à tous les comptes admin de toutes les organisations, avec envoi de test et historique des envois. Chaque compte admin peut se désinscrire (lien signé, sans jeton stocké) ; désinscription distincte du fait d'avoir un compte.
- **Documentation publique** (`/doc`, `/doc/admin`, `/doc/benevole`) : les guides administrateur et bénévole sont maintenant des pages publiques sur benevol.app, avec captures d'écran et FAQ, au lieu de fichiers Markdown lisibles seulement sur GitHub — liées depuis le pied de page public et depuis la barre de navigation admin (« Aide »).
- **Copie de sauvegarde hors site (Dropbox)** : `cronjob-backup-offsite.yaml` copie chaque nuit les fichiers déjà chiffrés du dump vers Dropbox via `rclone` (upload seulement, jamais de suppression côté Dropbox pilotée par la rotation locale), avec une rétention de 90 jours côté Dropbox, plus longue que les 30 jours du volume local. Mise en place documentée dans `docs/deploiement.md` (jeton OAuth à créer en local, jamais dans le dépôt).

### Corrigé

- **Build Docker de production cassé** : `.dockerignore` exclut tous les fichiers `.md`, y compris `GUIDE_ADMIN.md` et `GUIDE_BENEVOLE.md` que `next build` lit à la génération statique de `/doc/admin` et `/doc/benevole` (nouveauté ci-dessus) — le build échouait (`ENOENT`) dès le premier déploiement de cette version. Les deux fichiers sont maintenant explicitement réinclus.
- **Horaires des créneaux** : ils sont bornés à `00:00`–`23:59`. Le glisser-déposer du planning administrateur pouvait écrire des heures comme `24:00`–`26:00`, voire négatives (`-2:-15`), sans aucun contrôle ; l'horloge repart désormais à zéro après minuit (`fromMin` ramène au jour), l'API refuse les heures hors plage ou identiques avec un message lisible, et le formulaire n'altère plus en silence une heure invalide. Un créneau de nuit s'écrit avec une fin plus petite que le début (`22:00`–`02:00`, affiché « 22h–02h +1 ») ; les anciennes valeurs restent lisibles (affichées modulo 24) et une requête de correction est documentée dans `docs/deploiement.md`.
- **Planning public** : le graphique de chaque jour occupe toute la largeur de la carte (il était comprimé à environ 300 px les jours qui comptent un long créneau, ce qui chevauchait les heures et coupait les textes) ; mise en page fluide en pourcentage, défilement horizontal sur mobile, texte des barres affiché seulement quand il tient, heures de l'axe qui repartent à zéro après minuit et espacées quand la journée est longue, textes plus lisibles, région de défilement nommée.
- **Conflits d'horaires** : la détection de chevauchement comprend maintenant les créneaux qui passent minuit et les chevauchements entre deux dates (côté bénévole et côté administrateur).
- **Lien d'invitation admin expiré** : la tâche planifiée de nettoyage effaçait le jeton d'invitation dès son expiration (7 jours), avant même que la personne invitée n'ait cliqué dessus ; le lien affichait alors le même message générique « invalide ou déjà utilisé » qu'un lien réellement déjà utilisé, au lieu du message « Ce lien a expiré » prévu pour ce cas. Le nettoyage ne touche plus ce jeton avant expiration ; il continue d'être supprimé avec le compte inactif au bout de 30 jours.
- **Sauvegardes de la base de données** : chaque exécution du backup nocturne échouait silencieusement depuis sa création (début mai 2026) — l'image utilisée n'a jamais fourni la commande `openssl`, et l'ancien script ne détectait pas l'échec du chiffrement caché derrière un tube (`pg_dump | gzip | openssl`) ; 144 jours de fichiers de sauvegarde vides, sans alerte. Le script installe désormais `openssl`, vérifie la taille du dump, et re-déchiffre chaque fichier produit pour confirmer qu'il correspond au dump avant de le conserver ; toute anomalie fait échouer le job au lieu de produire un fichier vide. Le manifeste (`k8s/cronjob-backup.yaml`) est maintenant appliqué à chaque déploiement comme les autres tâches planifiées, ce qui n'était pas le cas. Voir `docs/deploiement.md` : aucune sauvegarde antérieure au 22/09/2026 n'est utilisable.
- **Sentry** : n'est plus actif qu'en production. Le développement local et les tests E2E chargeaient le vrai DSN depuis `.env` et envoyaient leurs erreurs (environnement `development`) dans le projet Sentry de production. Le bruit de l'extension navigateur MetaMask (« Failed to connect to MetaMask », injecté par l'extension elle-même sur chaque page, sans rapport avec l'application) est maintenant filtré, comme les autres extensions déjà exclues (`__firefox__`, DarkReader, `window.ethereum`). <!-- interne -->

### Accessibilité

- Contraste insuffisant corrigé sur plusieurs écrans neufs de cette version (liens de navigation super-admin, texte des commentaires sur le roster public des responsables, texte d'aide du champ « Âge minimum », actions du journal des jalons).
- Focus, sémantique de titres et annonces aux lecteurs d'écran revus sur les nouvelles interfaces (formulaire d'ajout de responsable, listes filtrables des journaux, formulaire du champ âge minimum) — voir le détail dans chaque pull request associée (#186, #189, #192, #194, #195, #200).

---

## [1.12.0] — 2026-09-20

### Ajouté

- **Documentation** : `README.md`, les guides administrateur et bénévole, `FONCTIONNALITES.md`, `CONTRIBUTING.md` et `SECURITY.md` sont remis à jour d'après le code (variables d'environnement, scripts, tâches planifiées, structure, modèle de données). Nouvelles pages dans `docs/` : architecture, configuration, déploiement, rôles et permissions, API. Les captures d'écran du README sont refaites (page d'accueil, timeline sur ordinateur et sur mobile, à partir de l'événement de démonstration du seed).
- **Tests E2E** : isolation de la suppression d'événement entre organisations, titre de la page publique, formulaires de réglages.
- **Titre de la page publique modifiable** : chaque organisation peut définir le titre affiché en haut de sa page publique (et dans l'onglet du navigateur) depuis les paramètres ; « Bénévoles » par défaut. Le nom de l'organisation reste affiché au-dessus. Migration `0007_org_public_title`.
- **Archiver et supprimer un événement** : bouton « Archiver » sur la page de l'événement, et suppression définitive possible uniquement pour un événement archivé. La fenêtre de confirmation affiche un avertissement fort avec le nombre de créneaux, d'inscriptions et d'invitations effacés, propose d'ouvrir l'export PDF avant de supprimer et demande de saisir le titre de l'événement (sans tenir compte des accents ni de la casse). Les bénévoles ne sont pas prévenus. Un bandeau confirme la suppression sur la liste des événements.

### Corrigé

- **Page publique d'une organisation** : les événements terminés ne s'affichent plus comme ouverts avec des places à pourvoir ; les badges de statut suivent `DESIGN.md` (places à pourvoir en vert, complet en bleu) ; la page d'accueil du site n'exécute plus la requête sur tous les événements pour afficher la page de présentation ; le pied de page a un lien « Espace organisateur » vers la connexion.
- **Membres** : le bouton « Importer un fichier » de l'état vide menait à une page inexistante (404) ; il ouvre maintenant la fenêtre d'import.
- **Accessibilité** : les fenêtres « Envoyer le rappel » et « Inviter des membres » ont une vraie sémantique de dialogue (titre lié, Échap, piège de focus, retour du focus, verrou de défilement) via un composant partagé ; le texte gris trop clair (2,5:1) est remplacé sur 22 fichiers ; `DESIGN.md` réserve « Encre Fantôme » au décoratif.
- **Infrastructure** : les sondes Kubernetes de l'application interrogent `/api/health` avec des délais de 3 et 5 s (des échecs par délai apparaissaient pendant les déploiements) ; la sonde Postgres passe par un shell (elle journalisait `FATAL: role "root" does not exist` toutes les 5 s) ; l'image du webhook Gandi se construit de nouveau (Go 1.25) et est validée à chaque pull request. <!-- interne -->
- **Données de démonstration** : les dates du seed correspondent aux jours annoncés (samedi 13 et dimanche 14 juin 2026). <!-- interne -->
- **Réglages de l'organisation** : les formulaires « Nom de l'organisation » et « Identifiant public (slug) » ont désormais des étiquettes, des textes d'aide, des messages de succès et d'erreur annoncés aux lecteurs d'écran, des contrastes conformes et des noms explicites sur les boutons de suppression des anciens identifiants. L'adresse affichée par le formulaire du slug est calculée côté serveur, ce qui supprime une erreur d'hydratation React sur cette page.

### Sécurité

- **Sentry** : `sendDefaultPii` passe à `false` (plus d'adresse IP, de cookies ni d'en-têtes de requête envoyés) sur le navigateur, le serveur et l'edge ; `includeLocalVariables` est désactivé côté serveur (il ouvrait l'inspecteur Node et joignait les valeurs des variables locales aux événements). Les jetons d'accès contenus dans les URLs (`/my/…`, `/waitlist/…/confirm`, `?token=…`) sont masqués dans les événements, transactions, spans et fils d'Ariane avant envoi. La politique de confidentialité cite désormais Sentry (région UE) comme sous-traitant.
- **Route publique supprimée** : `GET /api/public/events/[slug]` n'était appelée nulle part et cherchait un événement par slug sans filtrer par organisation, alors que le slug n'est unique que par organisation.
- **Dépôt** : le binaire compilé du webhook Gandi (83 Mo) n'est plus suivi par git.

### Modifié

- **Node 26** partout : `.nvmrc` (`26.9.0`, la version du cluster), CI, déploiement, README et guide de contribution. Auparavant la CI testait Node 24 alors que la production tournait sous Node 26. L'image Docker installe la CLI Prisma 7.10.0, alignée sur `package-lock.json`.
- **Déploiement** : `SENTRY_DSN` est synchronisé dans le secret Kubernetes (il manquait, donc Sentry ne recevait pas les erreurs serveur) ; le manifeste du webhook Gandi référence le tag de son commit, avec la procédure de mise à jour documentée.
- **`DELETE /api/admin/events/[id]`** supprime désormais l'événement au lieu de l'archiver ; il exige un événement archivé (409 sinon) et le titre en confirmation (400 sinon). L'archivage passe par `PATCH { publicStatus: "archived" }`.

---

## [1.11.3] — 2026-09-20

### Corrigé

- **Sentry côté serveur** : `instrumentation.ts` à la racine était ignoré par Next.js (l'application vit dans `src/app`). Les configurations Sentry serveur et edge ne se chargeaient pas et `onRequestError` n'était pas branché. Le fichier est fusionné dans `src/instrumentation.ts`, les erreurs serveur remontent désormais dans Sentry.
- **Sentry côté client** : les erreurs provoquées par les scripts injectés par les navigateurs iOS (Firefox, Brave : `__firefox__`, `DarkReader`, `window.ethereum`) sont filtrées.

### Sécurité

- **Dépendances** : `go.opentelemetry.io/otel` (gandi-webhook) mis à jour en 1.45.0, ce qui ferme les alertes Dependabot associées. Mise à jour groupée de 28 dépendances npm.
- **Code scanning** : le répertoire `.github/skills/` (outils de développement tiers, 20 alertes CodeQL) n'est plus versionné.

### Modifié

- **CI** : `actions/upload-artifact` 4 → 7.

---

## [1.11.2] — 2026-09-14

### Sécurité

- **Dépendances** : correction de 8 alertes Dependabot — `google.golang.org/grpc` (DoS xDS, gandi-webhook), `mysql2` (fuite d'identifiants via downgrade d'auth, DoS zlib), `deepmerge-ts` (épuisement de pile), `@hono/node-server` (path traversal et bypass serveStatic), `valibot`, `uuid`. Les dépendances transitives figées par Prisma sont désormais forcées via `overrides` dans `package.json`.
- **`nodemailer`** : mise à jour 9 → 10.
- **`baseline-browser-mapping`** : mise à jour des données de compatibilité navigateurs.

### Supprimé

- **Export Excel (`.xlsx`)** : fonctionnalité retirée ; le bouton « Exporter Excel » est supprimé de l'interface admin. L'export PDF reste disponible. L'import de membres via xlsx n'est pas affecté.

---

## [1.11.1] — 2026-09-12

### Corrigé

- **`/admin/settings/admins`** : erreur non gérée quand la réponse serveur arrive vide (proxy/timeout transitoire) — alignement sur le pattern déjà utilisé ailleurs dans le code (`.catch(() => ({}))`).

### Sécurité

- **Dépendances** : `gandi-webhook` — `golang.org/x/crypto` 0.51.0 → 0.52.0, `google.golang.org/grpc` 1.79.3 → 1.83.1 (9 CVE critiques/hautes corrigées) ; `@sentry/nextjs` 10.56.0 → 10.74.0 (`@opentelemetry/core` 2.7.1 → 2.11.0, CVE modérée corrigée).

---

## [1.11.0] — 2026-06-10

### Ajouté

- **Liste d'attente — interface publique** : les créneaux complets avec liste d'attente activée s'affichent en couleur du rôle avec rayures diagonales blanches (distinctif du gris hachuré « Complet ») ; les horaires restent visibles ; un sous-label « Complet · file d'attente » apparaît sous la barre ; un bénévole qui sélectionne ce créneau voit « En attente » avec une coche dans le récap
- **Liste d'attente — récap sidebar** : les créneaux en liste d'attente sélectionnés sont listés avec une note « Complet · liste d'attente si place libérée » dans le style secondaire (cohérent avec les sous-labels existants)
- **Liste d'attente — export PDF** : colonne « File d'attente » conditionnelle dans le tableau Récap par poste (affichée uniquement si au moins un créneau a des personnes en attente)
- **Liste d'attente — promotion admin** : l'annulation d'une inscription depuis l'interface admin (via DELETE ou PATCH `status: cancelled`) déclenche désormais la promotion automatique de la première personne en liste d'attente, comme c'était déjà le cas pour les annulations publiques

### Refactoring

- **`gantt-utils.ts`** : extraction des utilitaires partagés (`toMin`, `toMinEnd`, `fromMin`, `fmt`, `clamp`, `GanttShow`) dans `src/lib/gantt-utils.ts`

### Infrastructure

- **`.understand-anything/`** ajouté à `.gitignore` ; dossier retiré du dépôt

### Documentation

- Incohérence Node.js corrigée (`≥ 22` → `26` dans `CONTRIBUTING.md`)
- `README.md` : structure `lib/` mise à jour (`gantt-utils.ts`, `waitlist.ts`, `AdminDayTimeline`)
- `FONCTIONNALITES.md` : liste d'attente documentée (côté public et admin), notifications `waitlist_*` ajoutées au tableau, compteur de tests supprimé
- `GUIDE_ADMIN.md` : section « Activer la liste d'attente » dans la gestion des créneaux
- `GUIDE_BENEVOLE.md` : FAQ créneau complet explique la liste d'attente et le délai de 24 h

---

## [1.10.0] — 2026-06-09

### Ajouté

- **Page membres — colonnes Prénom / Nom séparées** : les deux colonnes sont triables individuellement (clic sur l'en-tête : croissant → décroissant → reset) ; le tri est annoncé aux lecteurs d'écran via une live region (`aria-live="polite"`)

### Amélioré

- **Export Excel** : le récap par poste est déplacé sur une feuille dédiée « Récap par poste » ; les feuilles de jour ne contiennent plus que le Gantt
- **Export PDF** : restructuré en 3 sections uniformes (Planning / Récap par poste / Liste des bénévoles) sans saut de page forcé entre elles

### Infrastructure

- **Fusion des tables `Member` et `Volunteer`** : source de vérité unique pour le répertoire de l'organisation et les inscriptions — les exports et rappels reflètent désormais directement les modifications de la fiche membre
- **`SENTRY_AUTH_TOKEN` passé via secret Docker** (`--mount=type=secret`) au lieu d'une variable d'environnement — le token ne se retrouve plus dans les couches de l'image
- Node.js mis à jour vers **26** dans les images Docker et la configuration CI

### Ajouté (repris de la période beta.6 → 1.10.0, jamais documenté)

- **Auto-inscription au répertoire de l'organisation** : un bénévole qui s'inscrit à un créneau, sans être déjà dans la liste des membres, y est automatiquement ajouté avec le tag « Bénévole ». Une modification de sa fiche membre met à son tour à jour ses inscriptions (exports, rappels).
- **Modale d'édition d'un membre** sur la page Membres, avec piège de focus, sémantique de dialogue et annonces aux lecteurs d'écran.

---

## [1.0.0-beta.6] — 2026-05-07

### Ajouté

- **Liste d'attente pour créneaux complets** : un créneau peut être ouvert à la liste d'attente une fois complet ; une place libérée est automatiquement proposée à la personne suivante (email, 24h pour confirmer via `/waitlist/[token]/confirm`, sinon la place passe au suivant). Une tâche planifiée expire les offres non confirmées et relance la promotion.
- **Tableau de bord admin** : statistiques globales de l'organisation (événements, taux de remplissage, bénévoles, membres) et barres de remplissage par événement (rouge/orange/jaune/vert).
- **Message de confirmation personnalisable** : un texte en Markdown, avec variables ({{prenom}}, {{créneau}}…), affiché sur la page de succès, sur `/my/[token]` et dans l'email de confirmation.
- **Notifications push navigateur** : un bénévole peut s'abonner (page de succès ou `/my/[token]`) pour recevoir un rappel J-2, J-1 et jour J en plus de l'email.
- **Changement de mot de passe** depuis les réglages admin, sans passer par le lien « mot de passe oublié » (mot de passe actuel requis).
- **Charte du bénévole configurable** : bascule pour mentionner ou non une assurance de l'organisation ; texte mis à jour pour le contexte légal suisse (LPD, code des obligations, LAA).

### Amélioré

- **Mise en page desktop de la page publique** : timeline et barre latérale (infos événement, créneaux sélectionnés, appel à l'action) sur deux colonnes.
- **Page événement admin** : la mention « X manquants » est remplacée par une barre de progression colorée (places pourvues / capacité).
- **Rappels automatiques** : une tâche planifiée horaire envoie les rappels J-2/J-1/jour J, distincts du rappel manuel ponctuel.
- **Emails** : structure HTML complète (carte blanche sur fond gris, texte d'aperçu avant ouverture) sur tous les templates ; tutoiement unifié côté bénévole.
- **Monitoring d'erreurs (Sentry)** ajouté. <!-- interne -->

---

## [1.0.0-beta.5] — 2026-05-01

### Ajouté

- **Charte du bénévole** : texte par défaut éditable dans les paramètres de l'organisation (`/admin/settings/admins`) ; présenté aux bénévoles lors de l'inscription sous forme de modal « Lire la charte » avec case à cocher obligatoire ; le texte peut être personnalisé par organisation ou réinitialisé au texte par défaut
- **Page profil super admin** (`/super-admin/profile`) : modification de l'email et du mot de passe avec vérification du mot de passe courant
- **Email de bienvenue admin** : envoyé automatiquement après l'activation du compte (premier mot de passe défini via le lien d'invitation)
- **Bouton « Tester l'envoi d'email »** sur la page d'invitations : envoie un email de test à l'adresse de son choix pour vérifier la configuration SMTP
- **Page d'accueil publique** (`www.benevol.app`) : landing page avec présentation des fonctionnalités pour les visiteurs sans sous-domaine d'organisation
- **Règles de mot de passe renforcées** : 10 caractères minimum, majuscule, minuscule, chiffre et caractère spécial obligatoires ; indicateur visuel en temps réel sur tous les formulaires de création/modification de mot de passe

### Amélioré

- **Ton des emails bénévoles** : tous les templates sont réécrits avec un ton chaleureux et personnel — salutation `Hello [Prénom] !`, tutoiement, signature `Un grand M E R C I, une grosse bise et à très vite !`
- **Session bénévole depuis l'email** : cliquer sur le lien « Gérer mes inscriptions » d'un email stocke le token en `localStorage` ; si le bénévole navigue ensuite vers la page de l'événement, il est automatiquement reconnu (créneaux en vert, nom affiché) ; le lien « Retour à l'accueil » pointe désormais directement sur la page de l'événement
- **URLs dans les emails** : les liens `/my/[token]` utilisent désormais le sous-domaine de l'organisation (`cdp.benevol.app/my/…`) au lieu de `www.benevol.app/my/…`, dans tous les types de notifications (confirmation, rappels J-2/J-1/JJ, rappel manuel, modification de créneau)
- **Email de notification admin (nouvelle inscription)** : les créneaux incluent maintenant le rôle, le libellé (si différent du rôle), la date et les horaires

### Corrigé

- **`showSchedule` non sauvegardé** lors de la création d'un événement (le champ était absent du schéma Zod de validation côté API)
- **Lien « Gérer → » super admin** redirigait vers `0.0.0.0:3000` au lieu du domaine public (utilisation de `x-forwarded-host` à la place de `req.url`)
- **Page `accept-invite`** redirigée vers le login par le middleware (ajout d'une exception pour les pages admin publiques)

---

## [1.0.0-beta.4] — 2026-05-01

### Ajouté

- **Slug d'organisation modifiable** : le super admin et les admins peuvent changer le slug de leur organisation depuis les paramètres ; les anciens slugs sont archivés dans `OrgSlugHistory` et redirigent automatiquement vers le slug courant ; un avertissement est affiché si des événements publiés risquent d'avoir des liens cassés ; suppression individuelle des anciens slugs possible
- **Contexte d'organisation dans le super-admin** : cliquer sur « Gérer → » depuis la fiche d'une organisation pose un cookie `sa-org-id` ; les routes `/admin/*` adoptent automatiquement cette organisation ; la navbar admin affiche le nom de l'organisation courante
- **Édition inline dans le super-admin** : nom et slug modifiables directement depuis la fiche organisation sans formulaire séparé

### Amélioré

- **URLs super-admin** : les fiches d'organisations utilisent désormais le slug (`/super-admin/organizations/mon-org`) au lieu de l'identifiant interne
- **Formulaire événement** : `endDate` se positionne automatiquement sur `startDate` lors de la première saisie ; la section « Spectacles » ne se déverrouille qu'une fois les deux dates renseignées ; la durée par défaut d'un spectacle est de 90 minutes (`startTime` + 90 min → `endTime` auto-remplie)
- **Timeline — couleurs des rôles personnalisés** : les rôles non reconnus dans la palette standard reçoivent une couleur déterministe calculée par hash du nom (8 teintes disponibles : indigo, cyan, lime, rose, fuchsia, sky, emerald, yellow)
- **Timeline — durée par défaut des créneaux** : passage de 60 à **90 minutes** lors de la création d'un nouveau créneau
- **Timeline publique** : les bandes de spectacles sont à nouveau visibles en fond sur toutes les lignes de rôle

### Corrigé

- **URL publique sur localhost** : `eventPublicUrl` inclut désormais `?org=<slug>` en l'absence de sous-domaine ; le middleware lit ce paramètre comme `x-org-slug` en fallback ; l'API `/api/public/[eventSlug]` lit également `?org=` si le header est absent
- **Timeline — décalage à 0h** : un créneau avec `endTime = "00:00"` (overnight) tirait l'échelle jusqu'à minuit ; corrigé par `toMinEnd(end, start)` qui ajoute 1 440 min quand `end ≤ start`

---

## [1.0.0-beta.3] — 2026-04-30

### Ajouté

- **Architecture multi-tenant SaaS** : chaque organisation dispose d'un espace isolé — événements, membres et admins sont cloisonnés via un client Prisma étendu (`getOrgClient`) qui injecte `organizationId` dans tous les reads
- **URLs incluant le slug d'organisation** : `/{orgSlug}/{eventSlug}` — les anciens chemins `/events/[slug]` ont été supprimés
- **Super admin** (`/super-admin`) : interface dédiée pour créer et gérer les organisations ; rôle `super_admin` protégé au niveau middleware
- **Gestion de l'équipe admin** (`/admin/settings/admins`) : inviter un nouvel admin par email (lien d'activation à durée limitée), retirer un admin, lister les invitations en attente
- **Onboarding par lien sécurisé** : le premier admin d'une organisation crée son mot de passe via un token révocable (valide 7 jours) — aucun mot de passe temporaire transmis en clair
- **Pool de membres** (`/admin/members`) : répertoire de bénévoles connus de l'organisation, indépendant des inscriptions ; champs libres (tags, notes internes), import CSV/TSV, recherche et filtre par tag
- **Invitations tokenisées** (`/admin/events/[id]/invitations`) : envoi batch vers des membres sélectionnés par nom ou tag ; chaque invitation génère une URL qui pré-remplit le formulaire ; vue d'état (inscrit / pas encore répondu) avec relance ciblée
- **Communications automatiques** : rappels J-2, J-1 et Jour J envoyés par cron (`/api/cron/reminders`) ; notification automatique aux bénévoles en cas d'annulation ou de modification d'horaires d'un créneau
- **Rappel manuel** : bouton d'envoi depuis la page de l'événement ; chaque bénévole reçoit un seul email regroupant tous ses créneaux
- **QR code** : téléchargement PNG/SVG du QR code de la page publique depuis la page admin de l'événement
- **20 tests d'isolation cross-tenant** (Vitest) — vérifient qu'aucune route ne divulgue ou ne modifie des données d'une autre organisation <!-- interne -->

### Modifié

- Middleware reécrit pour protéger `/super-admin/*` (rôle requis) en plus de `/admin/*` (authentification) <!-- interne -->
- Lien « Vue publique » affiché uniquement si l'événement est publié
- Migration Prisma unique (squashée) : les 6 migrations précédentes ont été consolidées en une seule migration `init` <!-- interne -->
- Variables d'environnement : `ADMIN_EMAIL` / `ADMIN_PASSWORD` supprimées ; `CRON_SECRET` ajouté <!-- interne -->

---

## [1.0.0-beta.2] — 2026-04-26

### Ajouté

- **Réordonnancement des postes** : panneau glisser-déposer dans la gestion des créneaux pour changer l'ordre des lignes dans les timelines admin et publique ; persisté via le champ `displayOrder` sur les créneaux (API `POST /api/admin/events/[id]/reorder-roles`)
- **Navigation créneaux → inscriptions** : bouton « Voir les inscriptions → » dans le popover de chaque créneau ; la page d'inscriptions s'ouvre pré-filtrée sur le créneau et le rôle correspondants
- **Détection de conflits contextuelle à l'ajout manuel** : le message d'avertissement n'apparaît que si le créneau sélectionné dans le formulaire est déjà pris ou en conflit horaire avec les inscriptions existantes du bénévole identifié par son email

### Amélioré

- **Affichage des places libres** : les barres de la timeline admin affichent désormais `X/Y · Z libre(s)` ; la vue liste montre une sous-ligne colorée (vert = places disponibles, orange = complet)
- **Saisie des horaires** : les champs Début/Fin acceptent une saisie partielle (`9` → `09:00`, `14:3` → `14:30`, `21` → `21:00`)
- **Ordre des rôles** : les deux timelines (admin et publique) respectent le `displayOrder` des créneaux pour l'ordre des lignes de rôle

### Corrigé

- Le champ `displayOrder` est désormais transmis depuis l'API publique jusqu'au composant `DayTimeline`, garantissant que l'ordre admin se reflète côté bénévole

---

## [1.0.0-beta.1] — 2026-04-24

Première version bêta publique. Toutes les fonctionnalités de base sont stables.

### Fonctionnalités

- **Timeline publique** : planning Gantt interactif par jour avec scroll horizontal sur mobile
  - Positionnement pixel-exact avec échelle dynamique (calculée à partir du créneau le plus large)
  - Sélection multi-créneaux, détection de conflits en temps réel, affichage du statut
  - Bandes colorées en fond pour le programme des spectacles
- **Inscription bénévole** : formulaire avec validation, consentement, session persistante via `localStorage`
- **Gestion personnelle** (`/my/[token]`) : consultation et annulation de ses inscriptions
- **Interface admin** : CRUD complet des événements, créneaux et programme des spectacles
  - Publication / dépublication en un clic
  - Pré-sélection automatique du créneau filtré lors d'un ajout manuel
  - Suivi des inscriptions en temps réel
- **Exports** : Excel (`.xlsx`) et PDF avec Gantt + tableaux récapitulatifs
- **Emails** : confirmation bénévole + notification admin optionnelle (SMTP Nodemailer)
- **Auth admin** : NextAuth v5, credentials, session sécurisée
- **CI/CD** : GitHub Actions → build Docker → déploiement Kubernetes automatique <!-- interne -->

### Infrastructure

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4
- PostgreSQL 16 + Prisma 7 (driver `@prisma/adapter-pg`)
- Node.js 22 requis
- Déploiement Docker Compose et Kubernetes (manifestes inclus)
- Init container pour migrations automatiques au démarrage

### Corrections notables

- Scroll horizontal mobile : passage d'un positionnement en % (qui ne scrollait pas) à des pixels absolus
- Auth derrière reverse proxy : `AUTH_TRUST_HOST` + `AUTH_URL` pour NextAuth v5
- Token Prisma WASM dans l'image Docker standalone <!-- interne -->
- Contrainte unique `editToken` lors d'inscriptions multi-créneaux

---

## [0.1.0] — 2026-04-10

MVP initial : schéma BDD, page publique, interface admin, exports, CI/CD.
