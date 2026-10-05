# Gérer un imprévu sans perdre le fil

Vidéo autonome 47 : `LAST_MINUTE_CHANGES`, voix continue Kore, souriante et calme. Elle fait le lien entre besoins, personnes, messages et résultat, sans référence aux autres vidéos.

## Parcours réel exigé

1. Jeu dédié avec Accueil rempli, Aline confirmée et Nicolas en attente. Filmer le vrai retrait via le lien personnel d'Aline ; revenir aux inscriptions, vérifier l'offre générée et ouvrir l'email local.
2. Ouvrir le vrai lien de l'offre de Nicolas, accepter puis vérifier l'inscription active et la couverture. Ne pas compter `offered` comme confirmation, ni simuler un email d'offre.
3. Couverture : montrer un second poste Logistique sous-effectif, une personne confirmée et une place manquante. Expliquer séparément qu'une demande occupe une place sans être une présence attestée.
4. Membres : Zoé a de vraies disponibilités et une remarque, un autre créneau non chevauchant. Montrer la fiche/activité, lire les horaires ; aucune affectation ou recommandation automatique inventée. Accord de Zoé explicitement posé comme hypothèse de démonstration, jamais présenté comme une preuve donnée par la disponibilité.
5. Message ciblé à la personne déjà inscrite sur Logistique : besoin précis, horaire et réponse. Prévisualiser, envoyer et ouvrir le vrai email. Puis ajouter Zoé manuellement après accord et vérifier la diminution du manque. Ne pas prétendre envoyer directement à un membre sans inscription via un public que la page ne propose pas.
6. Créneau distinct Préparation : décaler date/début/fin par le vrai éditeur, enregistrer, lire l'email à la confirmation et revenir au planning modifié. Le formulaire n'expose pas de case pour désactiver cet email : ne pas l'inventer.
7. Créneau distinct Caisse, confirmation avec pointage et demande : annuler via la confirmation réelle ; vérifier deux inscriptions annulées, emails réellement reçus et champ de présence conservé. Distinction fermeture/retrait/annulation.
8. Journal et Récit : chaîne réellement enregistrée par les routes, pas lien fabriqué ni causalité déduite d'un voisinage temporel. Retrouver changements et annulation.
9. Retour à couverture et inscriptions, avec comparaison quantitative avant/après et créneau annulé exclu du besoin.

## Préparation et preuves

Organisation dédiée pour ne pas réinitialiser un autre parcours en cours. Identités uniquement fictives `example.org`. Chaque action change réellement la base locale ; emails lus dans Mailpit. Collecter réponses, états avant/après, conséquences liées, destinataires inclus/exclus et horaires. Recréer les fixtures avant toute nouvelle prise, puisque le retrait et l'acceptation ne sont pas rejouables sur les mêmes états.

Les sources de comportement consultées incluent la route de modification/annulation du créneau et `staffingSummary`. La route de modification prévient les confirmations actives lors d'un changement d'horaire ; l'annulation de créneau passe par `cancelShift`. Vérifier les vrais contenus reçus avant d'en faire une démonstration réussie. Aucun natif push, appel téléphonique, réponse humaine ou temps travaillé ne peut être inventé.

## État

Contrôle SMTP local terminé : six notifications nouvelles reçues et rapprochées de la file d'envoi (`mail-checks.json`). L'offre, la confirmation, le message ciblé, le changement avec les deux horaires avant/après et les deux annulations sont présents ; la demande en attente ne reçoit pas le changement d'horaire. Ces preuves ne constituent ni une lecture par un bénévole ni une validation audiovisuelle. Les 43 fichiers d'outillage vidéo passent la vérification TypeScript. Aucun MP4 de ce parcours n'est encore produit.

Script et manifeste écrits. Une prise continue Kore est générée, ses neuf frontières recalées et les dix chapitres passent la transcription indépendante. Le seed dédié contient six membres fictifs, cinq créneaux, huit inscriptions dans différents états, disponibilité de Zoé et présence préalable à la caisse. Les précontrôles par les vraies routes passent : retrait et offre, acceptation, message ciblé à un destinataire, ajout manuel remplissant le poste, changement d'horaire notifiant une confirmation, annulation des deux inscriptions et pointage conservé, chaîne causale du journal. Preuve : `functional-checks.json`. La remise à zéro traite désormais les profils et l'administrateur fictifs conservés sans organisation, après vérification de leur périmètre. Le jeu a été modifié par le contrôle : le réinitialiser avant capture. Lecture des emails, recorder, MP4 et revue audiovisuelle restent à faire. Capture désactivée, rien de publié.
