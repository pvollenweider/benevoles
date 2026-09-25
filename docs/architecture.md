# Architecture

Application Next.js 16 (App Router, React 19) adossée à PostgreSQL via Prisma 7. Une seule application sert le site public, l'administration des organisations et le super admin.

```
Navigateur ──► Traefik / ingress ──► Next.js (server.js, port 3000) ──► PostgreSQL
                                          │
                                          ├──► SMTP (Nodemailer)
                                          ├──► Service push (Web Push, VAPID)
                                          └──► Sentry

CronJobs Kubernetes ──► /api/cron/reminders, /api/cron/cleanup
```

## Découpage du code

| Chemin | Contenu |
|--------|---------|
| `src/app/[orgSlug]/[eventSlug]/` | Page publique d'un événement (timeline Gantt, formulaire d'inscription) |
| `src/app/[eventSlug]/[pageSlug]/` | Page personnalisée d'un événement (FAQ, lieu, règlement…), rendue depuis le Markdown en base |
| `src/app/leader/[token]/` | Roster lecture seule d'un responsable de secteur (#186) |
| `src/app/my/[token]/` | Gestion de son inscription par le bénévole |
| `src/app/waitlist/[token]/confirm/` | Confirmation d'une place de liste d'attente |
| `src/app/admin/` | Administration d'une organisation |
| `src/app/super-admin/` | Gestion des organisations |
| `src/app/legal/` | Politique de confidentialité, conditions d'utilisation |
| `src/app/api/` | Routes HTTP, voir [api.md](api.md) |
| `src/components/` | Composants (`admin/`, `super-admin/`, timeline publique `DayTimeline.tsx`) |
| `src/lib/` | Logique métier partagée |
| `src/middleware.ts` | Authentification des pages et routage par sous-domaine |
| `prisma/` | Schéma, migrations, seed |
| `k8s/`, `Dockerfile`, `docker-compose*.yml` | Déploiement |
| `gandi-webhook/` | Webhook DNS Gandi pour cert-manager (Go, hors application) |

Modules `src/lib/` à connaître :

| Module | Rôle |
|--------|------|
| `auth-guard.ts` | `requireOrgSession`, `requireSuperAdmin`, `getOrgContext` |
| `prisma-org.ts` | Client Prisma limité à une organisation (`getOrgClient`) |
| `env.ts` | Validation des variables d'environnement |
| `notifications/` | `sendNotification()`, gabarits, canal email |
| `push.ts` | Envoi Web Push, purge des abonnements expirés |
| `waitlist.ts` | Promotion du premier de la liste d'attente |
| `rate-limit.ts` | Limiteur de requêtes en mémoire |
| `csv-import.ts` | Import CSV et xlsx des membres |
| `volunteer-charter.ts` | Texte par défaut de la charte du bénévole |
| `event-page-markdown.ts` | Rend le Markdown des pages personnalisées d'événement en HTML (`marked`), sanitisé avec DOMPurify (liste blanche de balises/attributs) à la lecture, pas à l'écriture |
| `sector-leaders.ts` | Notifie les responsables de secteur d'un poste à chaque nouvelle inscription (#186) |
| `org-log.ts` / `org-log-read.ts` | Journal d'activité au niveau de l'organisation — écriture et lecture (#194) |
| `product-updates.ts` | Signature/vérification du lien de désabonnement des nouveautés produit, sans colonne de jeton dédiée (#200) |

## Multi-tenant

- Chaque organisation (`Organization`) possède ses événements, créneaux, membres et admins.
- L'organisation courante d'une page publique vient du sous-domaine : `src/middleware.ts` copie `[orgSlug]` de `[orgSlug].benevol.app` dans l'en-tête `x-org-slug`, sauf pour `www`, `app`, `admin`, `api` et `staging`. Sans sous-domaine (développement), `?org=<slug>` joue le même rôle.
- Côté admin, l'organisation vient de la session. L'isolation est décrite dans [roles-et-permissions.md](roles-et-permissions.md).
- Un changement de slug archive l'ancien dans `OrgSlugHistory` pour rediriger les anciens liens.
- Le slug d'un événement est unique au sein d'une organisation, pas globalement.

## Modèle de données

Modèles Prisma (`prisma/schema.prisma`) :

| Modèle | Rôle |
|--------|------|
| `Organization` | Tenant : slug, `active`, charte, assurance, titre de la page publique (`publicTitle`) |
| `OrgSlugHistory` | Anciens slugs |
| `AdminUser` | Compte admin ou super admin, jetons d'activation et de réinitialisation, abonnement aux nouveautés produit (`receiveProductUpdates`, #200) |
| `Event` | Événement : dates, statut de publication, rappels activés |
| `Shift` | Créneau : rôle, capacité, statut, liste d'attente activée, ordre, âge minimum optionnel (`minAge`, #192) |
| `Volunteer` | Bénévole d'une organisation, unique par email et organisation ; `birthDate` optionnel, collecté seulement si un créneau l'exige |
| `Registration` | Inscription d'un bénévole à un créneau : statut, jeton, position en liste d'attente, dates d'envoi des rappels |
| `MemberInvite` | Invitation d'un membre à un événement |
| `PushSubscription` | Abonnement push |
| `EventPage` | Page statique additionnelle d'un événement (FAQ, lieu, règlement…) : titre, slug, contenu Markdown, ordre |
| `SectorLeader` | Responsable d'un poste (`roleName`) au sein d'un événement : nom, email, jeton d'accès lecture seule (#186) |
| `EventMilestone` | Jalon/échéance d'un événement : titre, date, fait/pas fait — purement informatif (#189) |
| `OrgLog` | Journal d'audit au niveau de l'organisation : changements sur `Volunteer`/`AdminUser`, pas rattachés à un événement (#194) |
| `ProductUpdateSend` | Historique des communications de nouveautés produit diffusées aux administrateurs (#200) |

Statuts d'une inscription : `active`, `waiting` (en liste d'attente), `offered` (place proposée) et `cancelled`.

## Flux principaux

### Création et publication

1. Un admin crée un événement (brouillon), ajoute des créneaux et le programme des spectacles.
2. Il publie l'événement, qui devient visible sur `/{orgSlug}/{eventSlug}`.
3. Une fois l'événement terminé, il l'archive (`PATCH { publicStatus: "archived" }`). Un événement archivé, et lui seul, peut être supprimé définitivement (`DELETE`, avec confirmation par le titre) : les créneaux, inscriptions et invitations partent en cascade, les membres du pool et l'organisation sont conservés, les bénévoles ne sont pas prévenus.

### Invitation des membres

1. L'admin choisit des membres du pool et envoie les invitations. Chaque membre reçoit un lien avec un jeton (`MemberInvite`), réutilisé si le membre est invité à nouveau.
2. Le lien pré-remplit le formulaire d'inscription. Le premier usage est horodaté ; le lien reste valide ensuite.

### Inscription publique (`POST /api/public/registrations`)

1. Limitation à 20 requêtes par heure et par IP, validation Zod (consentement obligatoire).
2. Vérification que les créneaux existent, appartiennent à l'événement et sont ouverts (`409` sinon).
3. Créneau complet : refus, ou inscription en liste d'attente si elle est activée sur ce créneau.
4. Détection des chevauchements avec les inscriptions existantes du bénévole (`409`).
5. Création du `Volunteer` s'il n'existe pas (unique par organisation et email), puis d'une `Registration` par créneau, chacune avec son jeton.
6. Emails de confirmation, copie à `ADMIN_NOTIFICATION_EMAIL` si défini, email de liste d'attente pour les inscriptions `waiting`.

### Liste d'attente

1. Une annulation (par le bénévole ou l'admin) libère une place et appelle `promoteNextInWaitlist(shiftId)`.
2. La personne la mieux placée passe en `offered` pour 24 heures et reçoit un email avec un lien de confirmation.
3. Sans confirmation, `/api/cron/reminders` fait expirer l'offre et propose la place à la suivante.

### Rappels

`/api/cron/reminders` s'exécute toutes les heures. Il envoie un rappel par email, et par push si le bénévole est abonné, pour les créneaux dans l'une de ces fenêtres :

| Rappel | Fenêtre avant le début |
|--------|------------------------|
| J-2 | 47 à 49 h |
| J-1 | 23 à 25 h |
| Jour J | 2 à 4 h |

Chaque envoi est enregistré (`reminderJ2Sent`, `reminderJ1Sent`, `reminderDdSent`) : un rappel n'est envoyé qu'une fois par inscription.

### Purge

`/api/cron/cleanup` s'exécute chaque jour. Voir [roles-et-permissions.md](roles-et-permissions.md#conservation-et-suppression).

## Notifications

- Tous les emails passent par `sendNotification()` : aucune route n'appelle Nodemailer directement. Les types de notification sont listés dans [FONCTIONNALITES.md](../FONCTIONNALITES.md).
- Sans `SMTP_HOST`, le contenu est affiché dans la console.
- Le push est envoyé séparément par `sendPushToEmail()`, uniquement pour les rappels, et n'a d'effet que si les clés VAPID sont configurées.

## Observabilité

- Sentry : `sentry.server.config.ts` et `sentry.edge.config.ts` sont chargés par `src/instrumentation.ts`, qui exporte aussi `onRequestError`. Le navigateur est initialisé par `instrumentation-client.ts`.
- `/api/health` répond `200` si la base est joignable, `503` sinon.
