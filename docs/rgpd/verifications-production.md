# Vérifications de production et des contrats (checklist)

Ce que le dépôt ne permet pas d'établir. Pour chaque point : la preuve à conserver (capture, contrat, page officielle datée) et la date de vérification, reportées ensuite dans [sous-traitants.md](sous-traitants.md) et [inventaire.md](inventaire.md).

## Hébergeur du serveur

- [x] Fournisseur et entité : OVH SAS, Roubaix, éditeur de Kimsufi (adresse du serveur, whois ; mentions légales Kimsufi). Vérifié le 2026-09-30. Reste : entité du contrat dans l'espace client.
- [ ] Centre de données : l'adresse du serveur est allouée à Roubaix (France) ; datacenter exact (RBX) à confirmer dans l'espace client. Accès à distance possible de filiales hors UE sous clauses types (DPA § 6.2) : noté dans [sous-traitants.md](sous-traitants.md).
- [ ] DPA : documents officiels trouvés (annexe traitement de données FR 7.0, conditions Serveurs dédiés) ; acceptation dans l'espace client à confirmer.

## Envoi des emails (SMTP)

- [x] Fournisseur : **Gandi Mail**, seul expéditeur autorisé du domaine (SPF, DKIM `gm1`–`gm3`, MX, DMARC strict), observé le 2026-09-30. Confirmation formelle : valeur de `SMTP_HOST` dans le secret de production.
- [ ] DPA v2023.0 et localisation (France, sans transfert) documentés ; **durée des journaux SMTP et des files à demander** à Gandi (support ou dpo@gandi.net).

## Dropbox (copie hors site)

- [x] **Offre du compte utilisé par rclone** : individuelle (confirmée le 2026-09-30), donc sans DPA ; conservée pour l'instant, migration prévue vers Infomaniak Swiss Backup (#524). Voir « Points d'attention » dans [sous-traitants.md](sous-traitants.md).
- [ ] Région de stockage effective du compte, accès possibles hors de Suisse et de l'UE.
- [ ] DPA et mécanisme de transfert applicable.
- [ ] Conservation des fichiers supprimés et des versions (la suppression par rclone au-delà de la durée de la matrice ne dit rien de la corbeille côté Dropbox).
- [ ] Qui a accès au compte ; jeton OAuth rclone stocké seulement dans le secret Kubernetes.

## Sentry

- [x] Région : **UE (Francfort)**, observée le 2026-09-30 (le site envoie ses événements à `ingest.de.sentry.io`). Entité : Functional Software, Inc. ; comptes et réglages toujours aux États-Unis.
- [ ] DPA accepté dans l'organisation (le DPA et la liste des sous-traitants sont publics) ; **fonctions d'IA** de Sentry (sous-traitants Anthropic, OpenAI) actives ou non.
- [ ] Offre souscrite, qui fixe la conservation (30 jours en Developer, 90 jours pour erreurs et enregistrements à partir de Team).
- [ ] Taux effectifs : ceux du code (10 % des traces, 10 % des sessions enregistrées, 100 % des sessions en erreur) ne sont pas surchargés par des règles du projet.
- [ ] Filtres côté serveur Sentry (données sensibles, IP) : réglages du projet.

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

- [ ] Relecture juridique de [projet-accord-traitement.md](projet-accord-traitement.md) sur la base des clauses types de la Commission.
- [ ] Validation de la répartition des rôles ([inventaire.md](inventaire.md)).
- [ ] Validation de [procedure-violation.md](procedure-violation.md) : personnes, délais, canal de signalement.
- [ ] Mise à jour de la politique publique ([ecarts.md](ecarts.md)) seulement après tout ce qui précède.
