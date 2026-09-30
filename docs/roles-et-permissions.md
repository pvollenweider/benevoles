# Rôles et permissions

Quatre profils. Seuls les deux admins ont un compte (email + mot de passe) ; bénévoles et
responsables de secteur s'authentifient par un jeton dans l'URL, sans compte à créer.

| Profil | Authentification | Périmètre |
|--------|------------------|-----------|
| Bénévole | aucune ; jeton unique par inscription | Ses propres inscriptions |
| Responsable de secteur | aucune ; jeton unique par désignation | Lecture seule du roster de son poste (#186) |
| Admin d'organisation (`admin`) | email + mot de passe | Une seule organisation |
| Super admin (`super_admin`) | email + mot de passe | Toutes les organisations |

Le rôle est stocké dans `AdminUser.role` (`admin` par défaut).

## Sessions admin

Une session est un JWT NextAuth v5 (`src/auth.config.ts`, `src/auth.ts`), mais elle n'est pas figée à la connexion :

- à chaque appel de `auth()` côté serveur (pages admin, `requireOrgSession()`, `requireSuperAdmin()`), le compte est relu en base (`refreshAdminToken`, `src/lib/admin-session.ts`) : un compte supprimé ou désactivé, ou dont l'organisation est désactivée, perd l'accès immédiatement ; le rôle, l'organisation, l'email et le nom sont réévalués sans reconnexion ;
- `AdminUser.sessionVersion` est copiée dans le JWT à la connexion et incrémentée à chaque changement ou réinitialisation du mot de passe : toute session ouverte auparavant est alors refusée. La session depuis laquelle le mot de passe est changé se reconnecte aussitôt avec le nouveau mot de passe ;
- la connexion est limitée à 10 échecs par compte et 30 par adresse IP sur 15 minutes ; la vérification du mot de passe actuel (changement de mot de passe, profil du super admin), à 5 échecs par compte et 20 par adresse IP.

Le proxy (`src/proxy.ts`, la convention Next.js 16 qui remplace le middleware) ne fait qu'un premier filtrage sur les pages, à partir du JWT seul. Les contrôles faisant autorité sont côté serveur : les guards et `auth()` relisent le compte à chaque requête.

## Bénévole

- Accède aux pages publiques : liste des événements, page d'un événement (`https://<orgSlug>.benevol.app/<eventSlug>` ; en local, sans sous-domaine, `?org=<orgSlug>`), pages légales.
- S'inscrit sans compte. Chaque inscription reçoit un `editToken` unique, envoyé par email, qui ouvre `/my/[token]` pour consulter et annuler ses créneaux.
- Une invitation (`?token=` sur la page de l'événement) pré-remplit le formulaire ; elle est révocable et réutilisable.
- Une offre de liste d'attente se confirme via `/waitlist/[token]/confirm`, dans les 24 heures.
- Les endpoints publics sensibles (inscription, gestion d'inscription, liste d'attente, push, mot de passe oublié et réinitialisation) sont protégés par un limiteur par IP (`src/lib/rate-limit.ts`). L'inscription (`POST /api/public/registrations`) est limitée à 20 requêtes par heure. Les compteurs sont stockés dans PostgreSQL : ils sont communs à toutes les instances de l'application et survivent à un redémarrage.

## Responsable de secteur

Un admin peut désigner un ou plusieurs bénévoles responsables d'un poste (`Shift.roleName`) sur un
événement — voir issue [#186](https://github.com/pvollenweider/benevoles/issues/186).

- Aucun compte : un `SectorLeader.token` unique, envoyé par email, ouvre `/leader/[token]`.
- Accès strictement lecture seule : liste des bénévoles inscrits sur son poste (nom, email,
  téléphone, commentaire), groupée par créneau. Pas de validation ni d'annulation d'inscription,
  pas d'édition des créneaux — v1 volontairement minimale, pas de surface de mutation à sécuriser.
- Reçoit un email à chaque nouvelle inscription sur son poste (`sector_leader_new_signup`).
- Le lien reste valable pour toute la durée de l'événement (pas d'expiration).

## Admin d'organisation

Deux niveaux, pas davantage :

- **Propriétaire** (rôle stocké `admin`, celui de tous les admins d'avant cette distinction) : tous les droits de l'organisation.
- **Organisateur** (`organizer`) : les événements, postes, créneaux, inscriptions, présences, membres et leurs invitations, les messages, les exports et les journaux. Il ne gère pas l'équipe d'administration, ne change pas les réglages de l'organisation (nom, titre public, adresse, fuseau horaire, charte, réglages des emails) et ne supprime pas définitivement un événement.

La matrice route × méthode × niveau est `PERMISSIONS` dans `src/lib/permissions.ts`. Chaque route la respecte côté serveur (`requireOrgSession("owner")` pour les routes réservées aux propriétaires, 403 sinon), pas seulement en masquant l'interface. Un test vérifie que chaque route admin et chaque méthode y figurent, avec le bon appel. Un autre vérifie qu'un organisateur reçoit 403 sur chaque route réservée, sans qu'aucune donnée ne soit lue. Un changement de rôle s'applique aux sessions ouvertes dès leur requête suivante, car la session relit le rôle à chaque appel.

Un admin crée et gère les événements de sa propre organisation. Il peut archiver un événement ; un propriétaire peut ensuite le supprimer définitivement : la suppression est refusée (409) tant que l'événement n'est pas archivé, et exige la saisie du titre.

Isolation entre organisations :

1. `requireOrgSession()` (`src/lib/auth-guard.ts`) vérifie la session, résout l'organisation et refuse l'accès (403) si l'organisation est désactivée. La vérification a lieu à chaque requête, pas seulement à la connexion.
2. Le client `db` renvoyé par le guard est un client Prisma étendu (`getOrgClient`, `src/lib/prisma-org.ts`) qui limite toutes les opérations à l'organisation, sur tous les modèles qui lui appartiennent (`Event`, `Volunteer`, `OrgLog`, `OrgSlugHistory` directement ; `Shift`, `Registration`, `MemberInvite`, `EventPage`, `SectorLeader`, `EventMilestone`, `EventLog` via leur événement). Les requêtes multi-lignes reçoivent le filtre ; les opérations par clé unique (`update`, `delete`, `findUnique`, `upsert`) vérifient d'abord à quelle organisation appartient la ligne ; les créations sont rattachées d'office à l'organisation ou refusées si l'événement visé n'en fait pas partie.
3. Le code admin ne peut pas importer le client brut `prisma` (règle ESLint `no-restricted-imports` sur `src/app/api/admin/**` et `src/app/admin/**`) ; les rares exceptions (`Organization`, `AdminUser`, contrôle volontairement inter-organisations d'un slug) sont annotées avec leur justification.
4. Les tests `src/__tests__/security/cross-tenant-isolation.test.ts` et `src/lib/__tests__/prisma-org.test.ts` vérifient l'isolation route par route et opération par opération.

Toute nouvelle route admin doit ajouter son test d'isolation (voir [CONTRIBUTING.md](../CONTRIBUTING.md)).

Règles sur l'équipe :

- Seul un propriétaire invite, retire ou change le rôle d'un admin. Une invitation crée un organisateur, sauf si le rôle Propriétaire est choisi.
- L'organisation garde toujours au moins un propriétaire actif : le dernier ne peut être ni rétrogradé ni retiré.
- Un admin ne peut pas se retirer lui-même, ni retirer le dernier admin actif.
- L'invitation d'un admin envoie un lien d'activation valable 7 jours.

## Super admin

- Gère les organisations : création, édition (nom, slug), activation ou désactivation, suppression.
- Crée une organisation avec son premier admin : un lien d'invitation valable 7 jours est généré, sans mot de passe temporaire.
- N'est rattaché à aucune organisation (`organizationId` nul). Le bouton « Gérer » enregistre l'organisation choisie dans le cookie `sa-org-id`. Sans ce cookie (ou s'il désigne une organisation qui n'existe plus), aucune organisation n'est choisie à sa place : les pages de `/admin` redirigent vers la liste des organisations (`/super-admin/organizations`) pour en sélectionner une, et les routes de l'API admin répondent 403.
- Protégé par `requireSuperAdmin()` côté API et par le proxy côté pages.

## Où les droits sont appliqués

| Couche | Fichier | Règle |
|--------|---------|-------|
| Pages | `src/proxy.ts` | `/admin/*` exige une session, sauf `login`, `accept-invite`, `forgot-password`, `reset-password`. `/super-admin/*` exige le rôle `super_admin`, sinon redirection vers `/admin` |
| API admin | `requireOrgSession(level)` | 401 sans session, 403 sans organisation, organisation désactivée, ou niveau insuffisant (routes réservées aux propriétaires, voir `PERMISSIONS`) |
| API super admin | `requireSuperAdmin()` | 401 sans session, 403 si le rôle n'est pas `super_admin` |
| API cron | `isAuthorized()` | `Authorization: Bearer $CRON_SECRET` |
| API publique | jeton dans l'URL ou le corps | pas de session |

## Conservation et suppression

`/api/cron/cleanup` (quotidien) supprime : les organisations désactivées depuis plus de 30 jours (avec leurs événements, créneaux et inscriptions en cascade), les bénévoles sans organisation ni inscription, les comptes admin désactivés depuis plus de 30 jours, les jetons expirés, les emails de la file d'envoi (envoyés chaque nuit, en échec après 30 jours) et les messages ciblés de plus de 12 mois (objet, texte, public et nombre de destinataires ; leur contenu peut contenir des informations personnelles).
