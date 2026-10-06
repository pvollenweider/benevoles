# Vérifications de production et des contrats (checklist)

Ce que le dépôt ne permet pas d'établir. Pour chaque point : la preuve à conserver (capture, contrat, page officielle datée) et la date de vérification, reportées ensuite dans [sous-traitants.md](sous-traitants.md) et [inventaire.md](inventaire.md).

## Hébergeur du serveur

- [x] Fournisseur et entité : OVH SAS, Roubaix, éditeur de Kimsufi (adresse du serveur, whois ; mentions légales Kimsufi). Vérifié le 2026-09-30. Reste : entité du contrat dans l'espace client.
- [x] Centre de données : **RBX3**, Roubaix (France), lu dans l'espace client le 2026-09-30. Accès à distance possible de filiales hors UE sous clauses types (DPA § 6.2) : noté dans [sous-traitants.md](sous-traitants.md).
- [x] DPA : « Annexe traitement de données à caractère personnel » acceptée le 2026-04-02 (espace client, liste des contrats), avec les conditions Serveurs dédiés. Version du 3 octobre 2025 (clauses résumées dans [sous-traitants.md](sous-traitants.md)). Courrier d'instructions écrites (§ 8.1) : pas prévu (décision du 2026-09-30, voir [README.md](README.md)). Restent notés : sort des disques remplacés, clause d'hébergeur LCEN.

## Envoi des emails (SMTP)

- [x] Fournisseur : **Gandi Mail**, seul expéditeur autorisé du domaine (SPF, DKIM `gm1`–`gm3`, MX, DMARC strict), observé le 2026-09-30. Confirmation formelle : valeur de `SMTP_HOST` dans le secret de production.
- [x] DPA v2023.0 et localisation (France, sans transfert) documentés ; durée des journaux SMTP et des files : non documentée, pas de demande prévue (décision du 2026-09-30).

## Copie hors site (Infomaniak Swiss Backup)

- [x] Fournisseur : **Infomaniak Swiss Backup** depuis le 2026-10-05 (#524) ; copie de test restaurée le 2026-10-05, copie nocturne du 2026-10-06 reçue (opérateur).
- [ ] Accord de traitement (DPA) ou conditions de traitement propres à Swiss Backup, et liste des sous-traitants d'Infomaniak. Tant que ce n'est pas fait, la politique publique le dit « en cours de vérification ».
- [ ] Localisation précise du centre de données et accès à distance éventuels (le fournisseur annonce un stockage en Suisse).
- [ ] Suppression côté container (versionnement ou corbeille) : confirmer qu'elle rejoint la rétention de 90 jours appliquée par rclone.
- [ ] Ancien fournisseur, **Dropbox** (jusqu'au 2026-10-05 ; offre individuelle, États-Unis, sans DPA) : anciennes copies supprimées (`rclone purge`), corbeille vidée, accès de rclone révoqué dans le compte, section `[dropbox]` retirée du secret `rclone-config` (#697). Voir « Anciens sous-traitants » dans [sous-traitants.md](sous-traitants.md).

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

- [ ] Relecture juridique de [ACCORD-SOUS-TRAITANCE.md](../../ACCORD-SOUS-TRAITANCE.md) (publié le 2026-10-06) et de [SOUS-TRAITANTS.md](../../SOUS-TRAITANTS.md), sur la base des clauses types de la Commission.
- [ ] Validation de la répartition des rôles ([inventaire.md](inventaire.md)).
- [ ] Validation de [procedure-violation.md](procedure-violation.md) : personnes, délais, canal de signalement.
- [x] Politique publique alignée sur l'état réel (#528, 2026-09-30), puis sur le remplacement de la copie hors site par Infomaniak Swiss Backup (#524, #697, 2026-10-06). À revoir après la relecture juridique.
