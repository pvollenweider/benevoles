# Utiliser Benevol au clavier et adapter l'affichage

État du lot 30 (22 octobre 2026) : sources et narration continue actualisées ; précontrôles du produit courant réussis. Le film reste **NOT READY**, car macOS refuse la capture native (TCC). Les constats datés ci-dessous sont historiques ; aucune ancienne prise VoiceOver ne vaut preuve pour le build courant.

Vidéo autonome 52. Voix masculine Puck, une prise continue souriante et patiente.
Expliquer pourquoi chaque geste aide, le faire réellement, puis montrer son résultat.
Ne jamais présenter une émulation Chromium comme Windows, un iPhone réel ou un lecteur d'écran.

## Parcours à enregistrer

1. **Se repérer sans souris.** Dans une session organisateur de formation, presser Tab depuis le début de page. Montrer le lien d'évitement, l'activer avec Entrée et vérifier le focus sur le contenu. Afficher discrètement les touches réellement pressées, pas un curseur animé inventé. Revenir aux premiers contrôles et montrer Tab et Maj+Tab, avec le repère visible.
2. **Choisir un créneau public.** Événement court, trois postes, horaires lisibles et créneaux non vides. Atteindre un créneau au clavier, lire son nom complet à l'écran, sélectionner puis atteindre Continuer. Montrer le récapitulatif et un champ requis manquant, puis le corriger. Aucun envoi à une personne réelle.
3. **Le sélecteur de l'administration.** Ajouter manuellement : atteindre Créneau, ouvrir avec une flèche, déplacer l'option active, chercher par lettre, choisir avec Entrée, rouvrir puis Échap sans changer la valeur. Inclure une personne déjà inscrite et un vrai chevauchement : les mentions « déjà inscrit » et « conflit » doivent être présentes et lisibles. Montrer aussi le filtre de créneau.
4. **Corriger une erreur.** Envoyer le formulaire sans créneau : focus sur le champ concerné, message lié visible. Choisir un créneau, compléter puis ajouter réellement une personne fictive. Montrer le résultat, le focus restauré et le compteur à jour. Ne pas jouer une fausse annonce de lecteur d'écran avec la voix de narration.
5. **Construire un planning au clavier.** Basculer Frise/Liste avec Entrée, montrer le choix actif. Ouvrir l'éditeur, ajouter et annuler un créneau, retrouver le focus. Dans Gérer les postes, utiliser Monter/Descendre, montrer l'ordre avant/après et l'enregistrement. Vérifier le nouvel ordre après rechargement. Pas seulement une liste de touches.
6. **Zoomer pour mieux lire.** Montrer un vrai zoom du navigateur à 200 % puis 400 %, distinct d'un agrandissement du montage. Vérifier visuellement le contenu et la possibilité de naviguer ; montrer le défilement horizontal nécessaire de la chronologie, sans prétendre qu'il n'existe jamais. Revenir à 100 %. Si le navigateur d'enregistrement ne permet pas ce zoom réel, ne pas remplacer par une transformation CSS : utiliser une capture native adaptée.
7. **Petit écran.** Vue mobile de formation avec largeur indiquée. Ouvrir la liste de créneaux et montrer le retour à la ligne, les deux avertissements et les commandes. Distinguer explicitement cette vue simulée d'un essai sur un téléphone physique. Prévoir une démonstration tactile réelle seulement si elle est disponible.
8. **Contraste élevé.** Comparer affichage normal et émulation des couleurs forcées, claire puis sombre. Montrer le focus, l'option active, la sélection et un interrupteur on/off. L'encart doit dire « Émulation Chromium — pas un test Windows ». Ne pas prétendre avoir validé Night sky/Desert dans Edge.
9. **Lecteur d'écran.** Présenter l'utilité des noms, états et messages. Pour faire entendre VoiceOver/NVDA, enregistrer réellement cet outil avec son audio et préciser système/navigateur. Une inspection de noms accessibles ne remplace pas l'écoute. À défaut de capture réelle, conserver cette séquence explicitement comme restant à produire, sans simuler sa voix ni annoncer une validation complète.
10. **Trouver les limites et demander de l'aide.** Ouvrir la vraie page Accessibilité depuis le pied de page. Montrer périmètre, auto-évaluation partielle, tests et limites présentes au tournage. Les vérifications VoiceOver limitées consignées dans la documentation technique ne prouvent pas tous les parcours. Montrer le lien de contact et expliquer quoi décrire : page, geste, résultat attendu, navigateur et outil utilisé. Ne pas envoyer de message réel pendant la vidéo.

## Données et preuves

Organisation de formation dédiée ; quatre postes dont un nom long, cinq membres fictifs,
une inscription confirmée, deux créneaux qui se chevauchent réellement, une demande et
un créneau libre. Dates futures, emails réservés, contacts fictifs. Aucun mélange avec
la fixture confidentialité en cours de capture.

Pour chaque scène : conserver les touches et l'élément effectivement focalisé, les
changements de valeur, les réponses réelles et une capture avant/après. Les contrôles
du focus ne doivent pas déplacer le focus eux-mêmes pour fabriquer le résultat.
L'overlay des touches reflète les événements effectivement envoyés au navigateur.
La présence technique d'un contour ne prouve pas seule sa lisibilité : inspecter les images.

## État

Contrôle de disponibilité du 5 octobre : l'outil de capture native indique un Mac
verrouillé et ne liste aucune application native disponible. Aucune activation de
VoiceOver ni capture de zoom natif n'a donc été faite. Continuer les autres travaux
vidéo ; recontrôler la disponibilité de la session avant ces séquences. Ce constat
ne vaut ni impossibilité permanente ni autorisation de remplacer la capture réelle.

Scénario préparé à partir de `ACCESSIBILITE.md` et `docs/accessibilite.md` lus en entier.
La préparation locale a maintenant créé une organisation dédiée, sans effacer
les autres scénarios : quatre postes, cinq créneaux, cinq membres fictifs,
une inscription confirmée et une demande à valider. Les créneaux Accueil
10h–12h et Vestiaire 11h–13h se chevauchent réellement ; Aline est inscrite
à Accueil. Le poste long et un créneau libre sont également présents.
Le rapport `accessibility-keyboard-display/preparation.json` conserve les
identifiants et les contrôles de cardinalité. Le script de préparation refuse
de remplacer une organisation existante. Aucun email n'a été envoyé.
Le manifeste de dix chapitres est maintenant préparé et déclaré dans le
catalogue sous `ACCESSIBILITY_KEYBOARD_DISPLAY`, avec `captureReady: false`
et `published: false`. Il prévoit une seule narration Puck continue et
intègre la limite réelle du petit écran. Pas de recorder complet, narration
générée ou MP4 pour cette vidéo à ce stade.
Zoom réel et capture d'un lecteur d'écran sont des exigences encore non réalisées,
pas des validations implicites ni des séquences remplacées par une simulation.

Nouvelle vérification native du 6 octobre : le Mac reste verrouillé et aucune
application native n'est accessible. Le vrai zoom et VoiceOver sont donc
toujours à enregistrer après déverrouillage manuel. Le contrôle TypeScript
complet passe après ajout de la préparation.

Précontrôle réel du sélecteur sur la copie locale 43102 : le formulaire sans
créneau affiche « Sélectionnez un créneau. », marque le champ non valide et
lui rend le focus sans que le test le force. Les avertissements « Déjà inscrit »
pour Accueil et « conflit » pour Vestiaire sont présents et la capture a été
inspectée. Flèche bas change l'option active, Entrée sélectionne en conservant
le focus et Échap ferme sans changer la valeur. Rapport `picker-preflight.json`.
Deux erreurs de sélecteur du test ont été corrigées après observation : point
final du message et majuscule de « Déjà inscrit ». Aucun défaut du produit
n'en est déduit. Aucune inscription n'a été créée. Ce précontrôle utilise
des clics pour préparer le formulaire et ne prétend pas démontrer un parcours
entièrement au clavier, une annonce VoiceOver ou une vidéo synchronisée.

Contrôle d'affichage supplémentaire : la liste ouverte et ses avertissements
tiennent dans une largeur de 320 px. Les images à 320 px et en couleurs forcées
claires/sombres ont été inspectées. En émulation, le contour du champ, le
marqueur de l'option active et la coche de sélection restent visibles ; l'image
porte « Émulation Chromium — pas un test Windows ».

Limite observée sur la copie locale : la page entière mesure 381 px pour un
viewport de 320 px, avec notamment le filtre « Tous les postes » débordant à
droite. Ne pas présenter le contrôle de la liste comme une absence de
défilement horizontal de toute la page. Les champs prénom/nom et email/téléphone
restent en deux colonnes étroites. Le tournage doit montrer cette limite avec
une explication, pas masquer ou réparer l'interface par une transformation CSS.
Aucune modification du produit n'a été faite dans ce travail vidéo.

Le texte du chapitre lecteur d'écran décrit la séquence prévue, pas une
vérification déjà obtenue. Il ne pourra être utilisé dans un montage livré
qu'avec une véritable capture de VoiceOver et son audio, ainsi que les mentions
du système et du navigateur. De même, le chapitre zoom exige une vraie capture
du zoom natif. Ne pas livrer ces passages accompagnés d'images fixes ou d'une
voix de lecteur d'écran synthétique. Le catalogue reste bloqué pour le tournage
complet tant que ces exigences ne sont pas réalisables.

### Capture native du 6 octobre — après activation manuelle de VoiceOver

La permission d'enregistrement d'écran est accordée. ScreenCaptureKit permet
de capturer le véritable audio du processus `com.apple.VoiceOver` : aucune
entrée microphone ni voix de remplacement n'est utilisée. Philippe a activé
VoiceOver manuellement. Un essai audio, puis une prise de 55 secondes de la
fenêtre Safari contenant le planning fictif ont été enregistrés.

La copie locale a été reconstruite depuis le main `6dc553526e5aabf81be975f9185e0dcf8503262e`,
sur le port dédié 43102. La prise native montre le focus sur Accueil du matin,
la sélection avec Espace, puis le déplacement sur Accueil de l'après-midi et
Caisse (sur validation). Les fichiers `native/reader-20261006b.{mp4,m4a,json}`
conservent image, audio et timestamps communs ; `native/reader-preview.mp4`
est un aperçu technique synchronisé, pas la vidéo de formation terminée.
L'image a été inspectée et l'audio est non silencieux ; l'écoute qualitative
et la vérification des annonces exactes restent à faire. Aucun parcours
complet ni conformité VoiceOver n'est déclaré validé par cet essai.

Le précontrôle du sélecteur passe sur cette copie actuelle après adaptation
de son nom accessible : « Créneau » sans astérisque décoratif, avec
`aria-required=true`. Erreur, focus restauré par l'application, avertissements,
Entrée/Échap, liste à 320 px et émulation des couleurs forcées ont été contrôlés.
Aucune inscription n'a été ajoutée par ce précontrôle.

Safari ne propose que 300 % dans son menu : le vrai 400 % nécessite ici un
autre navigateur. La tentative dans une fenêtre Brave distincte a été
interrompue car le focus a quitté la fenêtre de formation ; ses fichiers ont
été retirés du dossier de montage et ne doivent pas être utilisés. Pour la
reprise, vérifier la fenêtre active avant chaque action native et interrompre
la prise si elle change. Ne pas considérer des raccourcis envoyés comme la
preuve que le zoom a effectivement atteint 200 % ou 400 %.

Le montage complet, la capture de zoom, les autres scènes synchronisées et
la narration continue restent à produire. `captureReady` reste faux.


## Révision du 2026-10-16 — lot 22-7

Relecture du produit `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased], PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 et #1022 (correction #1013). Les exemples de chevauchement utilisent des postes ordinaires non cumulables. Le formulaire public conserve « convention des bénévoles ». La page personnelle peut aussi afficher « Mes réponses » et « S’inscrire à d’autres créneaux ».

WAITING TTS — plafond mensuel connu ; aucun appel. Narration entière à régénérer avec Puck, une seule passe, `continuousPauseTags: false`. Phrases corrigées pour le vouvoiement :
- Prenez votre temps : ce repère sert à savoir quel bouton ou quel champ va réagir.
- Si un élément gêne votre usage, décrivez l'écran et le geste dans votre retour.
- Cette simulation ne remplace pas un essai sur votre appareil.
- Vous rencontrez une difficulté ?
- Indiquez la page, le geste tenté, le résultat attendu, le navigateur et, si vous en utilisez un, le lecteur d'écran.

Précontrôles sur le build du lot 22-7 : `verify-accessibility-picker.ts` et `verify-accessibility-current-pages.ts` passent. Onglets actuels, Cumul, Charte des bénévoles, sélection publique au clavier et vrai lien Accessibilité contrôlés ; largeur de document 381 px à 320 px toujours observée. Ces captures ne valident ni le zoom natif ni VoiceOver, et ne sont pas un film final.

## Révision du 2026-10-22 — lot 30

Une seule entrée Tab par jour dans la Frise ; ← → : même poste · ↑ ↓ : poste voisin · Tab : quitter le planning. Début/Fin : extrémités du poste ; Ctrl+Début/Ctrl+Fin : extrémités du jour. Les barres indisponibles restent atteignables et décrivent leur indisponibilité, sans permettre la sélection. La ligne d’aide apparaît au focus clavier. Narration complète à régénérer en une seule passe Puck, sans balises de pause.

### Narration courante

#### welcome

Une souris n'est pas indispensable pour organiser une fête. Le clavier peut aussi rendre les gestes plus confortables. Dans notre organisation fictive, commençons par Tab : le contour indique où nous sommes. Le lien d'évitement permet de rejoindre directement le contenu avec Entrée. Tab avance, Majuscule et Tab reviennent au contrôle précédent. Les touches affichées correspondent aux gestes réellement effectués. Prenez votre temps : ce repère sert à savoir quel bouton ou quel champ va réagir.

#### public

Côté bénévole, Tab entre dans le planning du jour sur une seule barre. La ligne sous la Frise rappelle les touches. Gauche et droite parcourent le même poste. Haut et bas rejoignent le poste voisin. Tab quitte le planning. Les barres indisponibles restent atteignables et leur nom indique pourquoi elles ne peuvent pas être choisies. Revenons à Accueil, puis sélectionnons ce créneau. Continuons jusqu'au formulaire. Le récapitulatif rappelle le poste, la date et l'horaire : il permet de vérifier son choix avant de s'engager. Un champ obligatoire manque ? Lisons le message, revenons au champ et complétons-le. La validation n'est pas seulement une couleur rouge. Les personnes et adresses utilisées ici sont fictives ; nous ne contactons aucun vrai bénévole pendant cette formation.

#### picker

Dans les inscriptions, ouvrons l'ajout manuel. Aline a déjà un créneau à l'accueil. Renseignons son adresse, puis atteignons Créneau. Une flèche ouvre la liste et les flèches déplacent l'option active. Une lettre aide à retrouver un poste. À l'accueil, nous voyons Déjà inscrit. Le vestiaire chevauche son horaire : la mention conflit nous invite à vérifier avant de choisir. Entrée retient une option. Rouvrons, puis appuyons sur Échap : la valeur précédente reste conservée. Le filtre de créneau utilise le même principe pour retrouver les inscriptions à afficher.

#### error

Essayons maintenant d'ajouter une personne sans choisir de créneau. Le message Sélectionnez un créneau apparaît et le focus revient au champ concerné. Il n'est pas nécessaire de repartir du début de la page. Choisissons un créneau libre, puis ajoutons notre personne fictive. Vérifions le résultat dans les inscriptions et le compteur affiché. Une annonce de résultat, lorsqu'elle est lue par un lecteur d'écran, ne doit pas être confondue avec notre narration. Ici, nous montrons d'abord les gestes et l'état réel de l'interface.

#### planning

Pour préparer le planning, le clavier permet aussi de passer de Frise à Liste. Vérifions quelle vue est sélectionnée. Ouvrons l'éditeur d'un créneau, puis annulons : le focus doit revenir à un contrôle utile. Dans Gérer les postes, les flèches Monter et Descendre offrent une alternative au glisser-déposer. Déplaçons un poste, puis regardons sa nouvelle position. Rechargeons pour vérifier que l'ordre a bien été enregistré. Le but n'est pas de mémoriser toutes les touches, mais de pouvoir construire et corriger son planning sans dépendre d'un geste précis à la souris.

#### zoom

Si le texte est trop petit, utilisons le zoom du navigateur. Passons à deux cents pour cent, puis à quatre cents pour cent. Ce n'est pas un agrandissement ajouté au montage : le navigateur adapte réellement son affichage. Vérifions les champs et les commandes. Sur la chronologie, un défilement horizontal peut rester nécessaire pour parcourir les horaires. Revenons ensuite à cent pour cent. Le confort dépend aussi de la taille de la fenêtre et du navigateur ; cette démonstration ne garantit pas tous les appareils.

#### mobile

Regardons une fenêtre simulée de trois cent vingt pixels de large. Ce n'est pas un essai sur un téléphone physique. Dans la liste, vérifions les noms longs, la mention Déjà inscrit et les conflits d'horaire. Il faut parfois faire défiler pour atteindre la suite. Regardons aussi les filtres et les champs du formulaire : une liste qui tient dans l'écran ne suffit pas à valider toute la page. Si un élément gêne votre usage, décrivez l'écran et le geste dans votre retour. Cette simulation ne remplace pas un essai sur votre appareil.

#### contrast

Comparons maintenant l'affichage normal avec les couleurs forcées de Chromium, en clair puis en sombre. L'encart précise qu'il s'agit d'une émulation, pas d'un test Windows. Le contour du champ, le marqueur de l'option active et la coche du choix retenu n'ont pas le même rôle. Vérifions qu'ils restent repérables. Regardons aussi un interrupteur activé puis désactivé : son état ne devrait pas dépendre seulement d'une couleur. Ces images aident à examiner le contraste, sans remplacer un essai réel dans les thèmes de contraste du système.

#### reader

Un lecteur d'écran transforme les noms, les états et les messages en informations parlées. Écoutons maintenant une courte utilisation réelle de VoiceOver, avec le système et le navigateur indiqués à l'écran. Le nom du créneau et son état doivent aider à comprendre ce que l'on choisit. Notre voix de formation ne remplace pas cette lecture. Cet exemple porte sur ce parcours précis : il ne signifie pas que tous les écrans sont validés, ni que le comportement sera identique avec NVDA ou sur un téléphone.

#### limits

Pour connaître le périmètre des essais et les limites connues, ouvrons Accessibilité depuis le pied de page. La page décrit une évaluation partielle, pas une promesse que tout fonctionne partout. Vous rencontrez une difficulté ? Le lien de contact permet de la signaler. Indiquez la page, le geste tenté, le résultat attendu, le navigateur et, si vous en utilisez un, le lecteur d'écran. Nous n'envoyons pas de message dans cette démonstration. Un retour précis aide à rendre l'outil plus confortable pour tout le monde, petit à petit.
