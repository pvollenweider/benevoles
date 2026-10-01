# API

Routes HTTP de l'application (Next.js App Router, `src/app/api/**/route.ts`). L'interface web les utilise ; elles ne constituent pas une API publique versionnée et peuvent changer d'une version à l'autre.

Les erreurs renvoient un JSON `{ "error": "..." }`. Codes courants : `400` données invalides, `401` non authentifié, `403` accès refusé, `404` introuvable, `409` conflit ou état incompatible (créneau complet, chevauchement, événement non archivé, liste modifiée entre-temps, fenêtre d'inscription fermée, super admin sans organisation choisie), `410` lien d'invitation expiré, `429` trop de requêtes, `503` base de données injoignable (`/api/health`).

L'authentification et l'isolation entre organisations sont décrites dans [roles-et-permissions.md](roles-et-permissions.md). Les colonnes « Accès » utilisent ces abréviations :

| Abréviation | Signification |
|-------------|---------------|
| public | aucun compte ; parfois un jeton dans l'URL |
| admin | `requireOrgSession()` : session admin (organisateur ou propriétaire), données limitées à son organisation |
| propriétaire | `requireOrgSession("owner")` : réservé aux propriétaires (rôle stocké `admin`) et au super admin ; 403 pour un organisateur |
| super | `requireSuperAdmin()` : rôle `super_admin` |
| cron | `Authorization: Bearer $CRON_SECRET` ; sans `CRON_SECRET`, refusé en production, accepté depuis `localhost` en développement |

## Limites de requêtes

Les limites utilisent `rateLimit()` de `src/lib/rate-limit.ts` : fenêtre fixe, compteurs dans la table `RateLimit` partagés entre les instances, lignes expirées purgées par le nettoyage nocturne. Si la table est injoignable, la requête passe et l'erreur est signalée. Les routes publiques comptent par IP (`X-Forwarded-For` posé par Traefik), les envois et imports admin par organisation ; au-delà, `429`. La connexion et la vérification du mot de passe actuel ont leur propre budget sur 15 minutes (`src/lib/admin-session.ts`) : 10 échecs par adresse email saisie et 30 par IP pour la connexion, 5 par compte et 20 par IP pour le mot de passe actuel. Les valeurs de chaque route figurent dans les tableaux ci-dessous.

## Public

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/public/events` | GET | public | Événements publiés **et répertoriés** de l'organisation de l'hôte (`x-org-slug`, ou `?org=`) ; 404 sans organisation |
| `/api/public/[eventSlug]` | GET | public | Un événement publié de l'organisation courante (sous-domaine ou `?org=`), avec la liste de ses pages personnalisées (titre, slug) et ses questions d'inscription actives |
| `/api/public/registrations` | POST | public | Inscription à un ou plusieurs créneaux (liste d'attente si le créneau est complet). Limitée à 20 requêtes par heure et par IP |
| `/api/public/registrations/link` | POST | public | « Je n'ai plus mon lien » (#376) : à partir d'un email, renvoie le lien personnel de chaque événement de l'organisation courante où l'adresse a une inscription en cours ; même réponse que l'adresse soit connue ou non. 5 requêtes par heure et par IP, 3 envois par heure et par bénévole |
| `/api/public/registrations/[token]` | GET, DELETE | public (jeton) | `GET` : inscriptions en cours du bénévole sur l'événement, liste d'attente, offres et demandes comprises (10 requêtes par heure et par IP). `DELETE` : retire une place, une demande en attente de validation, une entrée de liste d'attente ou une offre (5 requêtes par heure et par IP) ; seul le retrait d'une place, d'une demande ou d'une offre libère une place pour la personne suivante |
| `/api/public/registrations/[token]/availability` | PATCH | public (jeton) | Le bénévole enregistre ses disponibilités générales (`availabilityPeriods`, `availabilityNote` ≤ 140) ; lien actif requis ; 10 requêtes par heure et par IP |
| `/api/public/registrations/[token]/resend-link` | POST | public (jeton) | Renvoie par email le lien personnel depuis la page du bénévole (#376) ; 10 requêtes par heure et par IP, 3 envois par heure et par bénévole |
| `/api/public/registrations/[token]/calendar` | GET | public (jeton) | Fichier `.ics` des créneaux confirmés de l'événement, ou d'un seul avec `?registration=<id>` (#480) ; liste d'attente, offres et demandes exclues ; 30 requêtes par heure et par IP |
| `/api/public/member-invite/[token]` | GET | public (jeton) | Données de pré-remplissage d'une invitation (prénom, nom, email, téléphone, postes réservés ouverts) ; l'invitation doit appartenir à l'événement (`?slug=`) et à l'organisation de l'hôte ; même 404 « Lien invalide » pour tout refus ; 30 requêtes par heure et par IP |
| `/api/public/waitlist/[token]/confirm` | GET, POST | public (jeton) | Consulter puis confirmer une place de liste d'attente ; 10 requêtes par heure et par IP |
| `/api/public/leader/[token]` | GET | public (jeton) | Roster lecture seule d'un responsable de secteur : bénévoles inscrits ou en liste d'attente sur son poste (#186) ; 30 requêtes par heure et par IP |
| `/api/public/push` | GET, POST, DELETE | public | Clé VAPID publique, abonnement et désabonnement push ; abonnement et désabonnement : 10 requêtes par heure et par IP |
| `/api/public/forgot-password` | POST | public | Envoie un email de réinitialisation du mot de passe admin ; 5 requêtes par heure et par IP |
| `/api/public/reset-password` | POST | public (jeton) | Définit un nouveau mot de passe (72 octets UTF-8 au plus, règles de `src/lib/password.ts`) ; ferme toutes les sessions ouvertes auparavant (`sessionVersion`). Limitée à 10 requêtes par heure et par IP |
| `/api/public/product-updates/unsubscribe` | GET | public (jeton signé) | Désabonnement des communications de nouveautés produit (#200) ; redirige vers `/product-updates/unsubscribed` |

## Authentification

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/auth/[...nextauth]` | GET, POST | public | Endpoints NextAuth (connexion, session, déconnexion) |
| `/api/admin/accept-invite` | GET, POST | public (jeton) | `GET` : vérifie le lien d'invitation sans le consommer (404 invalide, 410 expiré ; 30 requêtes par heure et par IP). `POST` : active le compte admin invité et définit son mot de passe |

## Admin (organisation)

Toutes ces routes sont ouvertes aux organisateurs, sauf les méthodes marquées « (propriétaire) ». La matrice complète est `PERMISSIONS` dans `src/lib/permissions.ts` ; un test vérifie qu'elle couvre chaque route et chaque méthode.

| Route | Méthodes | Rôle |
|-------|----------|------|
| `/api/admin/events` | GET, POST | Lister, créer des événements. La création ignore `publicStatus` : toujours un brouillon répertorié. |
| `/api/admin/events/[id]` | GET, PATCH, DELETE (propriétaire) | Lire, modifier, supprimer définitivement. `PATCH` : archivage par `publicStatus: "archived"` ; `publicStatus: "published"` refusé (409) sans créneau actif ; `isListed` (booléen strict, #414), `false` = accessible par lien seulement. `DELETE` : exige un événement archivé (409 sinon) et `{ "confirmTitle": "<titre>" }` (400 sinon) ; créneaux, inscriptions, invitations et le reste de l'événement supprimés en cascade |
| `/api/admin/events/from-template` | POST | Créer un brouillon depuis un modèle : `templateId` (`festival`, `buvette`, `sport`, `fete`, `chantier`), `title` (facultatif), `startDate` (`YYYY-MM-DD`). Renvoie `{ id, shiftCount }` (201). |
| `/api/admin/events/[id]/duplicate` | POST | Dupliquer un événement |
| `/api/admin/events/[id]/preview` | GET, POST | Aperçu comme un bénévole, brouillons compris (#370). `GET` : mêmes données que `/api/public/[eventSlug]`, plus `publicStatus`. `POST` (`firstName`, `lastName`, `shiftIds`) : email de confirmation rendu avec le vrai modèle (lien personnel factice) et créneaux qui passeraient en liste d'attente ; rien n'est enregistré ni envoyé |
| `/api/admin/events/[id]/reorder-roles` | POST | Réordonner les postes |
| `/api/admin/events/[id]/roles/[roleName]` | PATCH, DELETE | `PATCH`, sur tous les créneaux du poste : `name`, `colorKey`, `capacity` (même nombre de places sur les créneaux actifs, jamais sous les inscrits confirmés, `keptHigher` dans la réponse), `maxPerVolunteer` (1 à 100 ou `null`), `reservedTags` (10 au plus : poste réservé aux membres portant l'une de ces étiquettes, #470). `DELETE` : supprime le poste (ses créneaux sont annulés, les inscrits prévenus par email) |
| `/api/admin/events/[id]/log` | GET | Journal de l'événement : filtres (`entityType`, `entityId`, `actorType`, `actorId`, `action` en préfixe, `since`, `until`), pagination (`cursor`, `limit`), ou chaîne causale d'une entrée (`chainOf`, avec le fuseau horaire de l'organisation pour le récit) |
| `/api/admin/events/[id]/log/candidates` | GET | Éléments proposés dans les onglets Rejouer (`?kind=replay` : entités avec plusieurs entrées) et Récit (`?kind=story` : chaînes d'au moins deux entrées) |
| `/api/admin/events/[id]/log/baseline` | POST | « Générer l'état initial » : une entrée de départ par créneau et inscription qui n'a encore aucune entrée ; sans effet la deuxième fois |
| `/api/admin/events/[id]/pages` | GET, POST | Lister, créer une page personnalisée de l'événement (titre, contenu Markdown) ; slug généré depuis le titre et dédoublonné |
| `/api/admin/events/[id]/pages/[pageId]` | PATCH, DELETE | Modifier, supprimer une page |
| `/api/admin/events/[id]/pages/reorder` | POST | Réordonner les pages (`{ "pageIds": [...] }`, ordre = position dans le tableau) |
| `/api/admin/events/[id]/sector-leaders` | GET, POST | Lister, désigner un·e responsable d'un poste (`roleName`) ; envoie automatiquement le lien d'accès par email (#186) |
| `/api/admin/events/[id]/sector-leaders/[leaderId]` | DELETE | Retirer un·e responsable |
| `/api/admin/events/[id]/milestones` | GET, POST | Lister, créer un jalon (titre, échéance) (#189) |
| `/api/admin/events/[id]/milestones/[milestoneId]` | PATCH, DELETE | Modifier (dont cocher `done`), supprimer un jalon |
| `/api/admin/events/[id]/qr` | GET | QR code de la page publique ; `?format=svg` pour le SVG, PNG par défaut |
| `/api/admin/events/[id]/export/archive` | GET | Archive JSON complète de l'événement (#384) : réglages, créneaux, inscriptions, réponses, pages, responsables, jalons, journal ; aucun jeton |
| `/api/admin/events/[id]/export/badges` | GET | Badges imprimables des bénévoles de l'événement (#190) |
| `/api/admin/events/[id]/export/pdf` | GET | Page HTML de l'export (planning, récap, bénévoles) destinée à l'impression en PDF depuis le navigateur |
| `/api/admin/events/[id]/export/sheets/[view]` | GET | Feuille imprimable HTML noir et blanc : `day`, `role`, `phones`, `attendance`, `individual` (404 pour une autre vue). |
| `/api/admin/events/[id]/export/attendance` | GET | Feuille de présence CSV (UTF-8 avec BOM, point-virgule) : une ligne par inscription confirmée, présent oui/non, heure du pointage. |
| `/api/admin/events/[id]/message` | POST | Message ciblé : `audience` (`{kind:"event"}`, `{kind:"role",roleName}`, `{kind:"shift",shiftId}`, `{kind:"waitlist"}`, `{kind:"invited_without_shift"}` : membres invités sans créneau confirmé), `subject` (≤ 120), `message` (≤ 2000), `push` (notification push en plus de l'email, #468), `dryRun` (compte et aperçu sans envoi). Un email par personne via la file d'envoi ; 30 envois par heure et par organisation |
| `/api/admin/events/[id]/messages/[messageId]/resend-failed` | POST | Remet en file les seuls emails en échec d'un message ciblé (#467) ; un deuxième appel ne trouve plus rien |
| `/api/admin/events/[id]/send-reminder` | POST | Rappel manuel à tous les inscrits |
| `/api/admin/events/[id]/invitations` | GET, POST | État des invitations, envoi d'invitations |
| `/api/admin/events/[id]/invitations/remind` | POST | Relance des membres non inscrits |
| `/api/admin/events/[id]/invitations/test-email` | POST | Email de test |
| `/api/admin/events/[id]/questions` | GET, POST | Questions d'inscription de l'événement (#483), actives et dans l'ordre ; types `text`, `yesno`, `single`, `multiple` ; 5 au plus (409 au-delà) |
| `/api/admin/events/[id]/questions/[questionId]` | PATCH, DELETE | Modifier une question (409 si la modification touche son type ou une option déjà choisie) ; supprimer : effacée sans réponse, archivée sinon |
| `/api/admin/events/[id]/questions/reorder` | POST | Nouvel ordre des questions actives (liste complète des ids ; 409 si la liste a changé) |
| `/api/admin/shifts` | POST | Créer un créneau. Infos pratiques facultatives : `locationDetails`, `contactName` (≤ 80), `contactPhone` (≤ 40), `instructions` (≤ 500). `startTime` et `endTime` au format `HH:MM` de `00:00` à `23:59` (400 sinon, avec un message) et différents l'un de l'autre ; une fin plus petite que le début désigne le lendemain matin |
| `/api/admin/shifts/series` | POST | Créer une série de créneaux qui se suivent : `eventId`, `roleName`, `date`, `startTime`, `endTime`, `slotMinutes` (≥ 15), `breakMinutes` (0–240), `capacity`, et les options d'un créneau (`label`, `waitlistEnabled`, `minAge`…). Tous créés dans une transaction ; 48 au plus ; renvoie la liste (201). |
| `/api/admin/shifts/[id]/duplicate` | POST | Copie du créneau juste après lui (même durée, tous réglages, ouvert, sans inscriptions) ; renvoie le créneau créé (201). |
| `/api/admin/shifts/[id]` | PATCH, DELETE | Modifier, supprimer un créneau. Mêmes règles pour `startTime` et `endTime` quand ils sont fournis |
| `/api/admin/registrations` | POST | Ajout manuel d'une inscription |
| `/api/admin/registrations/[id]` | PATCH, DELETE | Modifier, annuler une inscription |
| `/api/admin/registrations/[id]/decision` | POST | Accepter ou refuser une demande sur un créneau « Sur validation » (#484) : `{ "decision": "accept" \| "refuse", "note"? }` ; l'inscription passe en `active` ou `refused` |
| `/api/admin/registrations/[id]/resend-link` | POST | Renvoyer au bénévole son lien personnel de gestion (`/my/[token]`) ; il donne accès à toutes ses inscriptions actives de l'événement |
| `/api/admin/events/[id]/registrations/bulk` | POST | Action groupée sur une sélection d'inscriptions de l'événement : `cancel`, `make_leader`, `resend_link`, `check_in`, `undo_check_in` (présence des inscriptions confirmées, #399). Tout ou rien si une inscription n'appartient pas à l'événement ; renvoie `{ done, changedIds, skipped }` |
| `/api/admin/members` | GET, POST | Lister, créer des membres. Disponibilités facultatives : `availabilityPeriods` (`morning` / `afternoon` / `evening`), `availabilityNote` (≤ 140). Email déjà utilisé dans l'organisation : 409 |
| `/api/admin/members/[id]` | PATCH, DELETE | Modifier, supprimer un membre |
| `/api/admin/members/export` | GET | Tous les membres de l'organisation en CSV (#384), inactifs compris |
| `/api/admin/members/import/preview` | POST | Analyse un fichier CSV ou xlsx sans rien écrire (#464) ; 30 analyses par heure et par organisation |
| `/api/admin/members/import` | POST | Import CSV ou xlsx (multipart, `onDuplicate`) du fichier analysé par `/preview` (409 si ce n'est pas le même) ; 10 imports par heure et par organisation |
| `/api/admin/settings/organization` | PATCH (propriétaire) | Nom, slug, charte du bénévole, assurance RC, titre de la page publique (`publicTitle`, 2 à 100 caractères, vide = « Bénévoles »), fuseau horaire (`timeZone`, nom IANA, vide = défaut de la plateforme), masquage de la liste « Premiers pas » (`onboardingDismissed`) |
| `/api/admin/settings/organization/slugs` | GET, DELETE (propriétaire) | Historique des slugs |
| `/api/admin/settings/admins` | GET, POST (propriétaire) | Équipe admin, invitation d'un admin |
| `/api/admin/settings/admins/[id]` | PATCH (propriétaire), DELETE (propriétaire) | Changer le niveau d'un admin (`role` : `admin` ou `organizer`, #469), retirer un admin. L'organisation garde au moins un propriétaire actif ; on ne peut pas se retirer soi-même (400) |
| `/api/admin/settings/message-templates` | GET, POST | Modèles de message de l'organisation (#482) ; 20 au plus (409 au-delà) |
| `/api/admin/settings/message-templates/[id]` | PATCH, DELETE | Modifier, supprimer un modèle |
| `/api/admin/settings/notifications` | GET, PATCH (propriétaire) | Réglages des emails (#381) : rappels J-2 / J-1 / Jour J, email aux admins à chaque inscription (`signupAdminEmail`), adresse de réponse (`replyToEmail`). Un changement est consigné dans le journal de l'organisation |
| `/api/admin/settings/notifications/[id]/retry` | POST | Remet en file une notification de l'organisation en échec définitif (#382) |
| `/api/admin/settings/notifications/test` | POST | Email de test à l'admin qui le demande, avec le gabarit des messages aux bénévoles ; 5 par heure et par organisation |
| `/api/admin/settings/password` | POST | Changer son mot de passe (page « Mon compte ») : `currentPassword` obligatoire ; nouveau mot de passe de 72 octets UTF-8 au plus. `400` si le mot de passe actuel est faux ou si une règle n'est pas respectée (`details.errors`) ; `429` après 5 échecs sur le compte ou 20 depuis l'IP en 15 minutes. Ferme toutes les autres sessions (`sessionVersion`) |
| `/api/admin/settings/activity` | GET | Journal d'activité de l'organisation : membres et comptes admin créés/modifiés/retirés (#194) |
| `/api/admin/settings/activity/export` | GET | Journal d'activité complet de l'organisation en CSV (#384), du plus ancien au plus récent |

## Super admin

| Route | Méthodes | Rôle |
|-------|----------|------|
| `/api/super-admin/organizations` | GET, POST | Lister, créer des organisations (renvoie le lien d'invitation du premier admin) |
| `/api/super-admin/organizations/[id]` | GET, PATCH, DELETE | Lire, modifier (nom, slug, activation), supprimer |
| `/api/super-admin/organizations/[id]/send-invite` | POST | Envoyer l'email d'invitation aux admins de l'organisation qui n'ont pas encore activé leur compte ; `{ "adminId" }` facultatif pour un seul admin |
| `/api/super-admin/use-org/[id]` | GET | Enregistre l'organisation dans le cookie `sa-org-id` puis redirige vers `/admin/events` |
| `/api/super-admin/profile` | PATCH | Changer l'email ou le mot de passe du super admin : `currentPassword` obligatoire, mêmes règles et même limite d'échecs (`429`) que `/api/admin/settings/password` ; un nouveau mot de passe ferme toutes les autres sessions |
| `/api/super-admin/product-updates` | GET | Historique des envois, nombre d'administrateurs abonnés (#200) |
| `/api/super-admin/product-updates/send` | POST | Diffuser une communication à tous les administrateurs actifs et abonnés |
| `/api/super-admin/product-updates/test` | POST | Envoyer un test à soi-même uniquement, non enregistré dans l'historique |

## Cron et supervision

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/cron/reminders` | GET, POST | cron | Rappels J-2, J-1, Jour J ; expiration des offres de liste d'attente |
| `/api/cron/cleanup` | GET, POST | cron | Purge RGPD |
| `/api/cron/heartbeat` | POST | cron | Battement des tâches hors application (#383) : `{ job, ok, error?, summary? }`, `job` parmi `reminders`, `cleanup`, `backup`, `backup-offsite`, `restore-test` ; alimente la page `/super-admin/health` |
| `/api/health` | GET | public | `200 { "ok": true }` si la base répond, sinon `503` |

Les sondes Kubernetes (`k8s/deployment.yaml`) interrogent `/api/health`.
