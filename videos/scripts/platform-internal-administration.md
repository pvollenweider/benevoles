# Administrer la plateforme, avec les bons garde-fous

## Reprise du 6 octobre 2026

La vidéo est reprise sur la copie locale compilée de la version actuelle
`23b2d604a597820a6bd9410e411761ebe71fbd5a`, port 43104, avec la base séparée
`benevoles_video_operator`. Ses neuf migrations additives manquantes ont été
appliquées uniquement à cette base marquée de formation.

Les douze chapitres de répétition fonctionnent sur cette version. Une nouvelle
narration Kore a été produite d'un seul tenant avec Gemini 3.8 Flash TTS et
les douze découpes ont une reconnaissance indépendante conforme au texte
courant. Le chapitre du message décrit désormais sa saisie pour laisser le
temps de la voir. Le message adressé aux administrateurs les vouvoie.

Le MP4 de relecture est généré : `videos/output/platform-internal-administration/platform-internal-administration.mp4`,
7 min 59 s (478,84 secondes), douze chapitres. Les titres de chapitre précèdent
la séquence vocale. La page Santé montre un vrai rechargement ; les tâches
locales inconnues ne sont pas transformées en succès. L'envoi de test, la
diffusion et son historique sont visibles au moment des explications.

La reconnaissance indépendante du son du MP4 final correspond aux douze
textes (écart maximal 2,3 %). Les réponses de transcription répétées ou
incohérentes ont été retentées, pas corrigées à la main. La prise continue
préserve la même voix Kore d'un chapitre à l'autre.

La vérification audiovisuelle finale reste **non validée** : elle signale quatre
points. Deux raccords restent à affiner : l'arrivée dans l'organisation est
annoncée environ trois secondes avant la fin de la connexion, et la conclusion
parle du contexte opérateur environ quatre secondes avant le retour à sa liste.
Les deux autres observations demandent une interprétation humaine : le détail
reste le même écran après changement de slug, mais le recorder vérifie sa vraie
nouvelle URL, recharge la page et montre le nouvel identifiant (image
[`identity-85.png`](../evidence/platform-internal-administration/identity-85.png)) ; la phrase initiale de Santé énumère les sections avant leur
parcours, elle ne demande pas de toutes les montrer simultanément.

Cette livraison est une version de relecture, pas une affirmation de validation
complète. Les rapports bruts restent conservés sans masquer leurs signalements.
Aucune publication publique n'est autorisée par cette production interne.

## Historique des préparations

Répétition complète du 6 octobre : les douze chapitres passent avec la ressaisie
réelle du message. Deux invitations reçues, refus de l'ancien lien, activation
et connexion, collision et redirection réelle de l'ancien identifiant,
désactivation/réactivation, contexte explicite, santé sans faux heartbeat,
test réellement reçu, diffusion acceptée pour les deux abonnés fictifs,
désabonnement réel et suppression du seul espace jetable. Le contrôle de
périmètre externe passe et refuse ensuite la répétition avant tout appel Gemini :
elle n'a pas de narration synchronisée. Le MP4 final reste à produire après la
nouvelle voix. Les 48 images de répétition sont disponibles pour contrôle visuel.

État le 5 octobre, après répétition : le changement de session a été corrigé dans
le recorder en arrêtant la page précédente avant de restaurer les cookies issus
de vraies connexions. Les confirmations non destructives sont des `dialog`, pas
des `alertdialog`. La répétition atteint les communications. Le formulaire est
réellement vide après retour de Mailpit : le script et le recorder expliquent et
montrent désormais la ressaisie du même message testé. La première narration
contrôlée ne correspond donc plus au chapitre « broadcast » actuel.

Lors de la tentative du 5 octobre, la régénération continue était refusée par
Gemini : **plafond mensuel de dépenses du projet atteint**, HTTP 429, avec renvoi
vers AI Studio /spend. Ce n'était
pas une simple temporisation de requêtes ; les crédits disponibles et ce plafond
sont deux réglages différents. Ce blocage est levé lors de la reprise du 6 octobre. Le recorder
refuse une prise narrée tant que chaque WAV ne correspond pas au script et à sa
reconnaissance indépendante. Aucune vidéo opérateur finale n'est encore validée.

Vidéo autonome 53, cursus interne exclusivement. Voix continue Kore, chaleureuse
mais posée. Montrer chaque action, son intérêt et son résultat réel. Ne pas mettre
cette vidéo dans le carrousel public des bénévoles sans décision explicite.

## Environnement nécessaire

Prévoir une base vidéo dédiée à l'opérateur, distincte de la base des autres
captures : cette console voit toutes les organisations et les communications
peuvent concerner tous les administrateurs abonnés. Trois organisations fictives,
dont une inactive, noms explicites de formation, comptes et emails réservés.
Créer le nouveau quatrième espace par l'interface, pas par un faux résultat.
SMTP local uniquement. Vérifier que la diffusion ne peut atteindre aucun compte
extérieur à cette fixture. Pas de suppression globale ni de désabonnement des
administrateurs des autres scénarios pour obtenir un compteur artificiel.

## Séquences

1. **Le rôle opérateur.** Se connecter avec le vrai compte super-admin de formation.
   Ouvrir le menu Super Admin et sa liste d'organisations : noms, état, compteurs,
   détail. Expliquer qu'il s'agit de gérer la plateforme, pas d'un rôle bénévole.
2. **Créer un espace.** Nouvelle organisation : nom, nom et email du premier
   administrateur, validation. Montrer « Organisation créée » et le lien
   d'activation, pas un mot de passe temporaire inventé. Le texte d'aide actuel
   évoque un mot de passe temporaire alors que le résultat montre un lien : ne pas
   le reprendre comme fonctionnement réel. Ouvrir le vrai email après son envoi.
3. **Activer le premier compte.** Ouvrir le lien reçu dans une session distincte,
   choisir un mot de passe fictif non affiché dans la narration, terminer
   l'activation et montrer la connexion au bon espace. Relever l'état réel du
   compte. Un lien de formation n'est pas un secret de production, mais les preuves
   textuelles ne doivent pas recopier sa valeur.
4. **Renvoyer une invitation.** Utiliser un autre compte encore en attente. Montrer
   le renvoi, le nouveau lien et le refus réel de l'ancien lien. Expliquer que le
   renvoi renouvelle l'accès, y compris quand la livraison d'email échoue ; ne pas
   présenter le renvoi comme une simple copie de l'ancien message.
5. **Modifier les informations.** Nom puis identifiant public avec sauvegardes
   réelles ; vérifier le nouvel affichage et le traitement de l'ancien identifiant
   selon la route actuelle. Ne pas promettre qu'un changement n'affecte jamais les
   liens. Conserver un exemple d'identifiant déjà utilisé et son refus réel.
6. **Désactiver et réactiver.** Lire la confirmation avant désactivation. Vérifier
   depuis une session organisateur déjà ouverte qu'une requête est refusée, puis
   montrer le retour après réactivation. Distinguer désactivation et suppression.
   Ne pas supprimer une organisation utile au reste de la formation. Si la
   suppression est illustrée, utiliser uniquement le quatrième espace jetable,
   lire ses conséquences et montrer la saisie de confirmation requise.
7. **Choisir une organisation de travail.** Utiliser la vraie action de sélection
   et vérifier le nom du contexte avant d'ouvrir les événements. Le super-admin
   peut agir dans une organisation sélectionnée : ne pas affirmer qu'il ne voit
   jamais ses données. Sans choix, montrer la demande de sélection ; pas de
   contexte implicite. Ne pas fabriquer de cookie pour contourner cette étape.
8. **Santé du service.** Ouvrir la vraie page : service, tâches et sauvegardes,
   configuration, version et date de contrôle. Expliquer les états effectivement
   visibles. Le serveur local n'a pas les tâches de production : conserver les
   états inconnus/avertissements, sans écrire de faux heartbeats pour tout verdir.
   Une sauvegarde signalée ne prouve pas à elle seule une restauration réussie.
9. **Communications admin.** Rédiger un message fictif, voir l'aperçu Markdown,
   envoyer un test au compte de formation et lire son vrai email. Puis confirmer
   une diffusion aux seuls comptes fictifs abonnés de la base dédiée. Montrer le
   compteur réellement livré et l'historique ; un compte désabonné ne doit rien
   recevoir. Illustrer le désabonnement dans son vrai parcours si documenté.
10. **Vérifier le périmètre.** Session propriétaire ordinaire : les routes de
    gestion de plateforme doivent refuser l'accès ; session super-admin sans
    organisation choisie : pas d'action implicite sur un tenant. Récapituler
    contrôle du contexte, précautions avant diffusion et effets des actions
    irréversibles. Aucune prétention d'audit de sécurité exhaustif.

## État

Préparation du 5 octobre : base distincte `benevoles_video_operator` créée et les 51
migrations appliquées ; marqueur de propriété de fixture vérifié. Trois organisations
(une inactive), quatre comptes fictifs, trois événements et neuf membres créés.
Le serveur compilé local sur 43104 impose le SMTP de formation 41026. Les vraies
connexions opérateur/propriétaire passent, ainsi que la sélection explicite du
contexte, les refus 409/403/401/404 attendus et la page de santé réelle. Aucun faux
heartbeat ; un seul administrateur actif abonné est présent. Preuves dans
`videos/output/platform-internal-administration/preparation.json`. Les actions de
création, activation, modification et diffusion restent à enregistrer et vérifier.
Le seed refuse une base déjà remplie : il ne supprime rien pour rejouer une prise.

Précontrôle complémentaire du 5 octobre : création réelle d'un quatrième espace
jetable par l'API, deux invitations acceptées par le SMTP local, ancien lien refusé,
nouveau lien activé puis consommé, connexion réelle du nouveau propriétaire.
Collision d'identifiant refusée (409), ancien identifiant inscrit dans l'historique,
suppression d'un espace actif refusée (409). La session organisateur déjà ouverte
reçoit **401** pendant la désactivation, puis 200 après réactivation. Confirmation
de suppression incorrecte refusée (400) ; seul l'espace jetable a été supprimé,
les trois organisations initiales restent présentes. Preuve dans
`lifecycle-preparation.json`. Ce précontrôle API n'est pas une capture du parcours
visuel et ne prouve pas encore la redirection publique.

Le manifeste comporte désormais douze chapitres, dont la suppression d'un espace
jetable. Narration Kore produite en une seule prise par `gemini-3.8-flash-tts`,
onze séparations repérées dans le son réel. Reconnaissance indépendante des douze
chapitres réussie (0 à 4,9 % de différence de mots), sans anomalie de début/fin.
La synchronisation audiovisuelle reste à vérifier après la capture. L'entrée du
catalogue demeure non publiée et `captureReady: false`.

Scénario préparé. Le graphe Understand a servi à repérer les relations des pages,
routes et gardes ; les comportements critiques ont été recoupés dans les sources
actuelles avec CodeGraph (`auth-guard`, `use-org`, `NewOrgForm`, `OrgDetail`, page
de santé et communications). Le graphe daté du 30 septembre n'est pas une preuve
de comportement actuel. Les autres détails et les routes de création,
modification, activation et communications doivent être relus avant enregistrement.
La base, le seed, les précontrôles et la narration sont désormais produits comme
indiqué plus haut. Le recorder des douze chapitres est intégré et en répétition
fonctionnelle ; `captureReady: true` indique uniquement son existence, pas une
validation de la vidéo. La prise narrée, le MP4 et leurs contrôles restent à faire.
L'écoute automatisée du début et du chapitre « broadcast » observe un timbre
identique et chaleureux ; ce contrôle ne vaut pas une écoute humaine exhaustive.
