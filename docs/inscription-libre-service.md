# Inscription en libre-service

Une association crée son espace elle-même depuis `/inscription` (#810). Cette page décrit le parcours, ce que l'opérateur voit et fait, et les protections contre les abus. Le parcours côté association est expliqué aux organisateurs dans [content/guide/creer-son-espace.md](../content/guide/creer-son-espace.md) (`/doc/creer-son-espace`).

## Parcours

1. **Formulaire** (`/inscription`, `src/components/public/signup/SignupForm.tsx`, `POST /api/public/signup`) : nom de l'association, « Votre association et votre besoin » (20 à 1000 caractères), nom et adresse email de la personne. Règles dans `src/lib/signup.ts`. La réponse est toujours la même (« Vérifiez votre boîte email »), que l'email parte ou non : adresse déjà connue, demande bloquée, envoi trop rapide ou limite atteinte ne se distinguent pas.
2. **Demande** (`SignupRequest`) : enregistrée avec l'empreinte d'un jeton, valable 24 heures (`SIGNUP_LINK_HOURS`). L'email « Confirmez votre adresse pour créer votre espace benevol.app » ne contient que le lien, aucun texte saisi. Aucun email ne part si l'adresse a déjà un compte.
3. **Confirmation** (`/inscription/confirmer?t=…`) : ouvrir le lien ne change rien (les antivirus de messagerie ouvrent les liens) ; le bouton **Confirmer et créer mon espace** (`POST /api/public/signup/confirm`, `confirmSignupRequest` dans `src/lib/signup-server.ts`) crée, une seule fois :
   - l'organisation, **en attente de validation** : `publicationApprovedAt` et `outboundEmailApprovedAt` à `null`, `signupDescription` recopiée de la demande ;
   - son compte propriétaire, **inactif**, avec un lien d'activation valable 7 jours.
4. **Mot de passe** : le navigateur est envoyé directement sur la page d'activation habituelle (`/admin/accept-invite`). Le même lien part aussi par email (« Bienvenue sur benevol.app : choisissez votre mot de passe », type `signup_account_link`, email de la plateforme sans organisation, sans texte saisi ; il explique la validation en attente et donne les pages du guide pour démarrer, listées dans `src/lib/signup-welcome.ts`), pour la personne qui fermerait la page.
5. **Alerte** à l'opérateur : « Nouvelle demande d'espace », par ntfy et par email, avec le nom de l'espace et le début de sa description (voir [deploiement.md](deploiement.md#alertes-à-lopérateur)).

## Espace en attente

Tant qu'il n'est pas validé (`src/lib/org-approval.ts`) :

- tout se prépare : événements, postes, créneaux, membres, pages, logo (visible de ses administrateurs et du super admin seulement), aperçu ;
- **pas de publication** : la publication est refusée et les pages publiques de l'espace ne répondent pas (`PUBLIC_ORG_WHERE`). Le bouton **Publier** devient **Demander la publication** (`POST /api/admin/events/[id]/publication-request`) : il alerte l'opérateur (« Demande de publication », ntfy et email, au plus une fois par espace et par jour) et affiche le message d'attente, sans délai promis ;
- **pas d'email à des tiers** : seuls ses administrateurs **actifs** reçoivent des emails ; une invitation ou un message à un bénévole ne part pas ;
- un bandeau le dit en haut de l'administration de l'espace.

Les deux autorisations sont séparées pour pouvoir, plus tard, les accorder une à une. Toute autre création d'organisation (super admin, scripts) les accorde d'office.

## Ce que fait l'opérateur

- **Voir les demandes** : un bandeau de l'espace super admin donne le nombre d'espaces en attente, le bouton « Super Admin » du menu le porte en pastille (et « Organisations (N en attente) » dans le menu), et « Santé du service » a une ligne « Espaces en attente de validation », à surveiller quand une demande attend depuis plus de 24 heures ; dans `/super-admin/organizations`, ils portent la mention « en attente de validation ». Un récapitulatif quotidien (« espaces en attente ») arrive tant qu'il en reste, en précisant ceux qui attendent depuis plus de 24 heures.
- **Juger** : la fiche de l'espace (`/super-admin/organizations/<identifiant>`) montre le bloc « Demande d'inscription » (la description saisie, en texte brut, liens non cliquables), ses administrateurs et ses chiffres.
- **Valider l'espace** : accorde la publication et les emails ; chaque administrateur de l'espace reçoit « Votre espace benevol.app est activé ».
- **Refuser et supprimer** : l'espace est supprimé avec ses comptes, sans email.
- **Journal de l'opérateur** (`/super-admin/journal`) : chaque décision (valider, refuser, suspendre, désactiver, supprimer, bloquer, débloquer) y reste, avec son auteur et sa raison, même quand l'espace a été supprimé depuis. Les validations automatiques y figurent avec l'auteur « Validation automatique » (`source = "automatic"`), comme les activation, changement de date, désactivation, expiration et coupure de l'option.

## Validation automatique pendant une absence

L'opérateur peut laisser la validation automatique faire le travail pendant quelques jours, sans attendre pour valider chaque nouvel espace. C'est une option du **service hébergé** seulement, désactivée par défaut, sans variable d'environnement : elle se règle dans `/super-admin/blocklist`, section « Validation automatique des nouveaux espaces », à côté de l'interrupteur des inscriptions. La page rappelle : « Tant qu'elle est activée, un espace créé par l'inscription est validé tout seul, 5 à 10 minutes après que son responsable a activé son compte, sans aucune vérification. Les espaces déjà en attente vous restent. »

- **Réglage** : une ligne `PlatformSetting` (clé `signup.autoApproval`, `src/lib/auto-approval.ts`), avec le dernier jour choisi (`until`), l'instant et l'auteur de l'activation, le budget du jour UTC (`budgetDate`, `budgetUsed`), le total de la session (`totalSinceActivation`), la coupure (`cutOffAt`, `cutOffSeenAt`, `cutOffAlertedAt`) et l'expiration (`expiredAt`). Le dernier jour est **inclus** et se termine à minuit dans le fuseau de la plateforme (`APP_TIME_ZONE`, `Europe/Zurich` par défaut), celui des dates de l'espace super admin ; la date se choisit entre aujourd'hui et aujourd'hui + 30, jours inclus, et le serveur la revérifie.
- **Ce qu'elle valide** : uniquement un espace créé par l'inscription en libre-service (`Organization.signupAt`), créé **après** l'activation de l'option, actif, non suspendu, avec au moins une des deux autorisations encore vide, dont le compte propriétaire créé par l'inscription est **actif depuis au moins 5 minutes** (`AdminUser.activatedAt`, écrit par la transaction d'activation du compte) et dont l'adresse et le domaine ne sont pas dans la liste de blocage **au moment de la décision**. Un espace déjà en attente quand l'option est activée reste à l'opérateur ; un espace validé, suspendu ou refusé entre-temps ne consomme rien.
- **Quand** : une étape au tout début de `/api/cron/outbox` (toutes les 5 minutes, `concurrencyPolicy: Forbid`), avant l'envoi de la file : l'email « Votre espace est activé » part dans la même exécution. Une erreur de l'étape est signalée (`reportError`) et n'empêche jamais l'envoi des emails.
- **Plafond** : au plus **20 validations par jour UTC**. Atteint, l'option est coupée dans la même transaction, l'entrée `auto_approval.cut_off` est écrite et **une seule** alerte opérateur part (ntfy et email, clé `auto-approval-cut-off:<jour UTC>`), une fois par jour. L'avis ambre reste sur la page jusqu'à « Masquer cet avis » ou une nouvelle activation. Chaque validation automatique, elle, n'alerte pas : le plafond est l'alerte.
- **Journal et marque** : chaque validation automatique écrit `organization.approved` avec `source = "automatic"`. `Organization.autoApprovedAt` n'est écrit que par ce chemin, dans la transaction de la validation ; `Organization.autoApprovalReviewedAt` par « Marquer comme relu » sur la fiche de l'espace. La liste `/super-admin/organizations?filtre=auto-a-relire` filtre les « Validation automatique, à relire » ; la phrase de la liste dit le filtre et « Voir tous les espaces » revient à la liste complète.
- **Envois en masse** : tant qu'un espace validé automatiquement n'est pas marqué comme relu, ses envois en masse (messages ciblés, invitations de membres, rappels manuels, créneaux à compléter, demandes de disponibilités) sont plafonnés à 100 par jour au lieu de 2000 (`EMAIL_LIMIT_ORG_BULK_PER_DAY_UNREVIEWED`, [configuration.md](configuration.md)), dans la même fenêtre de 24 heures ; au-delà, les emails sont retenus comme pour le plafond normal et l'alerte « plafond d'envoi atteint » nomme ce plafond réduit. « Marquer comme relu » rend le plafond normal dès l'email suivant ; les autres plafonds ne changent pas.
- **Expiration** : après le dernier jour inclus, l'état est « expirée » et se comporte comme « désactivée » ; la première exécution qui le constate écrit une entrée `auto_approval.expired`, une seule fois.
- **Auto-hébergement** : la section n'est pas affichée, les routes répondent 403 avec « La validation automatique n'existe que sur le service hébergé. » et l'étape ne fait rien.

## Note développeur : un seul point d'entrée

La validation d'un espace passe par `approveOrganization` (`src/lib/org-approval-server.ts`), appelée dans la transaction de la route de revue (`POST /api/super-admin/organizations/[id]/review`) et, pour la validation automatique, dans celle de l'étape (`src/lib/auto-approval-server.ts`) : c'est le point d'entrée unique. La fonction accorde les deux autorisations (`publicationApprovedAt`, `outboundEmailApprovedAt`) par une écriture conditionnelle — espace actif, non suspendu, au moins une des deux encore vide (un espace est en attente dès qu'une autorisation manque) — et remplit toujours les deux horodatages, comme le faisait la route avant ce changement. Avec l'acteur `{ type: "automatic" }`, elle écrit aussi `Organization.autoApprovedAt` dans la même écriture. Puis elle écrit le journal de l'organisation, celui de l'opérateur (avec `source = "automatic"` pour la validation automatique) et met en file les emails « Votre espace est activé » aux administrateurs (hors accueil, #1142). Une écriture qui ne trouve aucune ligne ne produit ni journal ni email : elle rend `not_found`, `already_approved` (les deux autorisations déjà accordées), `inactive` ou `suspended`. Le refus et l'activation d'un compte prennent leurs verrous dans le même ordre : d'abord les lignes `AdminUser` de l'organisation (par identifiant), puis la ligne `Organization` ; la validation ne prend que la ligne `Organization` (elle lit les administrateurs sans les verrouiller) et la suspension aussi (`FOR NO KEY UPDATE`, sans verrou `AdminUser`). Ces ordres ne forment donc pas de cycle : une validation, un refus, une suspension et une activation simultanés s'attendent ou s'excluent, sans interblocage. L'étape automatique prend en plus le verrou de la ligne `PlatformSetting` avant de relire le réglage et le budget ; deux exécutions simultanées ne valident donc un espace qu'une fois et ne consomment qu'une unité.

## Indicateurs

« Statistiques » (`/super-admin/stats`), section « Inscription en libre-service » (`src/lib/signup-indicators.ts`, requêtes dans `loadSignupFacts`, `src/lib/usage-stats.ts`) : ce qui dit si la validation à la main reste nécessaire.

- depuis le début (compteurs qu'une suppression ne baisse jamais, déclencheurs de la base) : demandes d'espace, espaces créés par l'inscription, envois reportés par un plafond (compté à chaque report), envois abandonnés pour trop d'emails à la même adresse ;
- sur 12 mois (le journal de l'opérateur garde un an) : espaces validés, refusés, délai médian entre la création et la validation ;
- en ce moment : espaces en attente, espaces jamais utilisés (aucun événement, créés il y a plus de 7 jours), organisations suspendues.

Un espace créé par l'inscription porte `Organization.signupAt`. Pour les espaces créés avant cette colonne, la migration l'a déduit : description d'inscription, autorisation manquante, ou validation plus d'une minute après la création.

## Lien d'activation perdu

Si la personne ferme la page avant de choisir son mot de passe, l'email « Bienvenue sur benevol.app : choisissez votre mot de passe » lui donne le lien (7 jours) ; la page « Demande déjà confirmée » le lui rappelle. « Mot de passe oublié » ne sert pas à un compte inactif. Si le lien a expiré ou si l'email manque, la personne écrit à contact@benevol.app ; sur la fiche de l'espace, **Renvoyer l'invitation** crée un nouveau lien (l'ancien cesse de fonctionner) et l'affiche sous le tableau des administrateurs. L'email d'invitation peut ne pas partir, puisque l'espace en attente n'écrit qu'à ses administrateurs actifs : transmettre alors le lien affiché.

## Protections contre les abus

Pas de CAPTCHA (accessibilité, vie privée). À la place :

- un champ piège invisible et une durée minimale de remplissage (3 secondes) : une soumission automatique reçoit la réponse habituelle et rien n'est enregistré ;
- 5 demandes par heure et par adresse IP ;
- les plafonds d'envoi d'emails (`src/lib/notifications/send-limits.ts`) : par destinataire pour les emails déclenchés depuis une page publique, et 60 emails de confirmation par heure pour toute la plateforme (`EMAIL_LIMIT_SIGNUP_PER_HOUR`) ;
- les noms saisis refusent liens, adresses et retours à la ligne, et l'email de confirmation ne reprend aucun texte saisi : il ne peut pas servir à faire passer un message ;
- la **liste de blocage** (`/super-admin/blocklist`) : une adresse email, un domaine (confirmation demandée pour un fournisseur courant) ou une adresse IP (toujours pour une durée limitée, conservée sous forme d'empreinte), avec une raison. Une demande bloquée reçoit la réponse habituelle et rien n'est enregistré ; un blocage posé entre la demande et la confirmation vaut aussi ;
- la **suspension** d'une organisation pour abus, depuis sa fiche (`src/lib/org-suspension.ts`) : ses administrateurs ne se connectent plus (même si une écriture incohérente l'avait laissée active), ses pages publiques et les liens de ses bénévoles et responsables de secteur ne répondent plus, et ses emails en attente sont annulés ; ses données sont conservées. Une réactivation, par ses administrateurs ou par l'opérateur, est décidée sous le verrou de la ligne de l'organisation : une suspension posée au même moment l'emporte toujours.

## Fermer l'inscription

**Depuis l'espace super admin**, sans déploiement : « Inscriptions et blocage » (`/super-admin/blocklist`), bouton **Fermer les inscriptions** (puis **Rouvrir les inscriptions**). Effet immédiat sur le formulaire et sur les liens de confirmation déjà envoyés ; la décision est inscrite au journal de l'opérateur. Stocké dans `PlatformSetting` (clé `signup`), lu à chaque demande par `isSignupOpen` (`src/lib/signup-switch.ts`).

**Par la configuration** : `SIGNUP=off` ferme aussi l'inscription, et l'emporte sur le bouton (qui ne peut pas rouvrir ce que la configuration a fermé) : la page affiche « Les inscriptions sont fermées pour le moment » avec l'adresse contact@benevol.app, et l'API répond 403. En production, c'est le secret GitHub `SIGNUP`, recopié à chaque déploiement : il prend effet au déploiement suivant (voir [deploiement.md](deploiement.md#changer-un-secret-en-production)). Pour fermer tout de suite, sans attendre de déploiement :

```bash
kubectl -n benevoles set env deployment/benevoles-app SIGNUP=off
# rouvrir
kubectl -n benevoles set env deployment/benevoles-app SIGNUP-
```

`set env` redémarre le pod et remplace, dans le Deployment, la valeur que `k8s/deployment.yaml` prend dans le secret. Tant qu'elle est en place, un déploiement s'arrête à l'étape « Deploy app » (Kubernetes refuse une variable qui a à la fois une valeur et une référence au secret) : l'ancienne version continue de servir, inscription fermée. Pour revenir à la configuration sans rouvrir, poser le secret GitHub `SIGNUP=off`, puis rendre à la variable sa référence au secret : `kubectl -n benevoles set env deployment/benevoles-app --from=secret/benevoles-secret --keys=SIGNUP` (elle prend la valeur recopiée au dernier déploiement : relancer le déploiement s'il s'est arrêté avant). Après `SIGNUP-`, le déploiement suivant remet aussi la référence. Le bouton de l'espace super admin n'a pas cette limite.

## Conservation

Une demande (confirmée ou non) est effacée 7 jours après sa création par le nettoyage quotidien. Un espace dont le propriétaire n'a jamais choisi son mot de passe est effacé avec son compte 30 jours après sa création (`abandonedSignupSpaceWhere`, `src/lib/org-review.ts`) : sans cela, il resterait en attente pour toujours, sans administrateur, dans le compte des espaces en attente. La description reste ensuite sur la fiche de l'espace, pour l'opérateur, et suit les règles de l'organisation (voir [retention.md](retention.md)).
