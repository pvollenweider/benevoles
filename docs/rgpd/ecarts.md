# Écarts entre la politique de confidentialité publiée et l'inventaire

À corriger dans `src/app/legal/privacy/page.tsx` **seulement après** vérification des faits de production ([verifications-production.md](verifications-production.md)) et relecture par une personne qualifiée.

| # | Écart | Constat (dépôt) | Action |
|---|---|---|---|
| 1 | Fournisseur de la copie hors site absent de la liste des sous-traitants | les sauvegardes chiffrées y sont copiées chaque nuit (`k8s/cronjob-backup-offsite.yaml`) : Dropbox jusqu'au 2026-10-05, Infomaniak Swiss Backup depuis | fait : Dropbox nommé (#528), puis Infomaniak (#524) ; Dropbox n'est plus cité que comme ancien destinataire dont les copies sont en cours de suppression (#697) ; accord de traitement d'Infomaniak à confirmer |
| 2 | « Chaque sous-traitant est lié par un accord de traitement » | aucun DPA vérifié | vérifier fournisseur par fournisseur, ou reformuler |
| 3 | Localisation des fournisseurs affirmée | aucune région vérifiée (hébergeur, SMTP, Sentry, copie hors site) | vérifier, dater, sinon ne pas l'affirmer |
| 4 | Fournisseur SMTP cité (Gandi) | le dépôt ne fixe pas le fournisseur | vérifier la configuration de production |
| 5 | Notifications du navigateur non décrites | abonnement stocké (endpoint, clés), message chiffré transmis au service push du navigateur | décrire : facultatif, contenu, désabonnement, conservation |
| 6 | Réponses aux questions de l'événement absentes | `QuestionAnswer`, champs libres possibles | les ajouter aux catégories de données |
| 7 | Journaux d'activité cités seulement comme export, pas parmi les données traitées | ils conservent les identifiants d'acteur et d'entité (données pseudonymisées) | les ajouter aux catégories, avec leur durée |
| 9 | Rôles pour les données des administrateurs | répartition non tranchée ([inventaire.md](inventaire.md)) | clarifier après validation juridique |
| 10 | Durées chez les fournisseurs absentes | Sentry, SMTP, corbeille Swiss Backup, services push : non documentées | les ajouter une fois vérifiées |
| 11 | Journaux de connexion, 90 jours | rotation décrite mais pas installée par le dépôt (`k8s/log-rotation.md`) | vérifier sur le serveur avant de l'annoncer |
| 12 | Procédure de violation | projet interne seulement ([procedure-violation.md](procedure-violation.md)) | valider, puis mentionner l'engagement d'information |
