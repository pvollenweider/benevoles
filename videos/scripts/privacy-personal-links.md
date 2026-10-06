# Les bons liens, pour les bonnes personnes

Quatrième prise : capture et montage terminés, dix durées de scènes alignées.
La fiche de Léa s'ouvre désormais à 39 % du chapitre « admin » au lieu de 29 % ;
la comparaison avec le responsable montre le même rappel réel et explicitement
étiqueté qu'au bilan. Les images à 25 % et 60 % de ce chapitre ont été inspectées :
elles montrent respectivement les inscriptions et le rappel de l'équipe Accueil.
Les nouveaux contrôles Gemini du MP4 sont **en attente** : HTTP 429 observé lors
du contrôle des paroles puis audiovisuel, et encore lors d'une reprise espacée.
Les résultats de la troisième prise ne valident pas ce nouveau MP4. Ne pas
présenter cette prise comme prête avant la fin de ses propres contrôles.

Contrôle de la troisième prise, le 5 octobre : dix chapitres du MP4 passent la
reconnaissance indépendante (0 % de différence de mots), les durées sont alignées
et les quarante images de contrôle ont été inspectées. Le rappel de la vue
responsable est une image de cette même capture, explicitement présentée comme
enregistrée avant son retrait ; son empreinte est contrôlée. Le contrôle
audiovisuel ne relève rien sur neuf chapitres, mais signale dans « admin » une
ouverture de fiche environ quatre secondes trop tôt et l'absence de la vue du
responsable lors de sa comparaison. Les rapports originaux sont conservés dans
`third-take-audiovisual-review`. Le recorder retarde l'ouverture de fiche et
montre le rappel réel du responsable au moment de la comparaison. Une quatrième
capture est lancée : elle doit être remontée et recontrôlée avant validation.

Vidéo autonome 51 : `PRIVACY_PERSONAL_LINKS`. Voix continue Kore, souriante, rassurante et précise. Expliquer l'utilité des protections, les manipulations et leur résultat, sans promettre une conformité juridique ni une sécurité absolue.

## État des contrôles

Seconde prise : capture complète, MP4 remonté, dix durées et dix transcriptions
passent ; planche des quarante images inspectée. Huit chapitres passent la revue
audiovisuelle. Restent l'annonce des CGU avant leur ouverture et l'absence du
rappel visuel du responsable dans le bilan. Le texte légal annonce désormais les
CGU au moment de cette étape, puis toute la prise Kore est régénérée (pas de
nouvelle voix collée au chapitre). Le recorder enregistrera l'écran réel du
responsable avant sa révocation et le rappellera brièvement dans le bilan avec
la mention explicite « écran enregistré avant le retrait » ; le lien révoqué
n'est pas réactivé. Hash de cette image vérifié avant le rappel et la revue externe.
Les rapports de la seconde prise restent dans `second-take-audiovisual-review/`.
Nouvelle capture, transcription et revue du futur MP4 encore nécessaires.

Dernier contrôle du premier MP4 : dix durées et dix transcriptions passent ; la revue audiovisuelle signale cinq chapitres. Les conditions et l'envoi sont expliqués trop tôt pendant la saisie, et les clics de renvoi/retrait du responsable précèdent leur annonce. Le texte de saisie est enrichi, sans accélérer les champs, et une nouvelle prise Kore complète est générée pour garder la même voix dans toute la vidéo. Les repères des deux clics sont reculés ; le bilan montrera aussi le lien public puis le personnel. Le signalement d'un prénom absent est contredit par les captures `invitation-60.png` et `invitation-85.png` : Zoé, son email et le créneau sont visibles, et les valeurs avaient été vérifiées dans le DOM. Les dix rapports initiaux restent conservés dans `first-take-audiovisual-review/`. Aucun de ces contrôles ne valide la prise vocale suivante ni le futur MP4.

Dernier état : les dix chapitres de la répétition accélérée passent dans la copie compilée avec domaine fictif réservé. Les preuves de capture vérifient quatre nouveaux emails distincts, le préremplissage de Zoé, la révocation, les différences entre vues, les textes publics et le vrai CSV de six membres. Le garde-fou préalable à la revue externe passe (deux organisations exactes, seules identités fictives, hash du CSV, emails réellement présents). Le contrôle audio compare le début au chapitre administration sans détecter de changement de voix. Le seed est refait puis la prise narrée à vitesse normale est lancée ; la répétition ne constitue pas un MP4 synchronisé. Historique des étapes ci-dessous.

La répétition suivante a montré un défaut propre à la configuration locale : l'URL publique localhost contient `?org=`, puis l'email d'invitation y ajoute un second `?token=`. Le lien effectivement reçu affiche alors une 404. Aucun lien n'est réécrit pour fabriquer un succès et cette prise est rejetée. Une compilation locale avec le domaine de formation réservé `video.invalid` est préparée pour produire les vrais liens au format sous-domaine ; leurs chemins seront ouverts uniquement sur le serveur local. Le défaut localhost reste un constat distinct du produit déployé, sans modification applicative.

La voix continue et les dix transcriptions audio sont préparées. Le recorder est intégré et les 52 sources des outils vidéo passent le contrôle TypeScript. Les contrôles réels sur la copie compilée locale (43102) passent : isolation A/B, périmètres personnel et responsable, inscription sans jeton affiché, réponses de récupération identiques, invitation et trois emails reçus, révocation de l'ancien lien responsable. La première répétition a passé inscription et renvoi puis s'est arrêtée sur le renvoi de récupération : les préflights antérieurs avaient épuisé le compteur du même membre fictif. Le seed remet désormais à zéro les seuls compteurs loopback et membre observés dans la base vidéo isolée ; aucune limite applicative n'est changée. Répétition complète relancée, pas encore validée. Aucun MP4 final ni contrôle audiovisuel final revendiqué.

## Parcours à filmer et à vérifier

1. Deux organisations locales séparées, chacune avec sa propre session d'organisation, un événement portant le même identifiant et une fiche Léa Exemple. Montrer leurs listes et leurs coordonnées fictives différentes. Dans la session A, une lecture du détail de l'événement B doit être refusée ; ne pas fabriquer un écran de refus. Ce cas ne prouve pas à lui seul toutes les garanties de sécurité.
2. Inscription publique sans invitation d'une nouvelle personne fictive. Montrer le formulaire, la confirmation et l'absence de lien de gestion révélé à l'écran ; rapprocher la vraie réponse de l'API (`editToken: null`, `linkSentByEmail: true`) et le vrai email reçu. Ouvrir le lien reçu dans cet email. Ne pas parler d'un code de vérification ou d'une validation préalable de l'adresse : cette inscription n'en demande pas.
3. Page personnelle : inscriptions de cette personne, panneau « Ton lien personnel », avertissement de confidentialité, renvoi effectif du lien par email et résultat. Le lien est un moyen d'accès ; il n'est pas le QR code public à partager. Vérifier que la page ne contient ni l'autre organisation ni toute l'équipe.
4. Lien invalide dans l'organisation A. Saisir l'adresse connue, envoyer, relever le message de réponse et recevoir l'email réel. Rejouer avec une adresse fictive inconnue : même message, pas de coordonnées ni de jeton dans la réponse. Faire une troisième demande pour une adresse présente seulement dans B depuis A : même réponse, aucun email provenant de B. Respecter la limite ; ne pas rendre cette protection inopérante dans le code applicatif.
5. Invitation nominative réellement envoyée : ouvrir son vrai lien, constater le formulaire prérempli et expliquer que cette invitation donne des informations destinées à la personne invitée. Ne pas dire que simplement taper une adresse prouve qu'on la possède. Éviter de refaire une inscription identique au chapitre 2 ; personne témoin distincte.
6. Responsable : lien Accueil A, équipe Accueil remplie et informations opérationnelles réellement visibles. La personne inscrite sur Logistique A et celles de B ne doivent pas apparaître. Montrer la révocation dans l'administration puis le refus de l'ancien lien. Ne pas affirmer que le responsable ne voit aucun téléphone : il voit les informations de contact prévues pour son équipe.
7. Organisateur A : inscriptions, réponses aux questions de l'événement et fiche membre avec disponibilités et notes internes. Comparer avec la page bénévole et la page du responsable. Toute différence annoncée doit être confrontée aux vues/JSON réels, pas déduite d'une règle théorique.
8. Depuis le vrai pied de page, ouvrir Confidentialité puis CGU. Montrer les sections sur les usages des données, les destinataires, la conservation et le contact en suivant le texte actuel. Ne pas inventer de délai universel, de garantie de conformité ou de conseil juridique.
9. Vrai rapport imprimable : comparer une liste utile au stand à un export de membres comportant notes et coordonnées. Expliquer où ranger les copies, à qui les remettre et pourquoi une copie téléchargée ne se met pas à jour. Aucun faux dialogue d'impression ; ne pas prétendre avoir supprimé des copies ailleurs.
10. Retour à la page personnelle et à l'avertissement : partager le lien public pour recruter, garder les liens personnels pour leurs destinataires, contacter l'organisation si un lien a été diffusé par erreur. Ne pas promettre un bouton de rotation des liens bénévoles s'il n'existe pas.

## Données isolées à créer

- Organisations `video-privacy-a` / `video-privacy-b`, noms « Formation — confidentialité A/B », slugs `formation-confidentialite-a/b`.
- Administrateurs propriétaires dédiés, mots de passe locaux copiés sans affichage depuis le compte de formation ; aucune création en production.
- Même slug d'événement `fete-des-liens`, dates futures et créneaux Accueil/Logistique non chevauchants, avec instructions et contact opérationnel fictifs.
- Deux Léa Exemple, profils et adresses distincts ; un email commun dans deux fiches peut servir à vérifier le périmètre, mais ne doit pas être présenté comme un doublon à fusionner.
- Au moins deux personnes par poste, réponses fictives à une question facultative, disponibilités et une note interne identifiable comme exemple.
- Une personne sans inscription pour la nouvelle inscription, une autre invitée et une adresse présente uniquement dans B. Toutes les adresses appartiennent à `example.org`, tous les téléphones sont fictifs.
- Responsable Accueil A avec lien chiffré de démonstration. Produire invitation, inscription, renvoi et révocation via les vraies routes, pas des emails ou historiques dessinés.

## Sources de comportement relues

`LinkRequestForm`, `PersonalLinkPanel`, `PublicFooter`, la route de récupération des liens et la route d'inscription publique : l'organisation de récupération vient du contexte résolu ; la réponse connue/inconnue est la même ; le lien de gestion d'une inscription sans preuve n'est pas retourné sur l'écran ; une invitation valide est traitée séparément. Les permissions et les vues du responsable restent à confronter aux données dédiées.

## État

Script et manifeste de dix chapitres écrits. La prise continue Kore est générée, ses neuf frontières recalées et ses dix transcriptions indépendantes passent (0 à 2 % de différences). Le vrai seed dédié a créé deux organisations, dix membres, deux postes remplis dans chaque événement et des réponses fictives. Le précontrôle des routes réelles passe : lecture croisée refusée dans les deux sens, homonymes aux adresses distinctes, page personnelle limitée à une inscription avec disponibilités mais sans notes, responsable limité à l'accueil avec contacts mais sans fiche interne, inscription anonyme sans jeton retourné, réponses de récupération identiques sans email de l'autre organisation et invitation effectivement envoyée. Le contrôle complémentaire rapproche trois vrais emails reçus dans Mailpit, vérifie le préremplissage nominatif et son refus dans l'autre organisation, puis la révocation effective du responsable et le refus de son ancien lien. Preuve : `preparation.json`, sans jetons. Ces précontrôles modifient le jeu ; remise à zéro requise avant capture. Recorder, montage et contrôle audiovisuel restent à faire. Capture désactivée et aucun contenu publié.
