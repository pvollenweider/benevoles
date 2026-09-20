# API

Routes HTTP de l'application (Next.js App Router, `src/app/api/**/route.ts`). L'interface web les utilise ; elles ne constituent pas une API publique versionnée et peuvent changer d'une version à l'autre.

Les erreurs renvoient un JSON `{ "error": "..." }`. Codes courants : `400` données invalides, `401` non authentifié, `403` accès refusé, `404` introuvable, `409` conflit (créneau complet, chevauchement), `429` trop de requêtes.

L'authentification et l'isolation entre organisations sont décrites dans [roles-et-permissions.md](roles-et-permissions.md). Les colonnes « Accès » utilisent ces abréviations :

| Abréviation | Signification |
|-------------|---------------|
| public | aucun compte ; parfois un jeton dans l'URL |
| admin | `requireOrgSession()` : session admin, données limitées à son organisation |
| super | `requireSuperAdmin()` : rôle `super_admin` |
| cron | `Authorization: Bearer $CRON_SECRET` |

## Public

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/public/events` | GET | public | Événements publiés avec leurs créneaux ouverts ou complets |
| `/api/public/[eventSlug]` | GET | public | Un événement publié de l'organisation courante (sous-domaine ou `?org=`) |
| `/api/public/registrations` | POST | public | Inscription à un ou plusieurs créneaux (liste d'attente si le créneau est complet). Limitée à 20 requêtes par heure et par IP |
| `/api/public/registrations/[token]` | GET, DELETE | public (jeton) | Consulter ou annuler une inscription |
| `/api/public/member-invite/[token]` | GET | public (jeton) | Données de pré-remplissage d'une invitation |
| `/api/public/waitlist/[token]/confirm` | GET, POST | public (jeton) | Consulter puis confirmer une place de liste d'attente |
| `/api/public/push` | GET, POST, DELETE | public | Clé VAPID publique, abonnement et désabonnement push |
| `/api/public/forgot-password` | POST | public | Envoie un email de réinitialisation du mot de passe admin |
| `/api/public/reset-password` | POST | public (jeton) | Définit un nouveau mot de passe |

## Authentification

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/auth/[...nextauth]` | GET, POST | public | Endpoints NextAuth (connexion, session, déconnexion) |
| `/api/admin/accept-invite` | POST | public (jeton) | Active un compte admin invité et définit son mot de passe |

## Admin (organisation)

| Route | Méthodes | Rôle |
|-------|----------|------|
| `/api/admin/events` | GET, POST | Lister, créer des événements |
| `/api/admin/events/[id]` | GET, PATCH, DELETE | Lire, modifier (dont l'archivage : `publicStatus: "archived"`), supprimer définitivement. `DELETE` exige un événement archivé (409 sinon) et `{ "confirmTitle": "<titre>" }` (400 sinon) ; les créneaux, inscriptions et invitations sont supprimés en cascade |
| `/api/admin/events/[id]/duplicate` | POST | Dupliquer un événement |
| `/api/admin/events/[id]/reorder-roles` | POST | Réordonner les postes |
| `/api/admin/events/[id]/qr` | GET | QR code de la page publique ; `?format=svg` pour le SVG, PNG par défaut |
| `/api/admin/events/[id]/export/pdf` | GET | Page HTML de l'export (planning, récap, bénévoles) destinée à l'impression en PDF depuis le navigateur |
| `/api/admin/events/[id]/send-reminder` | POST | Rappel manuel à tous les inscrits |
| `/api/admin/events/[id]/invitations` | GET, POST | État des invitations, envoi d'invitations |
| `/api/admin/events/[id]/invitations/remind` | POST | Relance des membres non inscrits |
| `/api/admin/events/[id]/invitations/test-email` | POST | Email de test |
| `/api/admin/shifts` | POST | Créer un créneau |
| `/api/admin/shifts/[id]` | PATCH, DELETE | Modifier, supprimer un créneau |
| `/api/admin/registrations` | POST | Ajout manuel d'une inscription |
| `/api/admin/registrations/[id]` | PATCH, DELETE | Modifier, annuler une inscription |
| `/api/admin/members` | GET, POST | Lister, créer des membres |
| `/api/admin/members/[id]` | PATCH, DELETE | Modifier, supprimer un membre |
| `/api/admin/members/import` | POST | Import CSV ou xlsx (multipart) |
| `/api/admin/settings/organization` | PATCH | Nom, slug, charte du bénévole, assurance RC, titre de la page publique (`publicTitle`, 2 à 100 caractères, vide = « Bénévoles ») |
| `/api/admin/settings/organization/slugs` | GET, DELETE | Historique des slugs |
| `/api/admin/settings/admins` | GET, POST | Équipe admin, invitation d'un admin |
| `/api/admin/settings/admins/[id]` | DELETE | Retirer un admin |
| `/api/admin/settings/password` | POST | Changer son mot de passe |

## Super admin

| Route | Méthodes | Rôle |
|-------|----------|------|
| `/api/super-admin/organizations` | GET, POST | Lister, créer des organisations (renvoie le lien d'invitation du premier admin) |
| `/api/super-admin/organizations/[id]` | GET, PATCH, DELETE | Lire, modifier (nom, slug, activation), supprimer |
| `/api/super-admin/organizations/[id]/send-invite` | POST | Envoyer l'email d'invitation aux admins de l'organisation qui n'ont pas encore activé leur compte |
| `/api/super-admin/use-org/[id]` | GET | Enregistre l'organisation dans le cookie `sa-org-id` puis redirige vers `/admin/events` |
| `/api/super-admin/profile` | PATCH | Changer l'email ou le mot de passe du super admin |

## Cron et supervision

| Route | Méthodes | Accès | Rôle |
|-------|----------|-------|------|
| `/api/cron/reminders` | GET, POST | cron | Rappels J-2, J-1, Jour J ; expiration des offres de liste d'attente |
| `/api/cron/cleanup` | GET, POST | cron | Purge RGPD |
| `/api/health` | GET | public | `200 { "ok": true }` si la base répond, sinon `503` |

Les sondes Kubernetes (`k8s/deployment.yaml`) interrogent `/api/health`.
