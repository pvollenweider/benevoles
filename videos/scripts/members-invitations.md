# Inviter les bonnes personnes à un événement

Vidéo autonome 36. Voix unique, souriante et patiente. L'invitation propose une participation ; elle ne réserve aucune place.

## Parcours complet à filmer

1. Depuis l’onglet Inscriptions d’une fête publiée, ouvrir Invitations avec une liste de membres pertinente. Montrer les compteurs Invités, Inscrits et Sans créneau confirmé.
2. Envoyer un exemple à une adresse de démonstration depuis « Tester l'envoi d'email ». Ouvrir le vrai message dans Mailpit. Ne pas annoncer que cela crée une invitation réelle pour ce destinataire.
3. Ouvrir « Inviter des membres », rechercher une personne et sélectionner uniquement cette fiche. Saisir un court message ; envoyer l'invitation individuelle. Vérifier la réponse réelle et le message reçu.
4. Rouvrir la fenêtre, filtrer les étiquettes, sélectionner plusieurs personnes et montrer le nombre sélectionné. « Tout sélectionner » ajoute les membres visibles à la sélection existante : utiliser Effacer avant de changer de groupe dans la démonstration.
5. Envoyer le lot avec un message court. Vérifier les résultats et les emails réels, puis ouvrir l'un d'eux. Les adresses des autres personnes ne sont pas affichées dans le message individuel.
6. Ouvrir le lien personnel d'invitation dans une session bénévole séparée. Montrer les coordonnées préremplies et le choix de créneaux ; compléter une inscription réelle et vérifier la confirmation.
7. Montrer un poste réservé à un tag et la différence entre accès public et invitation valide de la personne autorisée. Garder ce parcours distinct des postes soumis à validation de l'organisateur. Ne pas faire passer une invitation pour une inscription déjà acceptée.
8. Revenir au tableau Invitations et montrer une personne avec Participation confirmée et une autre Sans créneau confirmé. Ce dernier statut ne prouve pas que l'email n'a pas été lu ; il peut notamment correspondre à une liste d'attente ou une demande non encore acceptée.
9. Montrer « Cacher déjà invités ». Le décocher permet de retrouver les personnes déjà invitées. Renvoyer une invitation ne crée pas une seconde invitation pour la même personne et la même fête : le lien existant est réutilisé.
10. Montrer une fiche sans email dans le sélecteur et expliquer la limite : elle peut apparaître dans les invitations, mais aucun email ne peut lui être envoyé. Prévoir un contact direct et ne pas présenter le compteur Invités comme un compteur de messages reçus.

## Garde-fous de narration

- Réception dans Mailpit : preuve de remise au serveur de test, pas preuve de lecture par une personne.
- Le tableau expose la date d'invitation et la participation confirmée, pas un suivi d'ouverture des emails.
- La sélection peut contenir des personnes qui ne sont plus visibles après un changement de filtre : montrer le compteur et Effacer.
- Message facultatif : 500 caractères maximum ; sélection : au plus 500 identifiants par requête.
- Le filtre cache déjà les invitations existantes par défaut. Les invitations sont propres à l'événement.
- Une invitation peut permettre un accès à un poste réservé si les tags actuels de la personne le permettent. Ce droit est revérifié lors de l'inscription.

## Jeu de données requis

Au moins 40 fiches fictives, tags accueil/permis-b/caisse/sécurité, une fiche sans email. Invitations anciennes avec participation confirmée, attente, demande et absence de créneau. Deux personnes encore non invitées pour l'envoi réel. Poste réservé avec place libre et créneau public compatible.

## État

Prévisualisation MP4 générée : dix scènes, une narration continue Puck contrôlée indépendamment, durées vérifiées et planche de trente images examinée. `invitation-checks.json` consigne les réponses réelles des envois. L'inscription d'Aline et l'accès de Nicolas au poste réservé sont capturés. Visionnage audiovisuel intégral restant ; le parcours « déjà invités » montre le filtre, sans effectuer un second envoi réel.

## Liens et chargement

Le lien est lu dans le vrai email généré avec le domaine public de formation puis rejoué localement sans corriger ses paramètres. L’ancien remplacement du séparateur localhost est supprimé. La page publique attend son DOM puis ses contrôles réels ; une attente networkidle ne convient pas à ses requêtes de fond.

## Révision du 2026-10-16 — lot 22-5

Relecture du produit main `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased] et PR fusionnées #990 à #1012, #1021 (onglets lot 2), #1022 (#1013). Étiquettes, Modifier, Heures prévues, navigation Inscriptions / Invitations et Documents à imprimer vérifiées dans les scénarios.

WAITING TTS — plafond mensuel connu ; aucun nouvel appel. Régénérer la narration ENTIÈRE, même voix, une seule passe, `continuousPauseTags: false`. Phrases changées :

- Pour un groupe, utilisez le filtre d’étiquettes.

## Révision du 2026-10-16 — lot 24-3

La phrase qui provoquait une rupture de timbre et les chapitres suivants sont reformulés en phrases courtes, sans changement de sens. Le premier essai est rejeté avant capture ; le deuxième passe le contrôle neutre intégral audio seul, avec Puck en une seule génération et sans balises de pause.

Repère de la scène send : « Vous voyez ici la réception ». Identifiants de scènes et durées de secours conservés. Narration entière à régénérer en une passe, voix Puck, sans balises de pause, puis contrôle neutre intégral audio seul avant toute capture.

Texte retenu pour les chapitres reformulés :

send : Nous sélectionnons maintenant deux personnes et ajoutons un message commun. Envoyer deux invitations déclenche des messages individuels. Dans la boîte de démonstration, chaque personne reçoit son propre email et son propre lien. Les coordonnées des autres invités ne sont pas affichées dans son message. Vous voyez ici la réception sur notre serveur de test. La lecture du message par le bénévole reste inconnue.

personal-link : Ouvrons le lien reçu par Aline. Il mène à la fête avec ses coordonnées préremplies. Elle peut regarder les horaires et choisir un créneau disponible. Elle complète ensuite les informations demandées. Nous faisons une vraie inscription de démonstration, jusqu'à la confirmation. Le lien est personnel. Vous devez le garder privé. Pour présenter la fête à tout le monde, vous utilisez son adresse publique.

reserved : Une invitation peut aussi donner accès à un poste réservé à certains membres. Ici, Nicolas a le tag sécurité. Avec son invitation valide, il peut choisir le poste réservé correspondant. Les tags actuels sont revérifiés à l'inscription. Cet accès concerne seulement les postes autorisés par ses tags. Une demande à valider suit une autre règle. Vous devez alors accepter la demande avant de confirmer la place.

status : De retour dans Invitations, Aline a maintenant une participation confirmée. D'autres personnes restent sans créneau confirmé. La lecture de leur email reste inconnue. Il peut aussi concerner une personne en liste d'attente. Une demande encore à valider peut donner le même statut. Vous utilisez ce tableau pour suivre la participation. Il ne permet pas de suivre la lecture des messages.

existing : La case Cacher déjà invités vous aide à éviter un nouvel envoi aux mêmes personnes. Décochez-la si vous voulez les retrouver. Un nouvel envoi à une personne déjà invitée réutilise son invitation pour cette fête. Il ne crée pas une seconde invitation. Vous vérifiez le groupe avant chaque envoi. Plusieurs messages identiques peuvent vite devenir agaçants.

no-email : Enfin, vous pouvez sélectionner une fiche sans email. Sans adresse, aucun message ne peut être envoyé. René devra être contacté autrement. Le nombre d'invités ne correspond donc pas forcément au nombre d'emails envoyés. Le nombre de messages lus reste inconnu. Une invitation claire, le bon groupe et quelques vérifications : c'est tout ce qu'il faut pour lancer la participation sereinement.

Validation du lot 24-3 : deuxième génération complète Puck retenue après contrôle neutre intégral audio seul. Frontières recalées sur les silences et ASR indépendante des dix chapitres réussie. Répétition puis une prise narrée, montage de 234,280 s, affiches et revue des dix chapitres réussis. Bande-son finale complète sans rupture signalée ; validation réussie. STATUS: READY. doc-img: unchanged
