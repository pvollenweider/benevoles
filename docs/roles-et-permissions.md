# Rôles et permissions

Cinq profils. Les trois profils d'administration ont un compte (email + mot de passe) ; bénévoles et
responsables de secteur s'authentifient par un jeton dans l'URL, sans compte à créer.

| Profil | Authentification | Périmètre |
|--------|------------------|-----------|
| Bénévole | aucune ; jeton unique par inscription | Ses propres inscriptions |
| Responsable de secteur | aucune ; jeton unique par désignation | Lecture seule du roster de son poste (#186) |
| Organisateur (`organizer`) | email + mot de passe | Une organisation, sans l'équipe ni les réglages sensibles |
| Propriétaire (`admin`) | email + mot de passe | Tous les droits sur une organisation |
| Super admin (`super_admin`) | email + mot de passe | Toutes les organisations |

Le rôle est stocké dans `AdminUser.role` : `admin` (valeur par défaut), `organizer` ou `super_admin`, imposé par la contrainte `AdminUser_role_check`.

## Qui peut quoi

| Action | Bénévole | Responsable | Organisateur | Propriétaire | Super admin |
|--------|:--------:|:-----------:|:------------:|:------------:|:-----------:|
| S'inscrire, gérer ses inscriptions par son lien personnel | oui | oui | — | — | — |
| Voir le roster de son poste (lecture seule) | — | oui | oui | oui | oui |
| Événements, postes, créneaux, questions, pages, jalons | — | — | oui | oui | oui |
| Inscriptions, demandes, présences, liste d'attente | — | — | oui | oui | oui |
| Membres, invitations, import et export | — | — | oui | oui | oui |
| Messages ciblés, modèles, rappels manuels | — | — | oui | oui | oui |
| Journaux, exports, rapports | — | — | oui | oui | oui |
| Voir l'équipe, relancer un email en échec, email de test | — | — | oui | oui | oui |
| Inviter, retirer un admin, changer son niveau | — | — | — | oui | oui |
| Réglages de l'organisation et des emails | — | — | — | oui | oui |
| Supprimer définitivement un événement archivé | — | — | — | oui | oui |
| Créer, désactiver, supprimer une organisation ; nouveautés produit | — | — | — | — | oui |

Un responsable de secteur est un bénévole désigné sur un poste : il garde ses droits de bénévole. Le super admin n'a les droits d'un propriétaire que dans l'organisation qu'il a choisie (voir [Super admin](#super-admin)). Colonnes Organisateur et Propriétaire : matrice `PERMISSIONS` de `src/lib/permissions.ts`.

## Sessions admin

Une session est un JWT NextAuth v5 (`src/auth.config.ts`, `src/auth.ts`), mais elle n'est pas figée à la connexion :

- à chaque appel de `auth()` côté serveur (pages admin, `requireOrgSession()`, `requireSuperAdmin()`), le compte est relu en base (`refreshAdminToken`, `src/lib/admin-session.ts`) : un compte supprimé ou désactivé, dont l'organisation est désactivée ou n'existe plus, perd l'accès immédiatement ; le rôle, l'organisation, l'email et le nom sont réévalués sans reconnexion ;
- `AdminUser.sessionVersion` est copiée dans le JWT à la connexion et incrémentée à chaque changement ou réinitialisation du mot de passe : toute session ouverte auparavant est alors refusée. La session depuis laquelle le mot de passe est changé se reconnecte aussitôt avec le nouveau mot de passe ;
- la connexion est limitée à 10 échecs par adresse email saisie et 30 par adresse IP sur 15 minutes ; la vérification du mot de passe actuel (changement de mot de passe, profil du super admin), à 5 échecs par compte et 20 par adresse IP.

Le proxy (`src/proxy.ts`, la convention Next.js 16 qui remplace le middleware) ne fait qu'un premier filtrage sur les pages, à partir du JWT seul. Les contrôles faisant autorité sont côté serveur : les guards et `auth()` relisent le compte à chaque requête.

## Bénévole

- Accède aux pages publiques : liste des événements, page d'un événement (`https://<orgSlug>.benevol.app/<eventSlug>` ; en local, sans sous-domaine, `?org=<orgSlug>`), pages légales.
- S'inscrit sans compte. Chaque inscription reçoit un `editToken` unique, envoyé par email, qui ouvre `/my/[token]` pour consulter ses créneaux, annuler une inscription ou une demande, se retirer d'une liste d'attente, indiquer ses disponibilités, ajouter ses créneaux à son calendrier et activer les notifications du navigateur.
- Une invitation (`?token=` sur la page de l'événement) pré-remplit le formulaire ; elle est réutilisable, et une nouvelle invitation au même événement renvoie le même lien. Il n'y a pas de révocation individuelle : le lien cesse de fonctionner si le membre est désactivé ou l'événement supprimé.
- Une offre de liste d'attente se confirme via `/waitlist/[token]/confirm`, dans les 24 heures.
- Les endpoints publics à jeton ou sensibles sont limités par IP (`src/lib/rate-limit.ts`) : inscription, lecture, annulation, disponibilités, calendrier et renvoi du lien d'une inscription, demande de lien, confirmation de liste d'attente, page du responsable, push, mot de passe oublié, réinitialisation, vérification d'une invitation admin, lecture d'une invitation de membre (pré-remplissage). Les valeurs sont dans [api.md](api.md#limites-de-requêtes) ; l'inscription (`POST /api/public/registrations`) est limitée à 20 requêtes par heure. Les compteurs sont stockés dans PostgreSQL : ils sont communs à toutes les instances de l'application et survivent à un redémarrage.

## Responsable de secteur

Un admin peut désigner un ou plusieurs bénévoles responsables d'un poste (`Shift.roleName`) sur un
événement — voir issue [#186](https://github.com/pvollenweider/benevoles/issues/186).

- Aucun compte : un `SectorLeader.token` unique, envoyé par email, ouvre `/leader/[token]`.
- Accès strictement lecture seule : liste des bénévoles inscrits ou en liste d'attente sur son poste
  (nom, email, téléphone, commentaire), groupée par créneau. Pas de validation ni d'annulation d'inscription,
  pas d'édition des créneaux — v1 volontairement minimale, pas de surface de mutation à sécuriser.
- Reçoit un email à chaque nouvelle inscription sur son poste (`sector_leader_new_signup`).
- Le lien n'expire pas : il reste valable tant que la désignation existe (retrait par un admin) et que l'événement n'est pas supprimé, y compris après l'événement.

## Admin d'organisation

Deux niveaux, pas davantage :

- **Propriétaire** (rôle stocké `admin`) : tous les droits de l'organisation.
- **Organisateur** (`organizer`) : les événements, postes, créneaux, inscriptions, présences, membres et leurs invitations, les messages, les exports et les journaux. Il voit la liste de l'équipe mais ne la gère pas, ne change pas les réglages de l'organisation (nom, adresse publique (slug) et anciennes adresses, titre public, fuseau horaire, charte, assurance, réglages des emails, masquage de la liste « Premiers pas ») et ne supprime pas définitivement un événement.

La matrice route × méthode × niveau est `PERMISSIONS` dans `src/lib/permissions.ts`. Chaque route la respecte côté serveur (`requireOrgSession("owner")` pour les routes réservées aux propriétaires, 403 sinon), pas seulement en masquant l'interface. Un test vérifie que chaque route admin et chaque méthode y figurent, avec le bon appel. Un autre vérifie qu'un organisateur reçoit 403 sur chaque route réservée, sans qu'aucune donnée ne soit lue. Un changement de rôle s'applique aux sessions ouvertes dès leur requête suivante, car la session relit le rôle à chaque appel.

Routes réservées aux propriétaires (le reste de `PERMISSIONS` est ouvert aux organisateurs) :

| Route (`/api/admin/…`) | Méthode |
|------------------------|---------|
| `events/[id]` | DELETE |
| `settings/admins` | POST |
| `settings/admins/[id]` | PATCH, DELETE |
| `settings/notifications` | PATCH |
| `settings/organization` | PATCH |
| `settings/organization/slugs` | DELETE |

Tests : `src/lib/__tests__/permissions.test.ts` (chaque route et méthode classée, avec `requireOrgSession("owner")` ou `requireOrgSession()` selon le niveau) et `src/__tests__/security/role-permissions.test.ts` (403 à un organisateur, aucune lecture en base). `accept-invite` est hors matrice (`PUBLIC_ADMIN_ROUTES`).

Un admin crée et gère les événements de sa propre organisation. Il peut archiver un événement ; un propriétaire peut ensuite le supprimer définitivement : la suppression est refusée (409) tant que l'événement n'est pas archivé, et exige la saisie du titre.

Isolation entre organisations :

1. `requireOrgSession()` (`src/lib/auth-guard.ts`) vérifie la session, résout l'organisation et refuse l'accès (403) si l'organisation d'un propriétaire ou d'un organisateur est désactivée. La vérification a lieu à chaque requête, pas seulement à la connexion.
2. Le client `db` renvoyé par le guard est un client Prisma étendu (`getOrgClient`, `src/lib/prisma-org.ts`) qui limite toutes les opérations à l'organisation, sur tous les modèles qui lui appartiennent (`Event`, `Volunteer`, `OrgLog`, `OrgSlugHistory`, `TargetedMessage`, `MessageTemplate` directement ; `Shift`, `Registration`, `MemberInvite`, `EventPage`, `SectorLeader`, `EventMilestone`, `EventLog`, `EventQuestion`, `QuestionAnswer` via leur événement). `Organization`, `AdminUser`, `NotificationOutbox` et `PushSubscription` n'y sont pas : les routes qui les lisent filtrent explicitement par organisation. Les requêtes multi-lignes reçoivent le filtre ; les opérations par clé unique (`update`, `delete`, `findUnique`, `upsert`) vérifient d'abord à quelle organisation appartient la ligne ; les créations sont rattachées d'office à l'organisation ou refusées si l'événement visé n'en fait pas partie.
3. Le code admin ne peut pas importer le client brut `prisma` (règle ESLint `no-restricted-imports` sur `src/app/api/admin/**` et `src/app/admin/**`) ; les rares exceptions (`Organization`, `AdminUser`, contrôle volontairement inter-organisations d'un slug) sont annotées avec leur justification.
4. Les tests `src/__tests__/security/cross-tenant-isolation.test.ts` et `src/lib/__tests__/prisma-org.test.ts` vérifient l'isolation route par route et opération par opération.

Toute nouvelle route admin doit ajouter son test d'isolation (voir [CONTRIBUTING.md](../CONTRIBUTING.md)).

Règles sur l'équipe :

- Seul un propriétaire invite, retire ou change le rôle d'un admin. Une invitation crée un organisateur, sauf si le rôle Propriétaire est choisi.
- L'organisation garde toujours au moins un propriétaire actif : le dernier ne peut être ni rétrogradé ni retiré.
- Un admin ne peut pas se retirer lui-même, ni retirer le dernier admin actif.
- L'invitation d'un admin envoie un lien d'activation valable 7 jours.

## Super admin

- Gère les organisations : création, édition (nom, slug), activation ou désactivation, suppression. La suppression définitive exige une organisation désactivée (409 sinon) et la saisie de son slug ; ses membres et ses admins sont effacés avec elle.
- Crée une organisation avec son premier admin : un lien d'invitation valable 7 jours est généré, sans mot de passe temporaire.
- N'est rattaché à aucune organisation (`organizationId` nul). Le bouton « Gérer » enregistre l'organisation choisie dans le cookie `sa-org-id`. Sans ce cookie (ou s'il désigne une organisation qui n'existe plus), aucune organisation n'est choisie à sa place : les pages de `/admin` redirigent vers la liste des organisations (`/super-admin/organizations`) pour en sélectionner une, et les routes de l'API admin répondent 409 (« Aucune organisation sélectionnée »).
- Dans l'organisation choisie, il a tous les droits d'un propriétaire, y compris si elle est désactivée.
- Envoie les nouveautés produit aux admins abonnés (`/api/super-admin/product-updates`, historique `ProductUpdateSend`) et gère son propre profil (email, mot de passe).
- Voit, sur les pages de son espace, une bannière « Une nouvelle version est disponible » quand l'instance est en retard sur la dernière release GitHub publique (#612, instances auto-hébergées, `RELEASE_CHECK`) ; peut la masquer pour cette version (`AdminUser.releaseBannerDismissedVersion`), elle réapparaît à la version suivante. La page **Santé du service** affiche la dernière version connue et la date de la dernière vérification.
- Protégé par `requireSuperAdmin()` côté API et par le proxy côté pages.

## Où les droits sont appliqués

| Couche | Fichier | Règle |
|--------|---------|-------|
| Pages | `src/proxy.ts` | `/admin/*` exige une session, sauf `login`, `accept-invite`, `forgot-password`, `reset-password`. `/super-admin/*` exige le rôle `super_admin`, sinon redirection vers `/admin` |
| API admin | `requireOrgSession(level)` | 401 sans session ; 403 si le niveau est insuffisant (routes réservées aux propriétaires, voir `PERMISSIONS`), sans organisation ou organisation désactivée ; 409 pour un super admin qui n'a pas choisi d'organisation |
| API super admin | `requireSuperAdmin()` | 401 sans session, 403 si le rôle n'est pas `super_admin` |
| API cron | `isAuthorized()` | `Authorization: Bearer $CRON_SECRET` ; sans `CRON_SECRET`, refusé en production, `localhost` accepté en développement |
| API publique | jeton dans l'URL ou le corps | pas de session |

## Journaux d'activité

`EventLog` (par événement) et `OrgLog` (membres, équipe) ne stockent pas le nom de l'acteur : `actorId` est résolu à la lecture depuis `AdminUser` ou `Volunteer`. Si la fiche n'existe plus (admin retiré, bénévole effacé), l'interface affiche un libellé générique selon `actorType` (`admin`, `volunteer`, `system`).

## Conservation et suppression

Les durées de conservation, ce qui les déclenche et ce qui efface chaque donnée sont décrites dans [retention.md](retention.md), généré depuis `src/lib/retention.ts` et vérifié par un test contre le nettoyage quotidien, les sauvegardes et la politique de confidentialité.
