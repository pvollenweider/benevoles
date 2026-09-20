# Rôles et permissions

Trois profils, sans compte pour les bénévoles.

| Profil | Authentification | Périmètre |
|--------|------------------|-----------|
| Bénévole | aucune ; jeton unique par inscription | Ses propres inscriptions |
| Admin d'organisation (`admin`) | email + mot de passe | Une seule organisation |
| Super admin (`super_admin`) | email + mot de passe | Toutes les organisations |

Le rôle est stocké dans `AdminUser.role` (`admin` par défaut). Une session est un JWT NextAuth v5 (`src/auth.config.ts`).

## Bénévole

- Accède aux pages publiques : liste des événements, page d'un événement (`/{orgSlug}/{eventSlug}`), pages légales.
- S'inscrit sans compte. Chaque inscription reçoit un `editToken` unique, envoyé par email, qui ouvre `/my/[token]` pour consulter et annuler ses créneaux.
- Une invitation (`?token=` sur la page de l'événement) pré-remplit le formulaire ; elle est révocable et réutilisable.
- Une offre de liste d'attente se confirme via `/waitlist/[token]/confirm`, dans les 24 heures.
- Les endpoints publics sensibles (inscription, gestion d'inscription, liste d'attente, push, mot de passe oublié et réinitialisation) sont protégés par un limiteur en mémoire par IP (`src/lib/rate-limit.ts`). L'inscription (`POST /api/public/registrations`) est limitée à 20 requêtes par heure. Le compteur est propre à chaque instance de l'application.

## Admin d'organisation

Crée et gère les événements, créneaux, inscriptions, membres, invitations et réglages de sa propre organisation.

Isolation entre organisations :

1. `requireOrgSession()` (`src/lib/auth-guard.ts`) vérifie la session, résout l'organisation et refuse l'accès (403) si l'organisation est désactivée. La vérification a lieu à chaque requête, pas seulement à la connexion.
2. Le client `db` renvoyé par le guard est un client Prisma étendu (`getOrgClient`, `src/lib/prisma-org.ts`) qui ajoute `organizationId` à toutes les lectures.
3. Les modifications et suppressions sur `Shift` et `Registration` passent d'abord par une lecture scopée pour vérifier l'appartenance, car Prisma ne permet pas d'injecter ce filtre dans un `where` unique.
4. Les tests `src/__tests__/security/cross-tenant-isolation.test.ts` (20 tests) vérifient que chaque route admin utilise `db` et non le client brut `prisma`.

Toute nouvelle route admin doit ajouter son test d'isolation (voir [CONTRIBUTING.md](../CONTRIBUTING.md)).

Règles sur l'équipe :

- Un admin ne peut pas se retirer lui-même, ni retirer le dernier admin actif.
- L'invitation d'un admin envoie un lien d'activation valable 7 jours.

## Super admin

- Gère les organisations : création, édition (nom, slug), activation ou désactivation, suppression.
- Crée une organisation avec son premier admin : un lien d'invitation valable 7 jours est généré, sans mot de passe temporaire.
- N'est rattaché à aucune organisation (`organizationId` nul). Le bouton « Gérer » enregistre l'organisation choisie dans le cookie `sa-org-id` ; sans cookie, le guard retient l'organisation la plus ancienne.
- Protégé par `requireSuperAdmin()` côté API et par le middleware côté pages.

## Où les droits sont appliqués

| Couche | Fichier | Règle |
|--------|---------|-------|
| Pages | `src/middleware.ts` | `/admin/*` exige une session, sauf `login`, `accept-invite`, `forgot-password`, `reset-password`. `/super-admin/*` exige le rôle `super_admin`, sinon redirection vers `/admin` |
| API admin | `requireOrgSession()` | 401 sans session, 403 sans organisation ou organisation désactivée |
| API super admin | `requireSuperAdmin()` | 401 sans session, 403 si le rôle n'est pas `super_admin` |
| API cron | `isAuthorized()` | `Authorization: Bearer $CRON_SECRET` |
| API publique | jeton dans l'URL ou le corps | pas de session |

## Conservation et suppression

`/api/cron/cleanup` (quotidien) supprime : les organisations désactivées depuis plus de 30 jours (avec leurs événements, créneaux et inscriptions en cascade), les bénévoles sans organisation ni inscription, les comptes admin désactivés depuis plus de 30 jours et les jetons expirés.
