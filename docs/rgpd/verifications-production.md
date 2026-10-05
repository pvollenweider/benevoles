# Vérifications de production et des contrats (checklist)

Ce que le dépôt ne permet pas d'établir. Pour chaque point : la preuve à conserver (capture, contrat, page officielle datée) et la date de vérification, reportées ensuite dans [sous-traitants.md](sous-traitants.md) et [inventaire.md](inventaire.md).

## Hébergeur du serveur

- [x] Fournisseur et entité : OVH SAS, Roubaix, éditeur de Kimsufi (adresse du serveur, whois ; mentions légales Kimsufi). Vérifié le 2026-09-30. Reste : entité du contrat dans l'espace client.
- [x] Centre de données : **RBX3**, Roubaix (France), lu dans l'espace client le 2026-09-30. Accès à distance possible de filiales hors UE sous clauses types (DPA § 6.2) : noté dans [sous-traitants.md](sous-traitants.md).
- [x] DPA : « Annexe traitement de données à caractère personnel » acceptée le 2026-04-02 (espace client, liste des contrats), avec les conditions Serveurs dédiés. Version du 3 octobre 2025 (clauses résumées dans [sous-traitants.md](sous-traitants.md)). Courrier d'instructions écrites (§ 8.1) : pas prévu (décision du 2026-09-30, voir [README.md](README.md)). Restent notés : sort des disques remplacés, clause d'hébergeur LCEN.

## Envoi des emails (SMTP)

- [x] Fournisseur : **Gandi Mail**, seul expéditeur autorisé du domaine (SPF, DKIM `gm1`–`gm3`, MX, DMARC strict), observé le 2026-09-30. Confirmation formelle : valeur de `SMTP_HOST` dans le secret de production.
- [x] DPA v2023.0 et localisation (France, sans transfert) documentés ; durée des journaux SMTP et des files : non documentée, pas de demande prévue (décision du 2026-09-30).

## Dropbox (copie hors site)

- [x] **Offre du compte utilisé par rclone** : individuelle (confirmée le 2026-09-30), donc sans DPA ; conservée pour l'instant, migration prévue vers Infomaniak Swiss Backup (#524). Voir « Points d'attention » dans [sous-traitants.md](sous-traitants.md).
- [x] Région de stockage : **États-Unis** (offre individuelle, pas de choix de région) ; accès hors de Suisse et de l'UE possibles par Dropbox et ses sous-traitants. Écart assumé, suivi dans #524.
- [x] DPA : aucun pour l'offre individuelle ; transferts selon les garanties que Dropbox déclare (clauses contractuelles types, Data Privacy Framework). Écrit dans la politique publique (#528).
- [x] Fichiers supprimés : rclone les supprime du Dropbox au-delà de la durée de la matrice, mais ils **restent restaurables** pendant la période de récupération des fichiers supprimés de Dropbox (opérateur, 2026-09-30) : 30 jours en Basic ou Plus, 180 jours en Professional, selon l'aide officielle citée dans [sous-traitants.md](sous-traitants.md). **Reste : relever le nom exact de l'offre individuelle.** Les copies sont chiffrées avant l'envoi, clé hors de Dropbox ; elles restent des données personnelles. La durée réelle de conservation hors site est donc celle de la matrice plus cette période.
- [x] Accès au compte : **l'opérateur uniquement** ; jeton OAuth rclone stocké **seulement dans le secret Kubernetes** (opérateur, 2026-09-30).

## Sentry

- [x] Région : **UE (Francfort)**, observée le 2026-09-30 (le site envoie ses événements à `ingest.de.sentry.io`). Entité : Functional Software, Inc. ; comptes et réglages toujours aux États-Unis.
- [ ] DPA accepté dans l'organisation (le DPA et la liste des sous-traitants sont publics). Fonctions d'IA générative : **visibles** dans l'organisation (console, 2026-09-30) ; à désactiver si non utilisées.
- [x] Offre : **Developer**, donc conservation de **30 jours** (console, 2026-09-30).
- [ ] Taux effectifs : ceux du code (10 % des traces, 10 % des sessions enregistrées, 100 % des sessions en erreur) ne sont pas surchargés par des règles du projet.
- [ ] Filtres côté serveur : nettoyage des données et nettoyeurs par défaut **actifs** sur le projet ; **stockage des adresses IP non bloqué** (organisation et projet) : à activer.

## Services push des navigateurs

- [ ] Conditions applicables des principaux services (Google, Mozilla, Apple, Microsoft), liens officiels.
- [ ] Qualification juridique du rôle de ces services (sous-traitant ou non), par une personne qualifiée.

## Journaux du proxy

Décision : un jeton personnel n'est jamais écrit dans un journal d'accès (`k8s/ingressroute-tokens.yaml`, `Referrer-Policy: strict-origin`).

- [x] Après déploiement, requêtes avec des jetons **factices** sur chaque famille (`/my/`, `/waitlist/…/confirm`, `/leader/`, `/api/public/registrations/`, `/api/public/member-invite/`, `/api/public/leader/`, `/api/public/waitlist/`, `?token=` et `?t=` sur une page d'événement), en HTTPS et en HTTP : aucune trace dans `kubectl -n kube-system logs deploy/traefik`. Une page ordinaire reste journalisée (méthode, statut, durée). Les autres sites du Traefik sont inchangés.
  Vérifié le 2026-09-30 après le déploiement de `6c9335e` : 12 familles (chemin, requête `token` et `t`, recherche admin), 24 requêtes en HTTPS et en HTTP (redirigées en 301), jeton factice unique, **0 ligne** dans le journal de Traefik ; la page témoin (`/doc/admin`) est journalisée ; aucune erreur de routeur. Autres sites : gallerypack.app toujours journalisé ; deck.altsessions.ch ne passe pas par ce serveur (son nom pointe ailleurs), donc hors de cause.
- [x] Réponses des pages : en-tête `Referrer-Policy: strict-origin` présent. Vérifié le 2026-09-30.
- [x] Journaux antérieurs purgés le 2026-09-30, après une nouvelle vérification du routeur : les quatre fichiers tournés du pod Traefik supprimés par leur nom, le fichier actif vidé sur place, sans copie ; les journaux du 1er au ~25 septembre avaient déjà disparu avec la rotation de kubelet ; aucune autre copie (pas de Loki, sauvegardes limitées à la base). Contrôle par comptage : 0 ligne sensible, Traefik journalise toujours. Détail dans #485.

## Serveur

- [ ] Rotation des journaux réellement installée sur le nœud (`k8s/log-rotation.md`) et durée effective des journaux du proxy et des conteneurs. Tant que ce n'est pas prouvé, ne pas annoncer la durée de la matrice comme garantie.
  Constaté le 2026-09-30 (configuration de kubelet lue par l'API, `configz`) : rotation **par taille** seulement, réglages par défaut de k3s, `containerLogMaxSize` 10 Mi et `containerLogMaxFiles` 5 par conteneur ; aucun logrotate ni durée installés (`k8s/log-rotation.md` n'est pas appliqué). Durée effective variable : environ 4 à 5 jours pour Traefik (volume élevé), mais un conteneur peu bavard garde ses journaux jusqu'à la suppression du pod, **possiblement au-delà de 90 jours**. La durée « Journaux techniques » de la matrice n'est donc pas garantie : décider d'une limite de durée (logrotate sur `/var/log/pods`, ou journalisation centralisée avec rétention) avant de l'annoncer.
- [ ] Phrase de passe des sauvegardes : qui la détient, où elle est conservée hors du serveur.
- [ ] Dernier test de restauration réussi (page Santé du service) et procédure qui rejoue les effacements après une restauration.
- [ ] Personnes ayant accès à la production (SSH, kubectl, base, comptes des fournisseurs), pour l'annexe II.

## Documents

- [ ] Relecture juridique de [accord-sous-traitance-brouillon.md](accord-sous-traitance-brouillon.md) sur la base des clauses types de la Commission.
- [ ] Validation de la répartition des rôles ([inventaire.md](inventaire.md)).
- [ ] Validation de [procedure-violation.md](procedure-violation.md) : personnes, délais, canal de signalement.
- [x] Politique publique alignée sur l'état réel, Dropbox compris (#528, 2026-09-30). À revoir après la relecture juridique et le remplacement de Dropbox (#524).
