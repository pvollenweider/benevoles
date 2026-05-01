# Fonctionnalités

Liste exhaustive des fonctionnalités de l'application.

---

## Côté public (bénévoles)

### Page d'accueil

- Liste des événements publiés avec titre, dates et lieu
- Accès direct à la page d'inscription de chaque événement

### Page d'inscription (`/{orgSlug}/{eventSlug}`)

#### Timeline Gantt

- Planning visuel par jour sous forme de **timeline Gantt scrollable**
  - Échelle horizontale calculée dynamiquement à partir du créneau le plus large
  - Scroll tactile fonctionnel sur mobile
  - Une ligne par rôle ; libellé spécifique affiché sous la barre quand il diffère du rôle
  - Bandes colorées en fond représentant le programme des spectacles
- **Sélection multi-créneaux** par clic sur les barres
- **Détection de conflits en temps réel** : les créneaux qui se chevauchent avec une sélection ou une inscription existante sont grisés automatiquement
- Affichage du statut de chaque créneau : ouvert, complet, fermé
- Récapitulatif des créneaux sélectionnés sous le planning
- Bouton d'action fixe en bas d'écran

#### Pré-remplissage via invitation

- Si l'URL contient un `?token=` (lien d'invitation membre), le formulaire est pré-rempli avec les informations du membre (prénom, nom, email, téléphone)

#### Session persistante

- Reconnexion automatique via `localStorage` si le bénévole revient dans le même navigateur
  - Nom affiché en haut de page, bouton « Quitter la session »
  - Créneaux existants chargés en vert, conflits mis en évidence automatiquement

### Formulaire d'inscription

- Champs : prénom, nom, email, téléphone (optionnel), commentaire (optionnel)
- Pré-remplissage automatique si une session ou un token membre est reconnu
- Case de consentement obligatoire
- Validation côté client et côté serveur (Zod)

### Confirmation et gestion (`/my/[token]`)

- Page de succès avec lien personnel de gestion
- Envoi automatique d'un email de confirmation avec récapitulatif des créneaux inscrits
- Page de gestion : liste de toutes les inscriptions actives du bénévole pour l'événement
- Annulation individuelle d'un créneau depuis la page de gestion

---

## Côté administrateur (`/admin`)

### Authentification

- Connexion par email + mot de passe (hashé bcrypt, NextAuth v5)
- Déconnexion
- Onboarding par lien sécurisé : le super admin crée un compte admin et envoie un lien d'invitation avec token révocable (validité 7 jours) ; le mot de passe est créé à la première connexion

### Isolation multi-tenant

- Chaque admin ne voit et ne peut modifier que les données de son organisation
- Scoping automatique via un client Prisma étendu (`getOrgClient`) qui injecte `organizationId` dans tous les reads
- Middleware Next.js protège les routes `/admin/*` (authentification) et `/super-admin/*` (rôle `super_admin`)

### Gestion des événements

- Création, édition et suppression d'événements
- Champs : titre, slug, dates, lieu, description, instructions publiques, message de confirmation
- **Publication / dépublication** en un clic (`draft` → `published`)
- Vue de synthèse : créneaux, places totales, inscrits, places restantes
- Lien direct vers la vue publique (affiché uniquement si l'événement est publié)
- QR code de la page publique (formats PNG et SVG téléchargeables)

### Programme des spectacles

- Ajout, édition et suppression de plages de spectacles par jour
- Sauvegarde automatique avec délai (debounce)
- Affichage en fond coloré sur la timeline publique et dans les exports

### Gestion des créneaux (`/admin/events/[id]/shifts`)

- Ajout de créneaux : rôle, libellé, date, horaires, capacité, statut, ordre d'affichage
  - Saisie des horaires tolérante : `9` → `09:00`, `14:3` → `14:30`
  - Fin automatiquement fixée à start + 1 h si non renseignée
- Icônes colorées par rôle (palette prédéfinie avec correspondance automatique)
- Autocomplétion des rôles existants
- Modification, suppression et changement de statut : ouvert → fermé → complet → annulé
- **Réordonnancement des postes** : panneau glisser-déposer pour changer l'ordre des lignes dans toutes les timelines, persisté via `displayOrder`
- **Vue timeline** (par jour) et **vue liste** (tableau plat) commutables
- Popover au clic sur un créneau : éditer libellé, capacité, statut — bouton direct vers les inscriptions filtrées sur ce créneau

### Suivi des inscriptions (`/admin/events/[id]/registrations`)

- Vue tabulaire : bénévole, créneau, horaires, commentaire, source, date
- Annulation d'une inscription individuelle
- **Filtres cumulables** : recherche texte, filtre par poste, filtre par créneau
- Accès direct depuis un créneau (timeline admin) : pré-filtrage automatique
- **Ajout manuel** avec détection de conflits

### Gestion des membres (`/admin/members`)

Pool de bénévoles connus de l'organisation (indépendant des inscriptions) :

- Création, édition et désactivation de membres
- Champs : prénom, nom, email, téléphone, tags libres, notes internes
- Recherche par texte et filtre par tag
- Import CSV/TSV (`/admin/members/import`)

### Invitations membres (`/admin/events/[id]/invitations`)

- **Envoi batch** : sélectionner des membres par nom ou tag, envoyer des invitations en une fois
- Chaque invitation génère un **token unique** lié au membre et à l'événement ; l'URL pré-remplit le formulaire
- Le même token est réutilisé si le membre est ré-invité (pas de doublons)
- Vue d'état : invité le, ✅ inscrit (avec détail des créneaux) / ⏳ pas encore répondu
- Compteurs : total invités · inscrits · sans réponse
- **Relance ciblée** : bouton pour renvoyer un email à tous les non-inscrits, avec message optionnel personnalisable

### Communications (`/admin/events/[id]`)

#### Rappel manuel

- Champ « Message de rappel » dans l'édition de l'événement (sauvegarde auto)
- Bouton **Envoyer le rappel** sur la page de l'événement
  - Modale de confirmation avec nombre de destinataires
  - Chaque bénévole reçoit un seul email regroupant tous ses créneaux
  - Date du dernier envoi affichée

#### Rappels automatiques

Déclenchés par le cron `/api/cron/reminders` (toutes les heures) :

| Rappel | Fenêtre |
|--------|---------|
| J-2 | 47–49 h avant le début du créneau |
| J-1 | 23–25 h avant |
| Jour J | 2–4 h avant |

Idempotents : un rappel donné ne peut être envoyé qu'une seule fois par inscription (`reminderJ2Sent`, `reminderJ1Sent`, `reminderDdSent`).

#### Notifications de modification

- Annulation d'un créneau → inscriptions annulées en cascade + email à chaque bénévole impacté
- Modification des horaires d'un créneau → email aux bénévoles inscrits (opt-out disponible)

### Exports

#### Excel (`.xlsx`)

- Un onglet par jour avec Gantt : rôles × tranches de 30 minutes, noms des bénévoles dans les cellules
- Plages des spectacles en fond coloré
- Tableau récapitulatif : rôle, libellé, horaires, capacité, inscrits, liste des bénévoles
- Onglet « Inscriptions » avec toutes les données détaillées
- Bénévoles triés alphabétiquement

#### PDF (impression navigateur)

- Même structure Gantt + récapitulatif, optimisée A4 paysage
- Tableau complet des inscriptions
- Bouton « Imprimer / Enregistrer en PDF »

### Gestion de l'équipe admin (`/admin/settings/admins`)

- Liste des administrateurs de l'organisation avec statut (actif / en attente)
- **Invitation** : saisir nom + email → lien d'activation envoyé par email (token 7 jours)
- **Retrait** d'un admin (sauf soi-même et dernier admin actif)

---

## Super Admin (`/super-admin`)

Accessible uniquement aux comptes avec rôle `super_admin` (protégé au niveau middleware).

### Gestion des organisations

- Liste de toutes les organisations avec compteurs (événements, admins, membres)
- Création d'une organisation : nom, slug auto-généré, email + nom du premier admin
  - Génère un **lien d'invitation** à durée limitée (7 jours) pour le premier admin
  - Aucun mot de passe temporaire — le compte est activé lors de la première connexion
- Activation / désactivation d'une organisation

---

## Notifications email

Toutes les notifications passent par `sendNotification()` — aucun appel direct à Nodemailer dans les routes.

| Kind | Déclencheur |
|------|-------------|
| `registration_confirmation` | Inscription bénévole |
| `member_invite` | Invitation d'un membre à un événement |
| `manual_reminder` | Rappel manuel lancé par l'admin |
| `reminder_j2` | Rappel automatique J-2 (cron) |
| `reminder_j1` | Rappel automatique J-1 (cron) |
| `reminder_dd` | Rappel automatique Jour J (cron) |
| `shift_modified` | Modification des horaires d'un créneau |
| `shift_cancelled` | Annulation d'un créneau |
| `registration_cancelled` | Annulation d'une inscription publique |
| `admin_notification` | Alerte admin à chaque nouvelle inscription (optionnel) |
| `admin_invite` | Invitation d'un nouvel admin à l'équipe |

Fallback console si SMTP non configuré (développement).

---

## Infrastructure

- Next.js 16 App Router (SSR + client), Turbopack par défaut
- API REST séparée public / admin / super-admin / cron
- PostgreSQL 16 + Prisma 7 ORM (driver natif pg, migration unique squashée)
- Architecture multi-tenant : isolation par `organizationId` avec client Prisma étendu
- 20 tests d'isolation cross-tenant (Vitest) — 113 tests au total
- Déploiement Docker Compose ou image standalone
- Déploiement Kubernetes avec init container pour migrations automatiques
- CI/CD GitHub Actions : build, push image GHCR, déploiement automatique sur push `main`
