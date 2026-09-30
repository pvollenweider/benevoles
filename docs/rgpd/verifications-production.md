# Vérifications de production et des contrats (checklist)

Ce que le dépôt ne permet pas d'établir. Pour chaque point : la preuve à conserver (capture, contrat, page officielle datée) et la date de vérification, reportées ensuite dans [sous-traitants.md](sous-traitants.md) et [inventaire.md](inventaire.md).

## Hébergeur du serveur

- [ ] Fournisseur et entité contractante réels (la politique publiée cite Kimsufi / OVH).
- [ ] Centre de données (pays, ville) et accès possibles du support depuis d'autres pays.
- [ ] Conditions et DPA applicables à l'offre souscrite ; lien vers le document officiel.

## Envoi des emails (SMTP)

- [ ] Fournisseur réellement configuré dans le secret `SMTP_HOST` de production (ne pas reprendre « Gandi » sans le vérifier).
- [ ] DPA, localisation, durée de conservation des journaux et des files d'envoi du fournisseur.

## Dropbox (copie hors site)

- [ ] Offre et entité contractante du compte utilisé par rclone.
- [ ] Région de stockage effective du compte, accès possibles hors de Suisse et de l'UE.
- [ ] DPA et mécanisme de transfert applicable.
- [ ] Conservation des fichiers supprimés et des versions (la suppression par rclone au-delà de la durée de la matrice ne dit rien de la corbeille côté Dropbox).
- [ ] Qui a accès au compte ; jeton OAuth rclone stocké seulement dans le secret Kubernetes.

## Sentry

- [ ] Entité contractante, région du projet de production (la politique publiée dit UE, Allemagne).
- [ ] DPA accepté dans l'organisation Sentry ; liste des sous-traitants de Sentry.
- [ ] Durées de conservation des erreurs, traces et enregistrements selon l'offre.
- [ ] Taux effectifs : ceux du code (10 % des traces, 10 % des sessions enregistrées, 100 % des sessions en erreur) ne sont pas surchargés par des règles du projet.
- [ ] Filtres côté serveur Sentry (données sensibles, IP) : réglages du projet.

## Services push des navigateurs

- [ ] Conditions applicables des principaux services (Google, Mozilla, Apple, Microsoft), liens officiels.
- [ ] Qualification juridique du rôle de ces services (sous-traitant ou non), par une personne qualifiée.

## Journaux du proxy

Décision : un jeton personnel n'est jamais écrit dans un journal d'accès (`k8s/ingressroute-tokens.yaml`, `Referrer-Policy: strict-origin`).

- [ ] Après déploiement, requêtes avec des jetons **factices** sur chaque famille (`/my/`, `/waitlist/…/confirm`, `/leader/`, `/api/public/registrations/`, `/api/public/member-invite/`, `/api/public/leader/`, `/api/public/waitlist/`, `?token=` et `?t=` sur une page d'événement), en HTTPS et en HTTP : aucune trace dans `kubectl -n kube-system logs deploy/traefik`. Une page ordinaire reste journalisée (méthode, statut, durée). Les autres sites du Traefik sont inchangés.
- [ ] Réponses des pages : en-tête `Referrer-Policy: strict-origin` présent.
- [ ] Journaux antérieurs : la sortie actuelle du conteneur remonte au 2026-09-30 07:29 UTC (7 lignes avec un jeton dans le chemin, 15 dans la requête, décomptées sans les afficher). Les fichiers plus anciens, tournés par kubelet depuis le démarrage du pod (2026-09-01), sont sur le nœud (`/var/log/pods/kube-system_traefik-*/`). Purge à faire sur le nœud une fois le réglage vérifié ; aucune copie ailleurs (pas de Loki, les sauvegardes ne contiennent que la base). Ne jamais recopier une ligne réelle dans un ticket ou un diagnostic.
- [ ] Tant que la purge n'est pas faite, ces anciens fichiers disparaissent avec la rotation de kubelet (taille et nombre de fichiers à confirmer sur le nœud).

## Serveur

- [ ] Rotation des journaux réellement installée sur le nœud (`k8s/log-rotation.md`) et durée effective des journaux du proxy et des conteneurs. Tant que ce n'est pas prouvé, ne pas annoncer la durée de la matrice comme garantie.
- [ ] Phrase de passe des sauvegardes : qui la détient, où elle est conservée hors du serveur.
- [ ] Dernier test de restauration réussi (page Santé du service) et procédure qui rejoue les effacements après une restauration.
- [ ] Personnes ayant accès à la production (SSH, kubectl, base, comptes des fournisseurs), pour l'annexe II.

## Documents

- [ ] Relecture juridique de [projet-accord-traitement.md](projet-accord-traitement.md) sur la base des clauses types de la Commission.
- [ ] Validation de la répartition des rôles ([inventaire.md](inventaire.md)).
- [ ] Validation de [procedure-violation.md](procedure-violation.md) : personnes, délais, canal de signalement.
- [ ] Mise à jour de la politique publique ([ecarts.md](ecarts.md)) seulement après tout ce qui précède.
