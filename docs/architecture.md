# Architecture

Application Next.js 16 (App Router, React 19) adossée à PostgreSQL via Prisma 7. Une seule application sert le site public, l'administration des organisations et le super admin.

```
Navigateur ──► Traefik (ingress) ──► Next.js (server.js, port 3000) ──► PostgreSQL
                                          │
                                          ├──► SMTP (Nodemailer)
                                          ├──► Service push (Web Push, VAPID)
                                          └──► Sentry (navigateur via le tunnel /monitoring)

CronJobs Kubernetes ──► /api/cron/reminders (toutes les heures), /api/cron/cleanup (02:00 UTC)
CronJobs de sauvegarde ──► pg_dump chiffré (01:00 UTC), copie hors site (01:30 UTC) ──► /api/cron/heartbeat
Job de migration (k8s/job-migrate.yaml) ──► prisma migrate deploy, à chaque déploiement, avant la mise à jour de l'application
```

## Découpage du code

| Chemin | Contenu |
|--------|---------|
| `src/app/page.tsx` | Accueil : page de présentation sur le domaine principal, liste des événements publiés et répertoriés sur le sous-domaine d'une organisation |
| `src/app/[eventSlug]/` | Page publique d'un événement (timeline Gantt, formulaire d'inscription, page `success/`) ; l'organisation vient du sous-domaine |
| `src/app/[eventSlug]/[pageSlug]/` | Page personnalisée d'un événement (FAQ, lieu, règlement…), rendue depuis le Markdown en base |
| `src/app/leader/[token]/` | Roster lecture seule d'un responsable de secteur (#186) |
| `src/app/my/[token]/` | Gestion de son inscription par le bénévole |
| `src/app/waitlist/[token]/confirm/` | Confirmation d'une place de liste d'attente |
| `src/app/admin/` | Administration d'une organisation |
| `src/app/super-admin/` | Gestion des organisations, nouveautés produit, profil, page santé (`health/`) |
| `src/app/legal/` | Politique de confidentialité, conditions d'utilisation |
| `src/app/doc/`, `src/app/fonctionnalites/`, `src/app/accessibilite/` | Pages de contenu publiques rendues depuis `GUIDE_*.md`, `FEATURES.md`, `ACCESSIBILITE.md` (déclarées dans `src/lib/doc-pages.ts`) |
| `src/app/product-updates/unsubscribed/` | Confirmation du désabonnement des nouveautés produit |
| `src/app/api/` | Routes HTTP, voir [api.md](api.md) |
| `src/components/` | Composants (`admin/`, `super-admin/`, timeline publique `DayTimeline.tsx`) |
| `src/lib/` | Logique métier partagée |
| `src/proxy.ts` | Proxy (ex-middleware) : authentification des pages et routage par sous-domaine |
| `prisma/` | Schéma, migrations, seed |
| `k8s/`, `Dockerfile`, `docker-compose*.yml` | Déploiement |
| `gandi-webhook/` | Webhook DNS Gandi pour cert-manager (Go, hors application) |

Modules `src/lib/` à connaître :

| Module | Rôle |
|--------|------|
| `auth-guard.ts` | `requireOrgSession(level)` (niveau organisateur par défaut, `"owner"` pour les routes réservées), `requireSuperAdmin`, `getOrgContext` |
| `permissions.ts` | Deux niveaux par organisation (Propriétaire = rôle stocké `admin`, Organisateur = `organizer`, #469) et matrice `PERMISSIONS` route × méthode → niveau de toutes les routes `src/app/api/admin` |
| `token-vault.ts` | Jetons des liens bénévoles (inscription, responsable, invitation) : empreinte SHA-256 pour la recherche, copie chiffrée AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, rotation par `TOKEN_ENCRYPTION_KEY_ID` et `TOKEN_ENCRYPTION_PREVIOUS_KEYS`) pour le renvoi ; `token-encryption-job.ts` chiffre les valeurs encore en clair et rechiffre avec la clé courante, depuis le nettoyage nocturne |
| `production-guards.ts` | Vérifications au démarrage (`src/instrumentation.ts`) : clés de chiffrement et fuseau horaire valides, `TOKEN_ENCRYPTION_KEY` obligatoire en production |
| `prisma-org.ts` | Client Prisma limité à une organisation (`getOrgClient`) |
| `env.ts` | Validation des variables d'environnement |
| `statuses.ts` | Valeurs autorisées des colonnes de statut, imposées aussi par des contraintes CHECK |
| `retention.ts` | Durées de conservation, source unique de [retention.md](retention.md) et du nettoyage |
| `usage-counters.ts`, `usage-stats.ts` | Statistiques du super admin (#805) : compteurs cumulés « depuis le début » (tables `PlatformCounter` et `OrganizationCounter`, tenues par des triggers `AFTER INSERT` de la migration `20261008150000_usage_counters`, jamais diminuées) et comptages actuels ; `usage-stats.ts` fait les requêtes (serveur seulement) |
| `job-runs.ts` | Dernière exécution de chaque tâche planifiée (`JobRun`), lue par `/super-admin/health` |
| `sentry-scrub.ts` | Retire jetons, emails et données personnelles des événements Sentry (serveur, edge, navigateur) |
| `time-zone.ts` | Fuseau de l'organisation (`APP_TIME_ZONE` par défaut), conversion des heures locales des créneaux |
| `notifications/` | `sendNotification()`, gabarits (`templates/`, un fichier par famille, `render()` dans `templates/index.ts`), canal email |
| `push.ts` | Envoi Web Push, purge des abonnements expirés |
| `waitlist.ts` | Promotion du premier de la liste d'attente |
| `rate-limit.ts` | Limiteur de requêtes, compteurs dans PostgreSQL (partagés entre instances) ; en mémoire du processus pour la réponse anonyme aux vidéos (#646), qui n'écrit pas l'IP en base |
| `video-feedback.ts` | « Cette vidéo vous a-t-elle été utile ? » (#646) : validation, contexte de lecture (`?from=doc`), formulation tu/vous, agrégation par vidéo et révision |
| `csv-import.ts` | Import CSV et xlsx des membres ; `member-import-server.ts` et `member-import-plan.ts` analysent le fichier et planifient l'import |
| `targeted-message.ts` | Messages ciblés : audiences, limites, push associé |
| `registration-decision.ts` | Acceptation ou refus des demandes sur les créneaux « Sur validation » |
| `event-questions.ts` | Questions d'inscription personnalisées : validation des questions et des réponses |
| `volunteer-charter.ts` | Texte par défaut de la charte du bénévole |
| `event-page-markdown.ts` | Rend le Markdown des pages personnalisées d'événement en HTML (`marked`), sanitisé avec DOMPurify (liste blanche de balises/attributs) à la lecture, pas à l'écriture |
| `sector-leaders.ts` | Notifie les responsables de secteur d'un poste à chaque nouvelle inscription (#186) |
| `org-log.ts` / `org-log-read.ts` | Journal d'activité au niveau de l'organisation — écriture et lecture (#194) |
| `product-updates.ts` | Signature/vérification du lien de désabonnement des nouveautés produit, sans colonne de jeton dédiée (#200) |

## Couches

| Couche | Contenu | Fichiers principaux |
|--------|---------|---------------------|
| Pages publiques | Événement, pages de contenu, espaces `my/`, `leader/`, `waitlist/`, documentation publique | `src/app/[eventSlug]/`, `src/app/doc/`, `public/sw.js` |
| Back-office | Administration d'une organisation et super admin | `src/app/admin/`, `src/app/super-admin/`, `src/components/admin/` |
| Routes API | Validation Zod, gardes d'accès, délégation au métier | `src/app/api/**/route.ts` |
| Logique métier | Capacité, liste d'attente, créneaux, messages, exports, journaux | `src/lib/*.ts` |
| Authentification et multi-tenant | NextAuth, proxy, gardes, permissions, limitation de débit, coffre à jetons | `src/auth.ts`, `src/proxy.ts`, `auth-guard.ts`, `permissions.ts`, `rate-limit.ts`, `token-vault.ts` |
| Notifications et observabilité | Outbox, gabarits, email, push, santé, Sentry | `src/lib/notifications/`, `push.ts`, `job-runs.ts`, `report-error.ts`, `src/instrumentation.ts` |
| Données | Schéma, migrations, clients Prisma (dont le client limité à l'organisation) | `prisma/`, `src/lib/prisma.ts`, `src/lib/prisma-org.ts` |
| Infrastructure | Docker, Compose, manifestes k3s, CI | `Dockerfile`, `k8s/`, `.github/workflows/` |
| Tests | Vitest, intégration sur base réelle, Playwright | `src/**/__tests__/`, `src/__integration__/`, `e2e/` |
| Documentation | README, guides, docs techniques, RGPD | `*.md`, `docs/` |

Dépendances principales, en nombre d'imports d'un fichier vers un autre (graphe Understand-Anything, commit 7582053) : Routes API → Logique métier (210), Back-office → Logique métier (155), Routes API → Authentification (126), Pages publiques → Logique métier (51), Routes API → Notifications (42), Routes API → Données (31). La logique métier n'importe presque rien de l'authentification (8), ce qui laisse les règles testables sans session.

## Multi-tenant

- Chaque organisation (`Organization`) possède ses événements, créneaux, membres et admins.
- L'organisation courante d'une page publique vient du sous-domaine : `src/proxy.ts` extrait `[orgSlug]` de `[orgSlug].benevol.app` (`orgSlugFromHost`, `src/lib/org-subdomain.ts`) et le passe dans l'en-tête `x-org-slug`, sauf pour `www`, `app`, `admin`, `api` et `staging`. Sans sous-domaine d'organisation (domaine principal, `localhost`), `?org=<slug>` joue le même rôle. Un en-tête `x-org-slug` envoyé par le client est toujours supprimé avant (`withOrgHeader`) : les routes publiques qui s'en servent ne voient que la valeur du proxy. Un slug historique redirige vers le slug actuel (`resolveOrgSlug`, `src/lib/resolve-org.ts`).
- Côté admin, l'organisation vient de la session (pour le super admin, du cookie `sa-org-id`). `requireOrgSession()` renvoie un client `db` (`getOrgClient`) qui limite chaque opération à l'organisation ; une ligne d'une autre organisation se comporte comme une ligne inexistante. La liste des modèles couverts et les autres garde-fous sont dans [roles-et-permissions.md](roles-et-permissions.md).
- Un changement de slug archive l'ancien dans `OrgSlugHistory` pour rediriger les anciens liens.
- Le slug d'un événement est unique au sein d'une organisation, pas globalement.

## Modèle de données

Modèles Prisma (`prisma/schema.prisma`) :

| Modèle | Rôle |
|--------|------|
| `Organization` | Tenant : slug, `active`, charte, assurance, titre de la page publique (`publicTitle`), fuseau horaire (`timeZone`, vide = `APP_TIME_ZONE`), adresse de réponse (`replyToEmail`), réglages des emails (`notificationSettings`) |
| `OrgSlugHistory` | Anciens slugs |
| `AdminUser` | Compte propriétaire (`admin`), organisateur (`organizer`) ou super admin ; empreintes des jetons d'activation et de réinitialisation ; `sessionVersion` ; abonnement aux nouveautés produit (`receiveProductUpdates`, #200) |
| `Event` | Événement : dates, statut de publication, répertorié ou non (`isListed`), fenêtre d'inscription (`registrationsOpen`, `registrationOpensAt`, `registrationClosesAt`), téléphone obligatoire, rappels activés |
| `Shift` | Créneau : rôle, capacité, statut, liste d'attente activée, ordre, âge minimum optionnel (`minAge`, #192), validation requise (`requiresApproval`), plafond par bénévole (`maxPerVolunteer`), étiquettes réservées (`reservedTags`) |
| `Volunteer` | Bénévole d'une organisation, unique par email et organisation ; `birthDate` optionnel, collecté seulement si un créneau l'exige |
| `Registration` | Inscription d'un bénévole à un créneau : statut, jeton (empreinte et copie chiffrée), position en liste d'attente, dates d'envoi des rappels |
| `MemberInvite` | Invitation d'un membre à un événement : jeton (empreinte et copie chiffrée) |
| `PushSubscription` | Abonnement push |
| `EventPage` | Page statique additionnelle d'un événement (FAQ, lieu, règlement…) : titre, slug, contenu Markdown, ordre |
| `SectorLeader` | Responsable d'un poste (`roleName`) au sein d'un événement : nom, email, jeton d'accès lecture seule (empreinte et copie chiffrée) (#186) |
| `EventMilestone` | Jalon/échéance d'un événement : titre, date, fait/pas fait — purement informatif (#189) |
| `EventLog` | Journal d'un événement : qui a fait quoi sur quel élément, champs modifiés, lien de cause à effet entre entrées (`causedByLogId`) (#187) |
| `OrgLog` | Journal d'audit au niveau de l'organisation : changements sur `Volunteer`/`AdminUser`, pas rattachés à un événement (#194) |
| `EventQuestion` | Question d'inscription d'un événement : libellé, type (`text`, `yesno`, `single`, `multiple`), options, obligatoire, archivée (#483) |
| `QuestionAnswer` | Réponse d'un bénévole à une question, unique par question et bénévole |
| `TargetedMessage` | Message ciblé envoyé : objet, texte, audience, compteurs email et push (#467) |
| `MessageTemplate` | Modèle de message réutilisable de l'organisation (#482) |
| `JobRun` | Dernier état de chaque tâche planifiée : rappels, nettoyage, sauvegardes, test de restauration (#383) |
| `ProductUpdateSend` | Historique des communications de nouveautés produit diffusées aux administrateurs (#200) |
| `NotificationOutbox` | File d'envoi des notifications (voir Notifications) |
| `RateLimit` | Compteurs des limites de tentatives, partagés entre instances (#322) |

Statuts d'une inscription : `active`, `waiting` (en liste d'attente), `offered` (place proposée), `requested` (demande sur un créneau « Sur validation »), `cancelled`, `refused` (demande refusée) et `deleted`. Les valeurs possibles de chaque colonne de statut sont listées dans `src/lib/statuses.ts` et imposées par des contraintes CHECK en base.

## Flux principaux

### Création et publication

1. Un admin crée un événement (brouillon), ajoute des créneaux et le programme des spectacles.
2. Il publie l'événement (refusé tant qu'aucun créneau n'est actif), qui devient visible sur `https://{orgSlug}.benevol.app/{eventSlug}` (en local : `/{eventSlug}?org={orgSlug}`). Un événement non répertorié (`isListed: false`) n'apparaît pas dans la liste de l'organisation mais reste accessible par son lien.
3. Une fois l'événement terminé, il l'archive (`PATCH { publicStatus: "archived" }`). Un événement archivé, et lui seul, peut être supprimé définitivement (`DELETE`, avec confirmation par le titre) : créneaux, inscriptions, invitations et le reste de l'événement partent en cascade, les membres du pool et l'organisation sont conservés, les bénévoles ne sont pas prévenus.

### Invitation des membres

1. L'admin choisit des membres du pool et envoie les invitations. Chaque membre reçoit un lien avec un jeton (`MemberInvite`), réutilisé si le membre est invité à nouveau.
2. Le lien pré-remplit le formulaire d'inscription. Le premier usage est horodaté ; le lien reste valide ensuite.

### Inscription publique (`POST /api/public/registrations`)

1. Limitation à 20 requêtes par heure et par IP, validation Zod (consentement obligatoire).
2. Événement publié et fenêtre d'inscription ouverte (`409` sinon) ; téléphone exigé si l'événement le demande (`400`).
3. Vérification que les créneaux existent, appartiennent à l'événement et sont ouverts (`409` sinon) ; deux créneaux choisis qui se chevauchent : `400`.
4. Postes réservés : seul un membre invité portant l'une des étiquettes du poste peut s'y inscrire (`403`). Réponses aux questions de l'événement validées (`400`). Âge minimum : date de naissance requise (`400`) et vérifiée (`403`). Chevauchement avec les inscriptions existantes d'un bénévole connu : `409`.
5. Dans une transaction qui verrouille les créneaux puis le bénévole : chevauchement vérifié à nouveau, plafond par bénévole du poste, créneau complet (refus, ou liste d'attente si elle est activée). Création du `Volunteer` s'il n'existe pas (unique par organisation et email), d'une `Registration` par créneau avec son jeton (`requested` sur un créneau « Sur validation »), des réponses aux questions et des notifications dans l'outbox.
6. Emails de confirmation (ou d'accusé de demande), notification aux admins de l'organisation si le réglage `signupAdminEmail` est actif (à défaut d'admin, `ADMIN_NOTIFICATION_EMAIL`), aux responsables du poste (après acceptation pour une demande), email de liste d'attente pour les inscriptions `waiting` : envoyés juste après la réponse (voir Notifications).

### Liste d'attente

1. Une annulation (par le bénévole ou l'admin) libère une place et appelle `promoteNextInWaitlist(shiftId)`.
2. La personne la mieux placée passe en `offered` pour 24 heures et reçoit un email avec un lien de confirmation.
3. Sans confirmation, `/api/cron/reminders` fait expirer l'offre et propose la place à la suivante.
4. Le même cron rattrape les promotions manquées (`reconcileWaitlists` : une place libre avec des personnes en attente). Quitter la liste d'attente ne libère aucune place : les suivants remontent.

### Rappels

`/api/cron/reminders` s'exécute toutes les heures. Il envoie un rappel par email, et par push si le bénévole est abonné, pour les créneaux dans l'une de ces fenêtres :

| Rappel | Fenêtre avant le début |
|--------|------------------------|
| J-2 | 47 à 49 h |
| J-1 | 23 à 25 h |
| Jour J | 2 à 4 h |

Chaque envoi est enregistré (`reminderJ2Sent`, `reminderJ1Sent`, `reminderDdSent`) : un rappel n'est envoyé qu'une fois par inscription.

Seules les inscriptions `active` d'un événement publié, aux rappels activés, sur un créneau non annulé, sont concernées. L'organisation peut couper chaque rappel dans ses réglages (#381). Les fenêtres sont calculées dans le fuseau horaire de l'organisation.

### Purge

`/api/cron/cleanup` s'exécute chaque nuit à 02:00 UTC : organisations désactivées depuis 30 jours avec leurs admins, invitations d'admin non acceptées, bénévoles orphelins, jetons de réinitialisation expirés, lignes de l'outbox envoyées et échecs de plus de 30 jours, messages ciblés de plus de 12 mois, fenêtres de limitation expirées, chiffrement des jetons encore en clair. Durées et justification : [retention.md](retention.md).

## Notifications

- Tous les emails passent par `sendNotification()` : aucune route n'appelle Nodemailer directement. Les types de notification sont listés dans [FONCTIONNALITES.md](../FONCTIONNALITES.md).
- Sans `SMTP_HOST` : en production, l'envoi échoue (« SMTP_HOST manquant ») sans rien écrire du destinataire ni du contenu, l'outbox le retente puis alerte Sentry ; en développement et en test, le contenu est affiché dans la console.
- Le push est envoyé séparément (`src/lib/push.ts`) : `sendPushToVolunteer()` pour les rappels, `sendTargetedPush()` pour un message ciblé quand l'admin le demande. Il n'a d'effet que si les clés VAPID sont configurées.
- **Outbox** (`src/lib/notifications/outbox.ts`, table `NotificationOutbox`) :
  - Passent par l'outbox : inscription publique, offre et confirmation de liste d'attente, décision sur une demande, créneau modifié ou annulé, invitation d'un responsable, bienvenue et invitation d'un admin, réinitialisation de mot de passe, renvoi du lien par le bénévole, messages ciblés et renvoi de leurs échecs, email de test des réglages.
  - Restent synchrones, parce que la réponse indique si l'email est parti : invitations de membres et relances, rappel manuel, « renvoyer le lien » depuis l'admin, communications produit, invitation envoyée par le super admin, lien renvoyé après une inscription en double.
  - Transactionnelle : chaque action écrit ses notifications avec le client de la transaction qui fait la modification (`enqueueNotifications(payloads, tx)`, y compris avec `db.$transaction` du client limité à l'organisation), puis les livre après validation (`deliverAfterResponse`, `after()` de Next). La modification et ses emails sont validés ou annulés ensemble. Pour l'inscription publique, les helpers (`sendConfirmationEmail`, `sendAdminNotification`, `notifySectorLeadersOfSignup`) reçoivent un collecteur au lieu de `sendNotification`.
  - Nouvelles tentatives : `/api/cron/reminders` retente les échecs avec un délai croissant (5, 10, 20, 40, 80 min) ; après 6 tentatives, la ligne passe en `failed` et Sentry est prévenu. Un propriétaire ou un organisateur peut la relancer depuis les réglages.
  - Concurrence : chaque ligne est réservée par une mise à jour conditionnelle ; une réservation abandonnée depuis 15 minutes est reprise. Livraison « au moins une fois » : un plantage entre l'acceptation SMTP et le passage à `sent` peut produire un doublon, préféré à un email perdu, qui porte le même `Message-ID` ; une clé métier (`dedupeKey`) évite de mettre deux fois en file la même notification.
  - Santé : le cron horaire alerte Sentry en cas d'échec dans les dernières 24 h, d'email en attente depuis plus de 2 h ou de réservation abandonnée ; la page `/super-admin/health` affiche le même état.
  - Purge : `/api/cron/cleanup` supprime chaque nuit les lignes envoyées et les échecs de plus de 30 jours, car elles contiennent des données personnelles.
- **Résultat d'envoi par destinataire** (`src/lib/notifications/smtp-outcome.ts`, `src/lib/notifications/delivery-outcomes.ts`, table `DeliveryOutcome`, #598) : chaque envoi — par l'outbox ou synchrone — est classé en `accepted_by_relay` (accepté par notre relais SMTP, jamais « délivré »), `rejected_permanent` (5xx, adresse à vérifier), `failed_temporary` (4xx, connexion, délai, ou `SMTP_HOST` absent en production) ou `unknown`, avec un motif normalisé (`mailbox_unknown`, `domain_not_found`…), les codes et une empreinte HMAC de l'adresse normalisée (jamais l'adresse, jamais la réponse SMTP brute) ; voir `src/lib/notifications/channels/email.ts`, unique point d'appel. Un rejet permanent arrête aussitôt les tentatives de l'outbox (`status: "failed"`) au lieu d'épuiser les 6 essais. `src/lib/outbox-view.ts` normalise `lastError` en une phrase en français (jamais le texte brut, y compris pour les lignes écrites avant #598). Lecture org-scopée : `src/lib/delivery-outcomes-data.ts` (base du filtrage « adresses à vérifier » de #599). Purgé avec les mêmes lignes que l'outbox (30 jours), par la suppression en cascade de la fiche (#667) et par l'effacement des données personnelles du bénévole (#516).

## Observabilité

- Sentry : `sentry.server.config.ts` et `sentry.edge.config.ts` sont chargés par `src/instrumentation.ts`, qui exporte aussi `onRequestError` et lance au démarrage les vérifications de `production-guards.ts`. Côté navigateur, `instrumentation-client.ts` ne fait qu'écouter les erreurs : le SDK (`src/lib/sentry-client-init.ts`) est importé quand la page est inactive ou à la première erreur (`src/lib/sentry-client-loader.ts`), et passe par le tunnel `/monitoring`. Session Replay est chargé à part, sur l'espace d'administration seulement (`src/lib/sentry-client-policy.ts`). Les trois configurations filtrent jetons et données personnelles (`src/lib/sentry-scrub.ts`).
- `/api/health` répond `200` si la base est joignable, `503` sinon ; les sondes Kubernetes l'interrogent.
- `/super-admin/health` : base, migrations, file d'envoi, dernière exécution de chaque tâche planifiée (`JobRun`, alimenté par `recordJobRun` dans les crons et par `/api/cron/heartbeat` pour les sauvegardes et le test de restauration), version et commit déployés (`GIT_SHA`).
- Les requêtes qui portent un jeton personnel ne sont pas écrites dans le journal d'accès de Traefik (`k8s/ingressroute-tokens.yaml`, #485).
