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
  - Le graphique de chaque jour occupe toute la largeur de sa carte (mise en page fluide) ; en dessous d'environ 36 px par heure, il défile horizontalement. Le texte d'une barre n'est affiché que s'il tient ; l'axe des heures repart à zéro après minuit (`00h`, `01h`…)
  - Scroll tactile fonctionnel sur mobile
  - Une ligne par rôle ; libellé spécifique affiché sous la barre quand il diffère du rôle
  - Bandes colorées en fond représentant le programme des spectacles
- **Sélection multi-créneaux** par clic sur les barres
- **Détection de conflits en temps réel** : les créneaux qui se chevauchent avec une sélection ou une inscription existante sont grisés automatiquement
- Affichage du statut de chaque créneau : ouvert, complet, fermé
- **Âge minimum** (#192) : affiché en petit sous le créneau concerné (ex. « 18+ »), informatif — le créneau reste sélectionnable (l'âge du visiteur n'est pas connu avant le formulaire) ; l'inscription est réellement bloquée à la soumission si la condition n'est pas remplie
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
- **Date de naissance** : demandée uniquement si un créneau sélectionné a un âge minimum (#192) ; jamais demandée sinon. Vérifiée côté client (message immédiat) et côté serveur (source de vérité)
- Pré-remplissage automatique si une session ou un token membre est reconnu
- **Charte du bénévole** : lien « Lire la charte » ouvre un modal avec le texte complet ; case à cocher obligatoire avant soumission
- Case de consentement RGPD obligatoire
- Validation côté client et côté serveur (Zod)

### Confirmation et gestion (`/my/[token]`)

- Page de succès avec lien personnel de gestion
- Envoi automatique d'un email de confirmation avec récapitulatif des créneaux inscrits
- Page de gestion : liste de toutes les inscriptions actives du bénévole pour l'événement
- Annulation individuelle d'un créneau depuis la page de gestion
- **Liste d'attente** : si un créneau est complet et que la liste d'attente est activée, le bénévole peut s'y inscrire (barre rayée cliquable avec sous-label « Complet · file d'attente ») ; quand une place se libère, la première personne en attente reçoit un email avec un lien de confirmation valable 24 h
- **Notifications push** : un bouton d'abonnement est proposé sur la page de succès et sur la page de gestion ; les rappels J-2, J-1 et Jour J sont alors aussi envoyés en push. Aucun push n'est envoyé si les clés VAPID ne sont pas configurées côté serveur ; les abonnements expirés sont supprimés automatiquement
- Arrivée depuis un lien email : le token est stocké en `localStorage` — le bénévole est automatiquement reconnu s'il navigue vers la page de l'événement
- Lien « Retour à l'accueil » pointe directement sur la page de l'événement

### Pages personnalisées de l'événement (`/{orgSlug}/{eventSlug}/{pageSlug}`)

- Pages statiques additionnelles créées par l'admin pour un événement, en complément des instructions publiques (ex. FAQ, accès et lieu, règlement, infos pratiques, matériel à apporter)
- Liste des pages affichée sous forme de liens sur la page de l'événement, juste après les instructions publiques
- Contenu rédigé en Markdown par l'admin (gras, listes, titres, liens, tableaux) et rendu en HTML sécurisé
- Pas de contenu personnalisé par bénévole : chaque page est la même pour tout le monde

### Espace responsable de secteur (`/leader/[token]`)

- Lien personnel envoyé par email à un·e bénévole désigné·e responsable d'un poste (ex. « Bar »)
- Lecture seule : liste des bénévoles inscrits sur ce poste (nom, email, téléphone, commentaire), groupée par créneau
- Pas de compte à créer ni de mot de passe : le lien reste valable pour toute la durée de l'événement
- Email automatique à chaque nouvelle inscription sur le poste, avec lien vers la liste à jour

### Pages légales

- Politique de confidentialité (`/legal/privacy`) et conditions d'utilisation (`/legal/terms`)

---

## Côté administrateur (`/admin`)

### Authentification

- Connexion par email + mot de passe (hashé bcrypt, NextAuth v5)
- Déconnexion
- Mot de passe oublié : email de réinitialisation (`/admin/forgot-password`, `/admin/reset-password`)
- Onboarding par lien sécurisé : le super admin crée un compte admin et envoie un lien d'invitation avec token révocable (validité 7 jours) ; le mot de passe est créé à la première connexion

### Isolation multi-tenant

- Chaque admin ne voit et ne peut modifier que les données de son organisation
- Scoping automatique via un client Prisma étendu (`getOrgClient`) qui injecte `organizationId` dans tous les reads
- Middleware Next.js protège les routes `/admin/*` (authentification) et `/super-admin/*` (rôle `super_admin`)

### Tableau de bord (`/admin/dashboard`)

- Compteurs : événements (publiés, à venir), bénévoles inscrits (et bénévoles uniques), taux de remplissage global
- Répartition des membres : total, avec email, sans email (ne peuvent pas recevoir d'invitations)

### Gestion des événements

- Création et édition d'événements
- **Archivage** en un clic (bouton « Archiver » ou statut « Archivé » du formulaire d'édition)
- **Suppression définitive**, réservée aux événements archivés : avertissement fort, nombre de créneaux / inscriptions / invitations effacés, lien vers l'export PDF pour sauvegarder l'état, confirmation en saisissant le titre (accents et casse ignorés). Les créneaux, inscriptions et invitations sont effacés avec l'événement ; les membres du pool et l'organisation sont conservés. Les bénévoles ne sont pas prévenus : pour cela, annuler d'abord les créneaux
- Champs : titre, slug, dates, lieu, description, instructions publiques, message de confirmation
- **Publication / dépublication** en un clic (`draft` → `published`)
- Vue de synthèse : créneaux, places totales, inscrits, places restantes
- Lien direct vers la vue publique (affiché uniquement si l'événement est publié)
- QR code de la page publique (formats PNG et SVG téléchargeables)

### Pages personnalisées (`/admin/events/[id]/pages`)

- Liste ordonnée de pages statiques par événement, en plus du champ unique « instructions publiques » (ex. Règlement, FAQ, Accès et lieu, Ce qu'il faut apporter)
- Création et édition : titre + contenu en Markdown (zone de texte simple) — pas d'éditeur riche, pas de variables à injecter, le contenu est identique pour tous les bénévoles
- Slug généré automatiquement depuis le titre, dédoublonné (`faq`, `faq-2`…)
- **Réordonnancement** : boutons monter/descendre (accessibles au clavier), persisté via `displayOrder`
- Suppression avec confirmation
- Chaque création, modification et suppression est tracée dans le journal d'événement ; le contenu de la page n'est jamais stocké dans le journal (seuls le titre et le slug le sont, le contenu est noté « (modifié) »)

### Responsables de secteur (`/admin/events/[id]/sector-leaders`)

- Désigner un ou plusieurs bénévoles responsables d'un poste (`roleName`, ex. « Bar »), avec autocomplétion sur les postes déjà utilisés dans l'événement
- Choix rapide « Depuis les inscrits » : sélectionner un bénévole déjà inscrit à l'événement pré-remplit nom, email et poste
- Depuis la page des inscriptions, bouton « Rendre responsable » par ligne : si le bénévole a plusieurs inscriptions sous des postes différents, le poste de la ligne cliquée est proposé par défaut, modifiable
- L'ajout envoie automatiquement un email au responsable avec son lien personnel (lecture seule, sans compte)
- Un responsable peut être retiré à tout moment (confirmation demandée)
- Chaque ajout et retrait est tracé dans le journal d'événement (poste concerné seulement, jamais le nom ni l'email en clair dans le journal)
- Le tag « responsable » est ajouté/retiré automatiquement sur la fiche du bénévole (`/admin/members`) ; retiré uniquement s'il n'est plus responsable d'aucun poste dans l'organisation

### Jalons (section sur la page de l'événement)

- Checklist simple de dates clés pour l'événement (ex. « Fermer les inscriptions », « Envoyer les rappels ») : titre, échéance, fait / pas fait
- Purement informatif, aucune automatisation (une échéance ne déclenche rien elle-même)
- Un jalon dépassé et non coché est mis en évidence
- Visible par les admins de l'organisation uniquement, pas par les responsables de secteur (#186)
- Chaque ajout, modification et suppression est tracé dans le journal d'événement

### Programme des spectacles

- Ajout, édition et suppression de plages de spectacles par jour
- Sauvegarde automatique avec délai (debounce)
- Affichage en fond coloré sur la timeline publique et dans les exports

### Gestion des créneaux (`/admin/events/[id]/shifts`)

- Ajout de créneaux : rôle, libellé, date, horaires, capacité, statut, ordre d'affichage
  - Saisie des horaires tolérante : `9` → `09:00`, `14:3` → `14:30`. Les heures valides vont de `00:00` à `23:59` ; une valeur hors plage (`26:00`, `-2:30`) est refusée avec un message au lieu d'être modifiée en silence. Un créneau qui passe minuit s'écrit avec une fin plus petite que le début (`22:00` à `02:00`, affiché « 22h–02h +1 »)
  - Fin automatiquement fixée à start + 90 min si non renseignée
- Icônes colorées par rôle (palette prédéfinie + couleur déterministe par hash du nom pour les rôles personnalisés — 8 teintes)
- Autocomplétion des rôles existants
- Modification, suppression et changement de statut : ouvert → fermé → complet → annulé
- **Liste d'attente par créneau** : case à cocher `Activer la liste d'attente` sur chaque créneau ; quand le créneau est complet, les bénévoles peuvent s'inscrire en liste d'attente ; une place libérée (annulation publique ou admin) déclenche automatiquement une offre à la première personne en attente (email + lien de confirmation, expiration 24 h)
- **Réordonnancement des postes** : panneau glisser-déposer pour changer l'ordre des lignes dans toutes les timelines, persisté via `displayOrder`
- **Vue timeline** (par jour) et **vue liste** (tableau plat) commutables
- Popover au clic sur un créneau : éditer libellé, capacité, statut — bouton direct vers les inscriptions filtrées sur ce créneau
- **Âge minimum** (optionnel, #192) : condition simple pour restreindre un créneau (ex. 18 ans pour un poste avec permis de conduire) ; affichée aux bénévoles, vérifiée à l'inscription

### Suivi des inscriptions (`/admin/events/[id]/registrations`)

- Vue tabulaire : bénévole, créneau, horaires, commentaire, source, date
- Annulation d'une inscription individuelle
- **Filtres cumulables** : recherche texte, filtre par poste, filtre par créneau
- Accès direct depuis un créneau (timeline admin) : pré-filtrage automatique
- **Ajout manuel** avec détection de conflits

### Gestion des membres (`/admin/members`)

Pool de bénévoles connus de l'organisation (source de vérité partagée avec les inscriptions) :

- Création, édition et désactivation de membres
- Champs : prénom, nom, email, téléphone, tags libres, notes internes
- **Colonnes Prénom et Nom séparées** ; tri par colonne au clic sur l'en-tête (croissant → décroissant → reset) ; changement annoncé aux lecteurs d'écran via live region
- Recherche par texte et filtre par tag
- Import CSV ou Excel (`.xlsx`) via le bouton « Importer CSV/Excel » : colonnes reconnues par leur intitulé (français ou anglais), bilan créés / mis à jour / ignorés, lignes en erreur listées

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

#### PDF (impression navigateur)

- **3 sections uniformes** : Planning (Gantt par jour), Récap par poste, Liste des bénévoles
- Aucun saut de page forcé entre les sections — rendu continu optimisé impression
- Colonne « File d'attente » conditionnelle dans le récap (affichée uniquement si au moins un créneau a des personnes en attente)
- Bouton « Imprimer / Enregistrer en PDF »

### Paramètres de l'organisation (`/admin/settings/admins`)

- **Slug de l'organisation** : modification avec validation (`[a-z0-9-]`), avertissement si des événements publiés existent (liens potentiellement cassés), redirection automatique vers le nouveau sous-domaine après changement
- **Historique des slugs** : les anciens slugs sont archivés et redirigent vers le slug courant ; suppression individuelle possible
- **Titre de la page publique** : titre modifiable affiché en haut de la page publique de l'organisation et dans l'onglet du navigateur (2 à 100 caractères, « Bénévoles » par défaut, bouton pour rétablir) ; le nom de l'organisation reste affiché au-dessus
- **Charte du bénévole** (« Convention des Bénévoles » dans l'écran) : texte par défaut éditable en texte libre ; bouton « Réinitialiser la convention par défaut » ; affiché aux bénévoles lors de l'inscription
- **Assurance RC de l'organisation** : commutateur qui choisit la variante du texte par défaut (bénévoles couverts par la RC de l'organisation, ou couverture accidents personnelle à leur charge) ; changer le commutateur remplace le texte de la zone de saisie
- **Équipe admin** : liste des administrateurs avec statut (actif / en attente)
- **Invitation** : saisir nom + email → lien d'activation envoyé par email (token 7 jours)
- **Retrait** d'un admin (sauf soi-même et dernier admin actif)

### Journal d'activité (`/admin/settings/activity`)

- Liste chronologique filtrable des changements sur les membres et les comptes admin (#194) : création, modification, désactivation d'un membre ; invitation, retrait d'un compte admin
- Indépendant du journal par événement (`EventLog`) : les membres et comptes admin sont au niveau de l'organisation, pas d'un événement
- Le contenu d'un membre (nom, email, téléphone, notes) n'apparaît jamais dans le journal, seuls les noms de champs modifiés

---

## Super Admin (`/super-admin`)

Accessible uniquement aux comptes avec rôle `super_admin` (protégé au niveau middleware).

### Gestion des organisations

- Liste de toutes les organisations avec compteurs (événements, admins, membres)
- Création d'une organisation : nom, slug auto-généré, email + nom du premier admin
  - Génère un **lien d'invitation** à durée limitée (7 jours) pour le premier admin
  - Aucun mot de passe temporaire — le compte est activé lors de la première connexion
- Activation / désactivation d'une organisation
- **Édition inline** : nom et slug modifiables directement depuis la fiche organisation
- **URLs par slug** : `/super-admin/organizations/<slug>` au lieu de l'identifiant interne
- **Basculement d'organisation** : bouton « Gérer → » bascule le contexte admin vers l'organisation choisie (cookie `sa-org-id`) sans déconnexion

### Nouveautés produit (`/super-admin/product-updates`)

- Communication manuelle des nouveautés de benevol.app aux administrateurs de toutes les organisations (#200), sans plateforme de newsletter externe
- Rédaction en Markdown (objet + contenu), aperçu en direct
- **Envoyer un test** : email uniquement à soi-même, jamais compté dans l'historique
- **Envoi** : à tous les administrateurs actifs et abonnés (`receiveProductUpdates`), confirmation demandée avant envoi ; envoi synchrone (pas de file d'attente — volume trop faible pour le justifier), échec d'un destinataire n'empêche pas les autres
- **Désabonnement** : lien signé dans chaque email, sans connexion requise ; le compte reste actif, seules les communications de nouveautés s'arrêtent
- **Historique** : liste des envois passés avec nombre de destinataires atteints

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
| `waitlist_confirmation` | Inscription en liste d'attente |
| `waitlist_offered` | Place disponible — offre avec lien de confirmation (24 h) |
| `admin_invite` | Invitation d'un nouvel admin à l'équipe |
| `admin_welcome` | Bienvenue après activation du compte admin |
| `password_reset` | Réinitialisation du mot de passe admin |

Tous les templates bénévoles utilisent un ton chaleureux et personnel (tutoiement, `Hello [Prénom] !`, signature chaleureuse).

Fallback console si SMTP non configuré (développement).

---

## Infrastructure

- Next.js 16 App Router (SSR + client), Turbopack par défaut
- API REST séparée public / admin / super-admin / cron
- PostgreSQL 16 + Prisma 7 ORM (driver natif pg, historique de migrations dans `prisma/migrations/`)
- Architecture multi-tenant : isolation par `organizationId` avec client Prisma étendu
- **Routage par sous-domaine** : `[orgSlug].benevol.app` → le middleware injecte `x-org-slug` ; fallback `?org=<slug>` pour le développement localhost
- Tests d'isolation cross-tenant (Vitest) — vérifient que chaque route admin utilise le client Prisma scopé
- Déploiement Docker Compose ou image standalone
- Déploiement Kubernetes avec init container pour migrations automatiques
- Cron jobs Kubernetes : rappels (toutes les heures), purge RGPD (`/api/cron/cleanup` : organisations et comptes admin désactivés depuis plus de 30 jours, bénévoles orphelins, jetons expirés), sauvegarde `pg_dump` chiffrée (rétention 30 jours)
- Certificat wildcard via cert-manager et le webhook DNS Gandi (`gandi-webhook/`)
- Suivi des erreurs avec Sentry (serveur, edge et navigateur)
- CI/CD GitHub Actions : build, push image GHCR, déploiement automatique sur push `main`
