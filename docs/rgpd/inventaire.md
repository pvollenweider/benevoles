# Inventaire des traitements (projet, 30 septembre 2026)

Établi depuis le code et la configuration du dépôt ; chaque ligne dit d'où vient l'affirmation. Quatre niveaux sont distingués :

- **implémenté** : ce que fait le code du dépôt ;
- **configuré en production** : dépend des réglages du serveur ou des comptes, que le dépôt ne montre pas ;
- **garanti par contrat** : dépend d'un contrat avec un fournisseur ;
- **à décider** : choix encore ouvert.

« À confirmer » signale tout ce qui n'est pas implémenté dans le dépôt ; la liste des vérifications est dans [verifications-production.md](verifications-production.md). Les durées de conservation ne sont pas redites : [../retention.md](../retention.md), généré depuis `src/lib/retention.ts`, fait foi.

Des données pseudonymisées (identifiants internes) ou chiffrées restent des données personnelles tant que l'opérateur garde les moyens de les rattacher aux personnes : c'est le cas partout ci-dessous, puisque l'opérateur détient la base et les clés.

## Rôles (à faire valider par une personne qualifiée)

| Traitement | Responsable | Rôle de l'opérateur |
|---|---|---|
| Bénévoles, membres, inscriptions, réponses, messages et journaux d'une organisation | l'organisation | sous-traitant (art. 28 RGPD, art. 9 nLPD) |
| Comptes administrateurs, pour l'usage de l'espace de l'organisation (qui gère quoi, invitations d'équipe) | l'organisation | sous-traitant |
| Comptes administrateurs, pour l'authentification, la sécurité du service, la prévention des abus | l'opérateur | responsable distinct |
| Journaux techniques (proxy, conteneurs), suivi des erreurs, compteurs de limitation | l'opérateur | responsable distinct, pour la sécurité et le fonctionnement du service |
| Relation contractuelle et, plus tard, facturation avec l'organisation | l'opérateur | responsable distinct |

La répartition des données des administrateurs entre ces finalités est **à décider** avec le conseiller juridique.

## Catégories de données (implémenté)

| Catégorie | Données | Finalité | Source |
|---|---|---|---|
| Bénévoles (membres) | prénom, nom, email, téléphone, date de naissance (seulement si un créneau exige un âge minimum), disponibilités et remarque, étiquettes et notes internes posées par l'organisation, statut actif | inscription, contact, organisation | `Volunteer` (`prisma/schema.prisma`) |
| Fiche absorbée par une fusion de membres (#600) | identifiant de la fiche conservée (`mergedIntoId`), date de la fusion ; **aucune donnée personnelle** (nom, email, téléphone, notes, date de naissance et étiquettes vidés à la fusion) | rectification (art. 16 RGPD) : fusionner deux fiches confirmées comme la même personne, sans perdre l'historique de l'organisation | `Volunteer.mergedIntoId`/`mergedAt`, `src/lib/member-merge-transaction.ts` ; purgée par le nettoyage quotidien ([../retention.md](../retention.md)) |
| Inscriptions | créneau, statut (confirmée, liste d'attente, place proposée, demande, annulée, refusée), source, commentaire libre du bénévole, téléphone donné pour l'inscription, pointage de présence, dates d'envoi des rappels et du lien | organisation de l'événement | `Registration` |
| Réponses aux questions de l'événement | valeurs saisies (texte court, oui/non, choix), rattachées au bénévole et à l'événement | information demandée par l'organisation (taille de t-shirt, permis, régime…) | `EventQuestion` (archivée et non effacée quand elle a des réponses, `archivedAt`), `QuestionAnswer`, `src/lib/event-questions.ts` |
| Liens personnels du bénévole | jeton de gestion de l'inscription | accès sans compte à la page personnelle | `Registration.editTokenHash` (SHA-256) et `editTokenEnc` (AES-256-GCM), `src/lib/token-vault.ts` |
| Invitations de membres | jeton de l'invitation (haché et chiffré), date d'envoi, date de première utilisation, date de la réponse « pas disponible » le cas échéant (#558) | inviter un membre à un événement | `MemberInvite` |
| Responsables de secteur | nom, email, poste, jeton personnel (haché et chiffré) | suivi d'un poste sans compte | `SectorLeader` |
| Abonnements aux notifications du navigateur | adresse du service push (`endpoint`), clés `auth` et `p256dh`, date, bénévole | rappels et messages urgents, si le bénévole les active | `PushSubscription`, `src/lib/push.ts` |
| Emails en file d'envoi | destinataire et contenu rendu à partir des données du bénévole, liens personnels compris, chiffrés (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) quand la clé est configurée, en clair sinon ; `lastError` (code normalisé depuis #598 : résultat, motif, codes SMTP — jamais la réponse brute ni l'adresse, y compris pour les lignes écrites avant #598), `dedupeKey` (identifiants internes), organisation, message ciblé | envoi fiable avec reprise | `NotificationOutbox`, `sealPayload` dans `src/lib/notifications/outbox.ts` |
| Résultat d'envoi par destinataire (#598) | organisation, bénévole concerné (nul pour un admin, un responsable de secteur ou un email de test), type de notification, résultat (accepté par le relais / rejet permanent / échec temporaire / non classé), motif normalisé, code SMTP et code étendu, ligne de file d'attente liée, empreinte HMAC-SHA256 de l'adresse normalisée (clé `AUTH_SECRET`, réutilisée du même procédé que `src/lib/product-updates.ts`) ; jamais la réponse SMTP brute, jamais l'adresse en clair, jamais le contenu, jamais un jeton | fournir l'email à l'organisation, et laisser l'organisation corriger une adresse en échec (prépare #599) | `DeliveryOutcome`, `src/lib/notifications/smtp-outcome.ts`, `src/lib/notifications/delivery-outcomes.ts` |
| Messages ciblés | objet, texte, public, nombres d'envois, **identité de l'administrateur auteur** (`authorId`, `authorName`) | historique des communications | `TargetedMessage` |
| Modèles de message | nom, objet, texte | rédaction | `MessageTemplate` |
| Administrateurs | nom, email, mot de passe haché (bcrypt), rôle, organisation, statut actif (faux tant que l'invitation n'est pas acceptée), `sessionVersion`, empreintes SHA-256 des liens d'activation et de réinitialisation avec leur échéance, abonnement aux nouveautés produit et date de désabonnement | accès à l'administration | `AdminUser` |
| Sessions d'administration | JWT signé (`AUTH_SECRET`) : identifiant, rôle, organisation, email, nom ; cookie `sa-org-id` du super admin (organisation choisie) | authentification | cookies du navigateur, rien en base |
| Journaux d'activité | acteur (type et identifiant : administrateur, bénévole pour `EventLog` seulement, ou système), action, entité (type et identifiant), champs modifiés avec des valeurs minimisées, date | traçabilité | `EventLog`, `OrgLog` |
| Compteurs de limitation | clé `<route>:<valeur>` où la valeur est **l'adresse IP** du client, **l'adresse email saisie à la connexion**, ou un identifiant (administrateur, organisation, bénévole) selon la route ; nombre, échéance | protection contre les abus | `RateLimit`, `src/lib/rate-limit.ts` (`getClientIp`) |
| Contact d'un créneau | nom et téléphone de la personne de contact, consignes | informer les bénévoles du créneau | `Shift.contactName`, `contactPhone`, `instructions` |
| Notes internes d'un créneau | texte libre des organisateurs | organisation | `Shift.internalNotes` |
| Organisation | nom, adresse de réponse des emails (`replyToEmail`, parfois une adresse personnelle), charte | fonctionnement de l'espace | `Organization` |
| Liste d'attente | position, dates de l'offre et de son échéance | attribution des places libérées | `Registration.waitingPosition`, `waitingOfferedAt`, `waitingExpiresAt` |
| Nouveautés produit | objet, contenu, auteur (`sentByAdminId`), nombres d'envois | informer les administrateurs | `ProductUpdateSend` (aucune purge) |
| Exécutions des tâches planifiées | tâche, dates, résultat, résumé chiffré, message d'erreur | supervision | `JobRun`, une ligne par tâche, remplacée à chaque exécution |
| Champs libres | commentaire d'inscription, notes internes, textes des messages, réponses texte, pages de l'événement | selon l'usage de l'organisation | — |

Sans `TOKEN_ENCRYPTION_KEY`, les jetons de `Registration`, `MemberInvite` et `SectorLeader` sont stockés **en clair** dans les colonnes héritées (`editToken`, `token` en base ; champs Prisma `editTokenLegacy`, `tokenLegacy`), comme le contenu de la file d'envoi. En production, l'application refuse de démarrer sans cette clé (`src/lib/production-guards.ts`) ; le nettoyage quotidien chiffre et vide les valeurs en clair restées d'avant sa configuration (`src/lib/token-encryption-job.ts`).

Les journaux d'activité ne sont **pas** dépourvus de données personnelles : `changes` évite les valeurs (« (rempli) » plutôt que le texte), mais les identifiants d'acteur et d'entité désignent des personnes.

Les champs libres peuvent contenir n'importe quelle donnée, y compris des catégories particulières (une information de santé glissée dans un régime alimentaire, par exemple), selon ce que saisissent l'organisation et les bénévoles. Le service ne les demande pas, mais ne peut pas l'empêcher.

## Journaux techniques et suivi des erreurs

- **Proxy (Traefik)** : les journaux d'accès sont activés (`k8s/traefik-config.yaml`, `logs.access.enabled: true`). Ils contiennent la date, le routeur, la méthode, le statut, la durée, la taille, l'adresse IP et le chemin demandé ; les en-têtes ne sont pas journalisés. **Les jetons personnels n'y figurent pas** (décision du 2026-09-30 : ce sont des secrets d'authentification). Les requêtes qui en portent un, dans le chemin (`/my/`, `/waitlist/`, `/leader/`, `/api/public/registrations/`, `/api/public/member-invite/`, `/api/public/leader/`, `/api/public/waitlist/`) ou dans la requête (`token`, `t`), ainsi que la recherche de l'administration (`q`, souvent un nom), passent par un routeur sans journal d'accès (`k8s/ingressroute-tokens.yaml`), en HTTPS comme en HTTP ; et l'application n'envoie jamais de chemin dans le `Referer` (`Referrer-Policy: strict-origin`). Réglage limité à benevol.app : le Traefik partagé et les autres sites ne changent pas. Les journaux écrits avant ce réglage ont été purgés le 2026-09-30 (voir [verifications-production.md](verifications-production.md), « Journaux du proxy »). Conservation prévue : « Journaux techniques » dans [../retention.md](../retention.md). **Rotation à confirmer en production** : `k8s/log-rotation.md` décrit une procédure manuelle, le dépôt ne l'installe pas.
- **Sentry** (implémenté : `sentry.*.config.ts`, `instrumentation-client.ts`, `src/lib/sentry-scrub.ts`) :
  - envoi seulement depuis les builds de production ;
  - `dataCollection` coupe les informations utilisateur, cookies, en-têtes HTTP, corps de requête, paramètres de requête, données de requêtes SQL et variables des piles ; `includeLocalVariables: false` côté serveur ;
  - les jetons personnels sont remplacés par `[token]` dans les URL, fils d'Ariane, étiquettes et spans ;
  - les événements du navigateur passent par `/monitoring` (tunnel sur le domaine de l'application, `next.config.ts`), relayés par le serveur vers Sentry ;
  - traces : 10 % ; enregistrements de navigation : 10 % des sessions et 100 % des sessions avec erreur, textes masqués et médias bloqués (`maskAllText`, `blockAllMedia`).

  Ces mesures réduisent fortement ce qui part, sans garantir qu'aucune donnée personnelle ne puisse être transmise : un message d'erreur, une URL nettoyée, un identifiant interne ou la structure d'une page enregistrée peuvent en être.

- **Adresse de secours de l'opérateur** : si une organisation n'a aucun administrateur actif, les notifications de nouvelle inscription (nom, email du bénévole, créneaux) sont envoyées à `ADMIN_NOTIFICATION_EMAIL` (`src/lib/notification-helpers.ts`). **À confirmer en production** : cette variable est définie, et qui lit cette boîte.

## Hébergement, envoi et sauvegardes

| Élément | Implémenté (dépôt) | À confirmer |
|---|---|---|
| Application et base PostgreSQL | cluster k3s sur un serveur (`k8s/`) | établi dans [sous-traitants.md](sous-traitants.md) : OVH SAS, Kimsufi KS-LE-1, datacenter RBX3 (Roubaix), DPA accepté le 2026-04-02 |
| Sauvegardes locales | `pg_dump` chiffré (`openssl enc -aes-256-cbc -pbkdf2`, phrase de passe dans un secret Kubernetes), sur le volume du serveur (`k8s/cronjob-backup.yaml`) | qui détient la phrase de passe, où elle est conservée hors du serveur |
| Copie hors site | les fichiers déjà chiffrés sont copiés chaque nuit vers Dropbox par rclone, puis supprimés au-delà de la durée de [../retention.md](../retention.md) (`k8s/cronjob-backup-offsite.yaml`) | offre individuelle confirmée le 2026-09-30 : stockage aux États-Unis, pas de DPA (voir [sous-traitants.md](sous-traitants.md)) ; remplacement prévu (#524) |
| Envoi des emails | serveur SMTP défini par les secrets (`SMTP_HOST`…), vides dans le dépôt | Gandi observé par le DNS (SPF, DKIM, voir [sous-traitants.md](sous-traitants.md)) ; valeur de `SMTP_HOST` en production et durée des journaux SMTP à confirmer |
| Notifications du navigateur | `web-push` avec clés VAPID (`src/lib/push.ts`) ; le contenu (titre, première ligne, lien relatif) est chiffré pour l'abonnement du navigateur (RFC 8291) ; durée de vie demandée au service : 3 jours (`TTL`) | voir ci-dessous |
| DNS et certificats | Gandi (DNS, webhook cert-manager), Let's Encrypt (`k8s/gandi-webhook.yaml`, `k8s/certificate-wildcard.yaml`) | inventaire technique seulement : pas de données des bénévoles, a priori pas des sous-traitants au sens contractuel |

La sauvegarde chiffrée réduit le risque d'une copie chez Dropbox, mais ne fait pas disparaître les obligations liées aux données personnelles et aux transferts : l'opérateur détient la clé.

### Notifications du navigateur (implémenté, qualification à valider)

- **Stocké par l'application** : endpoint et clés de l'abonnement, bénévole, date.
- **Envoyé au service push** : un message chiffré, l'endpoint (qui identifie l'abonnement), l'identification VAPID de l'opérateur (adresse de contact, clé publique) et des en-têtes techniques (durée de vie).
- **Observable par le service push** : l'existence, l'heure et la taille des messages, l'adresse IP du serveur émetteur, l'appareil destinataire. Pas le contenu, qui est chiffré.
- **Facultatif** : activé par le bénévole depuis sa page personnelle, désactivable au même endroit ou dans le navigateur ; un abonnement que le service déclare expiré (410, 404) est supprimé.
- **Conservation** : « Abonnements aux notifications » dans [../retention.md](../retention.md).
- **Rôle du fournisseur** (Google, Mozilla, Apple, Microsoft selon le navigateur) : **à qualifier juridiquement**. Qu'il soit choisi par le navigateur du bénévole ne suffit pas à conclure qu'il n'est pas un sous-traitant.

## Droits des personnes et fin du service

- **Accès et portabilité** : l'organisation exporte ses membres (CSV, qui inclut depuis #598 les résultats d'envoi du membre — date, type, résultat et motif en français, jamais la réponse SMTP brute), l'archive JSON d'un événement et son journal (`GUIDE_ADMIN.md`, « Exporter et conserver ses données ») ; le bénévole voit ses inscriptions sur sa page personnelle.
- **Rectification** : l'organisation modifie la fiche ; le bénévole modifie ses disponibilités et peut se réinscrire (ses réponses ne sont remplacées qu'avec la preuve de son adresse, #512).
- **Effacement individuel : pas disponible.** L'action « supprimer » un membre (`DELETE /api/admin/members/[id]`) le **désactive** seulement (`active: false`) : la fiche, ses inscriptions, réponses, invitations et abonnements restent en base tant que l'organisation existe. Seuls les bénévoles sans organisation ni inscription sont effacés automatiquement ([../retention.md](../retention.md)).
  - Procédure actuelle d'une demande d'effacement : l'organisation la transmet à l'opérateur, qui l'exécute en base à la main. **À écrire** : la procédure (vérification de la demande, tables concernées, trace dans un registre des demandes) ; **ticket produit** listé dans le [README](README.md).
  - Préparé pour #516 : les résultats d'envoi (`DeliveryOutcome`) sont liés au bénévole par une clé étrangère en cascade (`onDelete: Cascade`) — le jour où #516 efface un bénévole, ses résultats d'envoi le sont avec lui sans code supplémentaire à écrire.
- **Opposition, limitation** : pas de mécanisme dédié ; désactivation du membre, désabonnement des notifications, annulation de l'inscription.
- **Fin du service pour une organisation** : export, désactivation par le super admin, effacement automatique après le délai de [../retention.md](../retention.md).
- **Sauvegardes** : elles contiennent les données effacées jusqu'à la fin de leur rotation ; aucune restauration sélective n'existe. Une restauration réintroduirait des données effacées depuis la sauvegarde : **à décider**, une procédure qui rejoue ensuite les effacements inscrits au registre des demandes.
