# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Unreleased]

### Ajouté

- **Renommer ou supprimer un poste** : le panneau « Gérer les postes » (ex-« Réordonner les postes ») permet, poste par poste, de renommer d'un coup tous ses créneaux (refuse un nom déjà pris par un autre poste, pour ne pas fusionner deux postes par erreur) ou de tous les annuler — même confirmation et notification des bénévoles qu'une suppression de créneau individuelle.
- **Couleur d'un poste** : un point coloré cliquable dans « Gérer les postes » ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique »), appliqué à la timeline admin et à la page publique.

### Corrigé

- **Ordre des postes qui change tout seul** : ajouter ou modifier un créneau d'un poste déjà réordonné pouvait ramener ce poste en tête de la timeline sans action volontaire de l'admin.
- **Duplication d'un événement** : les créneaux déjà supprimés de l'événement source réapparaissaient (rouverts) dans la copie.
- **Noms de postes tronqués** sur la timeline, surtout sur mobile (ex. « Chauffeurs... ») — les noms longs passent maintenant sur deux lignes.
- **Export PDF** : le planning affichait parfois la journée entière (00h–24h) au lieu de la plage réelle des créneaux ; l'ordre des postes dans l'export ne suivait pas toujours l'ordre choisi via « Gérer les postes ».
- **Menu admin sur deux lignes** pour un compte super-admin : les liens « Organisations » et « Communications admin » (ex-« Nouveautés produit ») sont regroupés dans un menu déroulant « Super Admin ».
- **Documentation** (`/doc`) : le pied de page ne reprenait pas le vrai pied de page du site (numéro de version, lien « Espace organisateur »…) ; plusieurs URLs d'exemple montraient l'organisation comme un segment de chemin (`/[org]/[évènement]`) au lieu du sous-domaine réel (`[org].benevol.app/[évènement]`) ; quelques libellés de l'interface décrits dans les guides ne correspondaient plus exactement à l'interface actuelle (inscriptions, créneaux à pourvoir, liste d'attente).

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
- **Sentry** : n'est plus actif qu'en production. Le développement local et les tests E2E chargeaient le vrai DSN depuis `.env` et envoyaient leurs erreurs (environnement `development`) dans le projet Sentry de production. Le bruit de l'extension navigateur MetaMask (« Failed to connect to MetaMask », injecté par l'extension elle-même sur chaque page, sans rapport avec l'application) est maintenant filtré, comme les autres extensions déjà exclues (`__firefox__`, DarkReader, `window.ethereum`).

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
- **Infrastructure** : les sondes Kubernetes de l'application interrogent `/api/health` avec des délais de 3 et 5 s (des échecs par délai apparaissaient pendant les déploiements) ; la sonde Postgres passe par un shell (elle journalisait `FATAL: role "root" does not exist` toutes les 5 s) ; l'image du webhook Gandi se construit de nouveau (Go 1.25) et est validée à chaque pull request.
- **Données de démonstration** : les dates du seed correspondent aux jours annoncés (samedi 13 et dimanche 14 juin 2026).
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
- **20 tests d'isolation cross-tenant** (Vitest) — vérifient qu'aucune route ne divulgue ou ne modifie des données d'une autre organisation

### Modifié

- Middleware reécrit pour protéger `/super-admin/*` (rôle requis) en plus de `/admin/*` (authentification)
- Lien « Vue publique » affiché uniquement si l'événement est publié
- Migration Prisma unique (squashée) : les 6 migrations précédentes ont été consolidées en une seule migration `init`
- Variables d'environnement : `ADMIN_EMAIL` / `ADMIN_PASSWORD` supprimées ; `CRON_SECRET` ajouté

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
- **CI/CD** : GitHub Actions → build Docker → déploiement Kubernetes automatique

### Infrastructure

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4
- PostgreSQL 16 + Prisma 7 (driver `@prisma/adapter-pg`)
- Node.js 22 requis
- Déploiement Docker Compose et Kubernetes (manifestes inclus)
- Init container pour migrations automatiques au démarrage

### Corrections notables

- Scroll horizontal mobile : passage d'un positionnement en % (qui ne scrollait pas) à des pixels absolus
- Auth derrière reverse proxy : `AUTH_TRUST_HOST` + `AUTH_URL` pour NextAuth v5
- Token Prisma WASM dans l'image Docker standalone
- Contrainte unique `editToken` lors d'inscriptions multi-créneaux

---

## [0.1.0] — 2026-04-10

MVP initial : schéma BDD, page publique, interface admin, exports, CI/CD.
