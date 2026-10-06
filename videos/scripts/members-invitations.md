# Inviter les bonnes personnes à un événement

Vidéo autonome 36. Voix unique, souriante et patiente. L'invitation propose une participation ; elle ne réserve aucune place.

## Parcours complet à filmer

1. Ouvrir l'onglet Invitations d'une fête publiée avec une liste de membres pertinente. Montrer les compteurs Invités, Inscrits et Sans créneau confirmé.
2. Envoyer un exemple à une adresse de démonstration depuis « Tester l'envoi d'email ». Ouvrir le vrai message dans Mailpit. Ne pas annoncer que cela crée une invitation réelle pour ce destinataire.
3. Ouvrir « Inviter des membres », rechercher une personne et sélectionner uniquement cette fiche. Saisir un court message ; envoyer l'invitation individuelle. Vérifier la réponse réelle et le message reçu.
4. Rouvrir la fenêtre, filtrer les tags, sélectionner plusieurs personnes et montrer le nombre sélectionné. « Tout sélectionner » ajoute les membres visibles à la sélection existante : utiliser Effacer avant de changer de groupe dans la démonstration.
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

## Limite locale découverte pendant la capture

Le rendu d'invitation ajoute `?token=` à `eventPublicUrl`, qui contient déjà `?org=` sur localhost. Le lecteur URL n'y trouve donc pas de paramètre token. Le recorder remplace uniquement ce second séparateur par `&`, sur les liens locaux, et conserve le jeton réel du message. Aucun code produit n'est corrigé ici. En production, l'adresse par sous-domaine ne contient pas le paramètre org ; son comportement n'a pas été vérifié par cette capture locale. Ne pas présenter cette adaptation comme une validation des liens en production.
