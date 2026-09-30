# Inventaire des traitements (établi le 30 septembre 2026)

Établi depuis le dépôt. « À confirmer » signale ce que le dépôt ne permet pas d'établir (réglages de production, contrats).

## Rôles

| Données | Responsable de traitement | Sous-traitant |
|---|---|---|
| Bénévoles et membres d'une organisation, leurs inscriptions, les événements, messages et journaux | l'organisation (association, organisateur) | l'opérateur de benevol.app |
| Comptes administrateurs d'une organisation | l'organisation, pour l'usage de son espace ; l'opérateur, pour la sécurité du service | — |
| Journaux techniques, suivi des erreurs | l'opérateur | — |

## Catégories de données et finalités

| Catégorie | Données | Finalité | Source dans le code |
|---|---|---|---|
| Bénévoles | prénom, nom, email, téléphone (facultatif ou exigé par l'événement), date de naissance (seulement pour un créneau avec âge minimum), disponibilités, étiquettes et notes internes posées par l'organisation | inscription aux créneaux, contact, organisation | `prisma/schema.prisma` (Volunteer, Registration), `src/app/api/public/registrations/route.ts` |
| Inscriptions | créneaux choisis, statut, commentaire, pointage de présence | organisation de l'événement | Registration |
| Communications | emails en file d'envoi (destinataire, contenu), messages ciblés (objet, texte, public, nombres) | informer les bénévoles | NotificationOutbox, TargetedMessage |
| Notifications du navigateur | abonnement (point de terminaison, clés) lié au bénévole | rappels et messages urgents | PushSubscription, `src/lib/push.ts` |
| Administrateurs | nom, email, mot de passe haché (bcrypt), rôle | accès à l'administration | AdminUser |
| Journaux d'activité | qui a fait quoi, quand ; valeurs non personnelles | traçabilité | EventLog, OrgLog |
| Sécurité | compteurs de limitation par adresse IP ou identifiant | protection contre les abus | RateLimit |
| Suivi des erreurs | message d'erreur, page sans ses jetons, navigateur ; enregistrement de navigation masqué pour 10 % des sessions et 100 % des sessions en erreur | débogage | `instrumentation-client.ts`, `sentry.*.config.ts` |

Liens personnels : stockés hachés (SHA-256) et chiffrés (AES-256-GCM) en base (`src/lib/token-vault.ts`).

## Hébergement et sauvegardes

| Élément | Où | Source | À confirmer |
|---|---|---|---|
| Application et base PostgreSQL | serveur dédié, cluster k3s | `k8s/`, politique de confidentialité (Kimsufi / OVH, France) | localisation exacte du serveur, contrat |
| Sauvegardes chiffrées (AES-256) | volume du serveur, 30 jours | `k8s/cronjob-backup.yaml` | — |
| Copie hors site des sauvegardes déjà chiffrées | Dropbox, 90 jours | `k8s/cronjob-backup-offsite.yaml` | région de stockage du compte Dropbox (par défaut hors Union européenne) et garanties de transfert |
| Envoi des emails | serveur SMTP configuré dans les secrets | `k8s/secret.yaml` (vide dans le dépôt), politique de confidentialité (Gandi) | fournisseur réellement configuré en production |
| DNS et certificats | Gandi (DNS), Let's Encrypt via cert-manager | `k8s/gandi-webhook.yaml`, `k8s/certificate-wildcard.yaml` | — |
| Notifications du navigateur | services de notification des éditeurs de navigateur (Google, Mozilla, Apple…), choisis par le navigateur du bénévole | `src/lib/push.ts` (web-push) | contenu transmis : titre et première ligne d'un message, lien relatif |
| Suivi des erreurs | Sentry | configuration Sentry, politique de confidentialité (région UE, Allemagne) | région du projet Sentry |

## Suppression, export, droits

- Suppression et durées : [../retention.md](../retention.md).
- Export par l'organisation, sans demande : archive JSON d'un événement, membres et journal en CSV (`GUIDE_ADMIN.md`, « Exporter et conserver ses données »).
- Exercice des droits d'un bénévole : adressé à l'organisation (responsable), qui peut modifier, désactiver ou supprimer le membre ; l'opérateur transmet toute demande reçue par erreur (politique de confidentialité, section 6).
- Fin du service pour une organisation : export, puis désactivation par le super admin ; effacement automatique après le délai de [../retention.md](../retention.md), sauvegardes à l'issue de leur rotation (`docs/deploiement.md`).

## Incidents

Surveillance : alertes Sentry (erreurs, santé de la file d'envoi, tâches planifiées, #383). **À écrire** : procédure de notification d'une violation de données (délais, qui prévient l'organisation, contenu de l'information), à reprendre dans l'accord de traitement.
