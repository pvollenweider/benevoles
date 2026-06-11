# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Unreleased]

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
