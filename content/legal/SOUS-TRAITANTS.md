# Liste des sous-traitants

Version du 6 octobre 2026.

Pour faire fonctionner benevol.app, nous faisons appel aux prestataires ci-dessous. Ils traitent les données que votre organisation nous confie (bénévoles, membres, inscriptions, messages) uniquement pour les besoins du service et sur nos instructions, jamais pour leur propre compte.

Cette liste fait partie de l'[accord de sous-traitance](ACCORD-SOUS-TRAITANCE.md) qui encadre ces traitements. Elle complète la [politique de confidentialité](/legal/privacy).

## Hébergement : OVH SAS

- **Service** : serveur dédié (gamme Kimsufi) qui héberge l'application, la base de données et les sauvegardes locales chiffrées.
- **Données concernées** : toutes les données du service.
- **Localisation** : France, centre de données de Roubaix. OVH ne modifie pas cette localisation sans notre accord.
- **Garanties** : annexe de traitement des données d'OVH (version du 3 octobre 2025), acceptée avec les conditions particulières des serveurs dédiés. OVH ne sauvegarde pas le contenu du serveur. Ses équipes et ses filiales situées hors de l'Union européenne peuvent y accéder à distance pour la sécurité et la maintenance ; cet accès est encadré par les clauses contractuelles types de la Commission européenne.
- **Plus d'informations** : [protection des données chez OVHcloud](https://www.ovhcloud.com/fr/personal-data-protection/faq/).

## Envoi des emails : Gandi SAS

- **Service** : envoi des emails du service (invitations, confirmations, rappels, messages, réinitialisation de mot de passe).
- **Données concernées** : adresse du destinataire, contenu de l'email, y compris les liens personnels d'inscription, et l'adresse de réponse de votre organisation.
- **Localisation** : France. Selon l'accord de traitement de Gandi, les données de messagerie sont stockées exclusivement en France, sans autre transfert.
- **Garanties** : accord de traitement des données de Gandi.
- **Plus d'informations** : [politique de confidentialité de Gandi](https://www.gandi.net/en/contracts/privacy-policy).

## Copie de sauvegarde hors site : Infomaniak Network SA

- **Service** : offre Swiss Backup, qui reçoit chaque nuit une copie des sauvegardes de la base de données.
- **Données concernées** : sauvegardes de la base de données, chiffrées sur notre serveur avant l'envoi. Infomaniak n'a pas la clé de déchiffrement et ne peut pas lire leur contenu.
- **Localisation** : Suisse, selon l'offre du fournisseur. La Suisse bénéficie d'une décision d'adéquation de la Commission européenne.
- **Garanties** : chiffrement avant l'envoi, clé conservée hors d'Infomaniak. L'accord de traitement d'Infomaniak propre à l'offre Swiss Backup est en cours de vérification.
- **Conservation** : nous supprimons chaque copie 90 jours après sa création.

## Suivi des erreurs techniques : Sentry (Functional Software, Inc.)

- **Service** : détection et analyse des erreurs techniques du service.
- **Données concernées** : rapports d'erreur allégés avant l'envoi (sans cookie, en-tête de requête, contenu de formulaire ni jeton d'accès) et, pour une partie des sessions, un enregistrement de la navigation dont les textes et les médias sont masqués. Un rapport peut malgré tout contenir un identifiant interne ou un message d'erreur.
- **Localisation** : Union européenne (Francfort, Allemagne) pour les rapports. Les comptes et les réglages de Sentry restent aux États-Unis.
- **Garanties** : accord de traitement des données de Sentry ; transferts vers les États-Unis encadrés par le Data Privacy Framework, avec les clauses contractuelles types en secours.
- **Conservation** : 30 jours chez Sentry.
- **Plus d'informations** : [accord de traitement de Sentry](https://sentry.io/legal/dpa/).

## Notifications du navigateur : Google, Mozilla, Apple ou Microsoft

- **Service** : acheminement des notifications qu'un bénévole active lui-même dans son navigateur (rappels, messages urgents). Le prestataire dépend du navigateur : Google pour Chrome, Mozilla pour Firefox, Apple pour Safari, Microsoft pour Edge.
- **Données concernées** : le message, chiffré de bout en bout (le fournisseur ne peut pas le lire), l'adresse technique de l'abonnement et des informations d'envoi (heure, taille, durée de vie du message).
- **Localisation** : variable selon le fournisseur du navigateur.
- **Garanties** : chiffrement du contenu selon la norme du web (RFC 8291). Un message non remis est abandonné après 3 jours au plus.

## Ce que cette liste ne couvre pas

Ces services ne reçoivent aucune donnée de vos bénévoles ni de vos membres, et ne sont donc pas des sous-traitants :

- **Gandi**, pour le nom de domaine et sa zone DNS ;
- **Let's Encrypt**, pour les certificats de sécurité (HTTPS), qui ne voit que les noms de domaine publics ;
- **GitHub**, interrogé une fois par jour, sans aucune donnée personnelle, pour savoir si une nouvelle version du logiciel est publiée ;
- **OpenStreetMap**, quand une personne clique sur le lien « voir sur la carte » : c'est son navigateur qui ouvre la carte, le service ne transmet rien.

Les vidéos tutorielles sont servies par notre propre serveur et ne contiennent que des données fictives.

## Changements

Tout ajout ou remplacement d'un sous-traitant vous est annoncé à l'avance, selon les modalités de l'[accord de sous-traitance](ACCORD-SOUS-TRAITANCE.md#7-sous-traitants-ulterieurs), et vous pouvez vous y opposer. La date de version en haut de cette page change à chaque mise à jour.

Une question : [contact@benevol.app](mailto:contact@benevol.app).
