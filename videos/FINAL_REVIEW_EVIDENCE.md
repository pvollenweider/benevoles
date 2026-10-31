# Suivi des preuves de revue finale

Le contrôle local `videos/tools/check-final-review-evidence.ts` inspecte toutes
les entrées du catalogue et produit `videos/output/final-review-evidence.json`.
Il compare l'empreinte du MP4 actuel à celle des rapports audiovisuels de chaque
chapitre et vérifie que la timeline contient exactement les chapitres attendus.
Il ne fait aucun appel externe et ne modifie aucun média.

Il vérifie également la narration source : modèle Gemini 3.8 TTS, voix du
manifeste, génération continue identique pour tous les chapitres, transcript
de référence actuel et empreinte de chaque WAV correspondant à l'audit ASR.
L'empreinte de génération doit aussi correspondre aux consignes actuelles
d'intonation et de pauses : changer ces consignes invalide une ancienne voix,
même si la transcription reste identique.
L'absence d'audit ne prouve pas que la voix est incorrecte : elle marque une
preuve manquante à obtenir, pas une obligation automatique de régénérer.

Dernière exécution du 6 octobre 2026 : 54 entrées inspectées (le catalogue
inclut aussi les vidéos de présentation, ce n'est pas le décompte des seuls
modules 12 à 53). Neuf ont tous leurs
rapports audiovisuels sans signalement correspondant au MP4 actuel. Ce nombre
ne désigne pas des vidéos certifiées terminées : voix, transcript et prompt
actuels, couverture fonctionnelle et revue humaine restent des contrôles
séparés. Les signalements mineurs conservés dans les rapports restent visibles
dans leurs fichiers et ne sont pas effacés par cet inventaire.

Trente-et-une entrées ont une narration source contrôlée correspondant aux
transcripts actuels et à une seule génération identifiée. Cela ne prouve pas
que ces fichiers sont correctement intégrés ni synchronisés dans le MP4.
La vidéo opérateur a notamment un transcript modifié après la génération :
la narration doit être refaite en continu avant sa prise finale. Pour les
autres lignes signalées, consulter les détails chapitre par chapitre afin de
distinguer un audit absent d'un audit devenu obsolète.

Les rapports des vidéos `PRIVACY_PERSONAL_LINKS` et `LAST_MINUTE_CHANGES`
correspondent à des montages antérieurs. Leur revue visuelle locale a avancé,
mais leurs audits audiovisuels doivent être refaits sur les nouvelles prises.
Les anciens résultats ne doivent pas être utilisés pour les déclarer validées.

Le blocage Gemini précédent est levé : les nouvelles générations et leurs
contrôles fonctionnent. L'inventaire lui-même ne fait aucune requête API.
Le dernier contrôle de l'accès natif du Mac demandait un déverrouillage manuel.
Cela empêche les séquences système réelles des notifications et de
l'accessibilité. Les captures Chromium simulées ne les remplacent pas.

Les vidéos 29, 43 et 53 ont leurs parcours de répétition fonctionnels, mais
pas une nouvelle narration complète validée conforme au script courant.
La vidéo 52 reste sans recorder complet ni montage ; sa base fictive et ses
précontrôles clavier ne constituent pas une vidéo livrée. La dernière revue
de `org-timezone-charter` a été suivie d'une recapture : le MP4 actuel montre
le créneau pendant l'explication de son heure. Ses huit chapitres ont une
revue audiovisuelle automatisée sans signalement et une transcription du
montage final ; cela ne constitue pas un visionnage humain intégral.

La couverture des dates du journal d'événement reste distincte : le rapport
`event-activity-log/coverage-check.json` mesure un historique de quelques
secondes, pas deux semaines. Aucun horodatage n'a été modifié pour contourner
ce manque.

## Reprise effectuée le 6 octobre 2026

- Nouvelles captures et nouveaux montages : identité publique, fuseau/convention,
  emails, équipe/permissions, création depuis une page blanche, modèles,
  pages/programme/QR, jalons et vues du planning.
- La nouvelle prise de création depuis une page blanche passe huit revues
  audiovisuelles ; pages/programme/QR en passe huit ; le planning en passe six.
  Le planning utilise le libellé actuel « Frise » et termine réellement dans
  cette vue après l'enregistrement de l'ordre.
- Les confirmations d'enregistrement, saisies et changements de vue ont été
  recalés sur la narration et leurs résultats maintenus lisibles.
- Les voix sont générées en continu avec Gemini 3.8 Flash TTS. Une prise
  prononçant les consignes de pause a été rejetée puis remplacée.
- Des signalements restent dans l'équipe, les modèles et les emails. Certains
  sont contredits par les images, consignées avec l'empreinte exacte du MP4
  dans `scripts/review-counterchecks.md`. Un signalement de perception de voix
  dans l'équipe reste à écouter, sans prétendre le résoudre par une empreinte.
- Les termes « Frise » et « Liste » sont appliqués aux scripts concernés ;
  toute narration ancienne dont le texte a changé doit être régénérée.
- Tous les autres modules et les compléments de couverture documentaire ne
  sont pas encore repris. Ces résultats ne constituent pas une livraison des
  54 vidéos, ni une garantie de couverture intégrale du produit.

## Écarts ouverts par le minimum par créneau (#949)

Le champ facultatif « Minimum » change des écrans montrés, sans changer les
libellés ni les sélecteurs de capture existants (« Places », « Capacité * »,
« Personnes par créneau ») :

- `shift-timeline-quick-actions` : la fenêtre d'un créneau sur la frise a un
  champ « Minimum » à côté de « Places », et « Appliquer à tout le poste » passe
  sous les deux champs, avec une aide « Places et minimum sur tout le poste ».
- `shift-create-series` : le formulaire de série a un champ « Minimum par
  créneau (optionnel) » après « Personnes par créneau ».
- toute vidéo qui ouvre le formulaire d'un créneau, au moins `shift-create-edit-detail` (à vérifier : `organizer-create-publish`, `shift-approval`, `shift-waitlist-offer`, `admin-features-tour`) :
  un champ « Minimum (optionnel) » entre « Capacité » et « Description ».
- `staffing-gaps` : rien ne change tant que la base de démonstration n'a aucun
  créneau avec un minimum (le texte d'aide et le tri restent ceux d'avant) ; la
  narration ne parle pas encore du minimum.

Ces vidéos n'ont pas été régénérées dans la même PR : elles montrent encore
l'ancienne disposition de ces formulaires et restent à reprendre.

## Écart connu : en-tête des pages publiques (#872)

- `masterclass-03-first-steps` montre brièvement `/doc/admin`. Depuis l'ajout de
  « Pour qui ? » dans l'en-tête des pages publiques, l'en-tête filmé n'a pas
  cette entrée. Ni la narration ni les sélecteurs de capture ne sont touchés :
  à reprendre à la prochaine régénération de cette vidéo.

## Écart connu : frise au clavier (#1075)

Chaque jour de la frise de la page publique est maintenant un seul arrêt de Tab ;
les flèches passent d'un créneau à l'autre, y compris les créneaux qu'on ne peut
pas choisir, et une ligne « ← → : même poste · ↑ ↓ : poste voisin · Tab : quitter
le planning » s'affiche sous la frise pendant l'usage au clavier.

- `accessibility-keyboard-display` (scène « public ») : la capture atteint le
  créneau « Accueil » au clavier ; `tabTo` (`videos/lib/record-accessibility.ts`)
  passe maintenant aux flèches dans la frise. Une nouvelle capture montrerait la
  ligne des touches et d'autres touches pressées : à régénérer.
- `volunteer-choose-shifts` : rien de visible à la souris ; à revoir seulement si
  la vidéo montre le clavier.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : liste des organisations du super admin (#1081)

La liste `/super-admin/organizations` a maintenant une colonne « Activité »
(événement en cours, à venir, dernier événement ou aucun), placée après « État »,
et sous « État » une ligne quand aucun propriétaire n'est actif (« Propriétaire
jamais activé (lien expiré le …) », « Lien d'activation valable jusqu'au … »,
« Aucun compte propriétaire »).

- `platform-internal-administration` : la scène d'accueil filme l'ancienne liste
  et sa narration ne cite ni l'activité ni la ligne du propriétaire ; les
  chapitres de création et d'activation montreraient cette ligne changer. À
  revoir à la prochaine régénération.

Cette vidéo n'a pas été régénérée dans la même PR.

## Écart connu : largeur de la liste des membres (#1102)

La page `/admin/members` est maintenant plus large (`max-w-7xl`, 1248 px de
contenu à 1280 px au lieu de 992) ; la barre de navigation garde sa largeur.
Les actions d'une ligne (« Activité », « Modifier », « Désactiver ») sont côte à
côte au lieu d'être empilées, les lignes sont plus basses. Libellés, noms
accessibles et sélecteurs inchangés : les captures continuent de fonctionner.

Vidéos filmées à 1280 px qui montrent la liste des membres avec l'ancienne
disposition, à revoir à la prochaine régénération : `members-management`,
`members-duplicates-merge`, `data-exports-archives`, `email-delivery-failures`,
`last-minute-changes`, `privacy-personal-links`, `volunteer-hours-certificate`,
`attendance-check-in`, et les passages sur « Membres » de `admin-features-tour`
et `admin-navigation`. Aucune narration ne décrit la disposition du tableau.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : confirmation et lien perdu (#1097)

Après une inscription par le lien public, la page de confirmation dit maintenant
« L'email de confirmation contient ton lien personnel : garde-le pour modifier
ou annuler ton inscription. » avec « En savoir plus ↗ », et son bouton du bas
s'appelle « Revenir à l'événement » (vers l'événement) au lieu de « Retour à
l'accueil ». La page de l'événement a, en bas du planning et sans session, un
repli « J'ai perdu mon lien personnel » avec le formulaire de demande du lien.
Sélecteurs des captures inchangés (« Merci pour ton engagement… », absence de
« Accéder à mon inscription ») : les captures continuent de fonctionner.

- `volunteer-register-mobile` (scène « success ») : filme l'ancienne
  confirmation (bouton « Retour à l'accueil », pas de phrase sur le lien) ; la
  narration reste juste.
- `volunteer-confirmation-errors` : les confirmations comparées montrent
  l'ancienne page côté lien public.
- `privacy-personal-links` : la confirmation anonyme filmée est l'ancienne ; la
  récupération d'un lien perdu peut maintenant partir de la page de l'événement,
  la narration (« Depuis la page de récupération ») reste juste.
- `volunteer-session-availability` (citée par le guide « Ton lien personnel ») :
  la page de l'événement sans session montre maintenant le repli en bas du
  planning, si la vidéo y descend.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : questions posées à certains postes (#1140)

Le formulaire « Nouvelle question » / « Modifier la question » a maintenant, après
« Afficher seulement si… », le réglage « À qui poser cette question ? » (« Tous
les bénévoles » coché par défaut, ou « Certains postes seulement » avec les
postes à cocher), et le choix par défaut de « Afficher seulement si… » s'appelle
« Toujours (sans condition) » au lieu de « Toujours (question posée à tous) ».
Sélecteurs des captures inchangés (« Réponse obligatoire », « Afficher seulement
si », « Enregistrer ») : les captures continuent de fonctionner, et les
questions de la vidéo restent posées à tous les bénévoles.

- `event-questions` (scènes `create-*`) : le formulaire filmé n'a pas le nouveau
  réglage, et la scène Oui / non montre l'ancien libellé « Toujours (question
  posée à tous) » ; la narration reste juste.

Cette vidéo n'a pas été régénérée dans la même PR.

## Écart connu : accès « attribué par l'organisation uniquement » (#1145)

Dans « Gérer les postes », le texte d'introduction du panneau dit maintenant
« réserver un poste à certains membres ou à l'organisation », et l'éditeur
« Accès » commence par la case « Poste « … » attribué par l'organisation
uniquement » et son explication, au-dessus du champ des étiquettes.
Sélecteurs des captures inchangés (bouton « Accès : sécurité, poste « Sécurité »
réservé », champ « Étiquettes donnant accès au poste « Sécurité » », visible tant
que la case n'est pas cochée) : les captures continuent de fonctionner.

- `shift-eligibility-rules` (scène « La limite et les étiquettes ») : filme
  l'ancien éditeur « Accès », sans la case ; la narration reste juste.
- `shifts-roles-views` (passage « Dans Gérer les postes ») : l'introduction du
  panneau filmée est l'ancienne ; la narration reste juste.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : un seul nom par écran (#1099)

Renommés dans l'interface, les emails et les guides : la page personnelle des
bénévoles s'appelle « Mes inscriptions » (son titre) ; l'onglet « Communication »
d'un événement devient « Messages » ; le titre « Modifier l'événement » devient
« Informations de l'événement » ; « Partager l'événement » devient « Liens à
partager » ; la page de connexion « Administration » devient « Espace
organisateur » ; les boutons des emails « Voir mes créneaux », « Gérer mon
inscription » et « Voir mon inscription » deviennent « Gérer mes inscriptions »
(« Voir mes inscriptions » le jour même). Sources mises à jour dans la même PR :
narration et bloc `viewer` des manifestes, scripts, sélecteurs et repères de
narration (`videos/tools/record.ts`, `videos/lib/record-privacy.ts`). Les
captures suivantes trouvent les nouveaux libellés.

Narration modifiée (le son et les sous-titres publiés disent encore l'ancien nom) :

- `admin-navigation`, `org-email-settings`, `reminders-changes`,
  `targeted-messages` : « Communication » devient « Messages ».
- `privacy-personal-links`, `shift-approval`, `shift-night-dst`,
  `shift-roster-visibility`, `volunteer-calendar`,
  `volunteer-personal-registrations`, `volunteer-phone-notifications`,
  `volunteer-session-availability` : « page personnelle » devient « page Mes
  inscriptions ».

Image seulement (la narration reste juste) :

- toute vidéo filmée sur une page d'un événement montre l'onglet
  « Communication » dans la barre d'onglets ;
- `admin-features-tour`, `event-program-pages-qr`,
  `event-visibility-registration-window` : titre « Modifier l'événement » ;
- `admin-navigation`, `event-program-pages-qr`, `event-review-publish`,
  `organizer-create-publish` : titre « Partager l'événement » ;
- `org-team-permissions`, `volunteer-form-recap`, `volunteer-register-mobile` :
  page de connexion « Administration » ;
- `registrations-management` : bouton « Voir mes créneaux » de l'email.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : communications préremplies depuis une version (#762)

L'écran `/super-admin/product-updates` a maintenant, en tête de la carte
« Nouveau message », « Partir des nouveautés de la version » : une liste des
versions publiées et un bouton « Préremplir », avec une phrase d'aide.

- `platform-internal-administration` : les scènes « preview » et « broadcast »
  filment la carte sans ce choix ; la narration (objet et contenu saisis à la
  main) reste juste et les sélecteurs de capture ne changent pas. Image
  seulement, à revoir à la prochaine régénération.

Cette vidéo n'a pas été régénérée dans la même PR.

## Écart connu : page « Mes inscriptions » installable et étapes iPhone (#593)

Sur `/my/[token]`, le bouton « Recevoir des rappels push » n'est plus à droite
du lien de retour : il a sa propre ligne, au-dessus de ce lien. Sur iPhone et
iPad dans un onglet, la page affiche à sa place la carte « Recevoir les rappels
sur iPhone ou iPad » avec les étapes d'ajout à l'écran d'accueil.

- `volunteer-phone-notifications` : la scène « personal-link » filme le bouton
  à son ancienne place (bureau, 1280 px) ; le libellé, les sélecteurs de
  capture (`videos/lib/record-phone-notifications.ts`, par rôle et nom) et la
  narration restent justes (« Sur certains téléphones, des étapes
  supplémentaires peuvent être nécessaires »). Image seulement, à revoir à la
  prochaine régénération ; la carte iPhone pourra alors être montrée dans la
  scène « conditions », une fois vérifiée sur un vrai iPhone.

Cette vidéo n'a pas été régénérée dans la même PR.

## Écart connu : chemins plus courts des organisateurs (#1098)

La connexion ouvre le tableau de bord (plus la liste des événements) ;
« L'archiver » archive sur place ; « Prochaines étapes » d'un événement publié
a une ligne « inviter des membres » ; la page Membres a « Inviter à un
événement » ; l'onglet Messages a un lien « gérer les modèles de messages » ;
à l'étape 2 de la création, l'en-tête n'affiche plus « Publier ».

Sélecteurs mis à jour dans la même PR : toutes les attentes d'URL après la
connexion (`waitForURL(/\/admin\/dashboard/)`) dans `videos/tools/*.ts` et
`videos/lib/record-*.ts` ; `record.ts` (volunteer-form-recap) ouvre la liste des
événements après la connexion ; `record-operator.ts` attend le titre « Tableau
de bord » à la première connexion du nouveau compte.

Image seulement, narration juste, à revoir à la prochaine régénération :

- `platform-internal-administration` : la première connexion du nouveau compte
  arrive sur le tableau de bord (« Premiers pas », zéros) au lieu de la liste
  des événements ; « nous arrivons dans son organisation, encore sans
  événement » reste juste.
- `admin-navigation`, `admin-features-tour`, `staffing-gaps` : l'aperçu d'un
  événement publié montre la ligne d'invitation dans « Prochaines étapes ».
- `targeted-messages`, `email-delivery-failures`, `org-email-settings`,
  `reminders-changes` : une phrase et un lien de plus sous « Écrire aux
  bénévoles ».
- `members-management`, `members-import`, `members-duplicates-merge`,
  `data-exports-archives`, `event-questions`, `organization-activity-log`,
  `volunteer-hours-certificate` : le bouton « Inviter à… » en tête de la page
  Membres, s'il y a un événement publié à venir.
- `shift-create-series` : si la scène filme l'étape 2 de l'assistant, l'en-tête
  n'a plus « Publier ».

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : paramètres, page d'inscription, organisateurs (#1099, suite)

Renommés dans l'interface, les emails et les guides : « Réglages » devient
« Paramètres » (onglet d'un événement, « Paramètres des emails », « Paramètres
de l'attestation », « Paramètres enregistrés. ») ; la page où l'on s'inscrit à
un événement devient partout la « page d'inscription » (« Ouvrir la page
d'inscription », « Couleur de la page d'inscription », « Voir la page
d'inscription ») ; l'équipe d'un espace devient « les organisateurs »
(« Organisateurs (n) », « Inviter un organisateur », « Prévenir les
organisateurs à chaque inscription », comptes de l'espace dans le super admin).
Sources mises à jour dans la même PR : narration et bloc `viewer` des
manifestes, scripts, sélecteurs et repères de narration (`videos/tools/record.ts`,
`videos/lib/record-data-exports.ts`, `record-delivery.ts`,
`record-event-questions.ts`, `record-operator.ts`, `record-org-activity.ts`,
`record-reminders.ts`, `record-shift-roster.ts`). L'onglet d'un événement a pour
nom accessible « Paramètres de l'événement » (suffixe masqué) : les captures le
cherchent sous ce nom.

Narration modifiée (le son et les sous-titres publiés disent encore l'ancien mot) :

- « réglages » devient « paramètres » : `admin-features-tour`,
  `admin-navigation`, `data-exports-archives`, `email-delivery-failures`,
  `event-activity-log`, `event-create-blank`, `event-duplicate`,
  `event-questions`, `event-visibility-registration-window`,
  `masterclass-03-first-steps`, `org-email-settings`, `org-public-identity`,
  `org-team-permissions`, `org-timezone-charter`, `organization-activity-log`,
  `reminders-changes`, `shift-create-edit-detail`, `shift-recurrence`,
  `shift-roster-visibility`, `shift-timeline-quick-actions`,
  `volunteer-calendar`, `volunteer-hours-certificate`,
  `volunteer-phone-notifications` ;
- « administrateurs » devient « organisateurs » : `email-delivery-failures`,
  `event-activity-log`, `org-email-settings`, `org-team-permissions`,
  `organization-activity-log`, `platform-internal-administration` ;
- « page publique » ou « page de l'événement » devient « page d'inscription » :
  `event-archive-delete`, `event-create-blank`, `event-program-pages-qr`,
  `org-email-settings`, `privacy-personal-links`,
  `volunteer-personal-registrations`.

Image seulement (la narration reste juste) :

- toute vidéo filmée sur une page d'un événement montre l'onglet « Réglages »
  dans la barre d'onglets ;
- `org-team-permissions`, `admin-features-tour` : titre « Administrateurs (n) »
  et formulaire « Inviter un administrateur » ;
- `admin-features-tour`, `event-create-blank` : légende « Couleur de la page
  publique » du formulaire de l'événement ;
- `event-duplicate` : case « Les messages et réglages d'inscription » ;
- `shift-recurrence`, `shift-create-edit-detail` : phrase « Les réglages du
  poste … s'appliquent » sous le champ Poste ;
- `org-email-settings`, `reminders-changes` : titre « Réglages des emails »,
  case « Prévenir les administrateurs à chaque inscription », message
  « Réglages enregistrés. » ;
- `event-review-publish`, `organizer-create-publish`, `event-program-pages-qr` :
  lien « Ouvrir la page publique » de l'onglet Partage ;
- `platform-internal-administration` : « Premier administrateur » et compteurs
  « Administrateurs » du super admin ;
- `sector-leaders` : seul le bloc `viewer` change (« administrateurs »).

Ces vidéos n'ont pas été régénérées dans la même PR.

## Écart connu : commutateur d'assurance de la charte

Dans Paramètres, section « Charte des bénévoles », la phrase sous le
commutateur « Assurance RC fournie par l'organisation » devient « Votre
assurance RC couvre les dommages causés à des tiers. » ou « Chaque bénévole
répond lui-même des dommages causés à des tiers. ». Le texte par défaut de la
charte change : la puce sur la couverture accidents (« À disposer d'une
couverture accidents personnelle adéquate (LAA ou assurance équivalente). »)
et le dernier paragraphe sur l'assurance. Un texte personnalisé n'est plus
remplacé par le commutateur : un message et le bouton « Mettre à jour le
paragraphe sur l'assurance » apparaissent sous le commutateur.

Libellés du commutateur et de « Réinitialiser la charte par défaut »,
sélecteurs de capture (`videos/tools/record.ts`,
`videos/lib/record-accessibility.ts`) et narrations inchangés : les deux
vidéos partent du texte par défaut (`scripts/seed-video-scenario.ts`,
`volunteerCharter: null`), que le commutateur remplace toujours.

Image seulement, à revoir à la prochaine régénération :

- `ORG_TIMEZONE_CHARTER` (`org-timezone-charter`) : scène « charter », phrase
  sous le commutateur et texte de la zone de saisie ; scène « public-result »,
  texte de la convention défilé dans la fenêtre (puce LAA et clause
  d'assurance).
- `ACCESSIBILITY_KEYBOARD_DISPLAY` (`accessibility-keyboard-display`) : scène
  « contrast », phrase sous le commutateur.

Ces vidéos n'ont pas été régénérées dans la même PR.

## Vérifié sans écart : secteurs en bêta (#1147)

Les secteurs ne s'affichent que pour un événement dont l'option « Organiser les
postes par secteurs » est activée, ce qui demande une organisation inscrite à
la bêta et la fonction ouverte par l'opérateur. Les scénarios `seed-video-*`
n'activent ni l'une ni l'autre : les écrans filmés restent identiques.

Vidéos vérifiées (sources et sélecteurs, sans rendu) : `shifts-roles-views`,
`accessibility-keyboard-display` (« Gérer les postes », frise au clavier),
`shift-timeline-quick-actions`, `shift-create-edit-detail`,
`shift-create-series`, `shift-recurrence`, `shift-eligibility-rules`,
`shift-approval`, `shift-waitlist-offer`, `shift-night-dst` (frise admin).
Les sélecteurs de `videos/tools/record.ts` et `videos/lib/record-accessibility.ts`
(bouton et titre « Gérer les postes », barres de la frise) ne changent pas. Aucune
narration ni bloc `viewer` à modifier. Une future vidéo des secteurs demandera
un scénario qui ouvre la bêta.

## Vérifié sans écart : responsables de tout un secteur (#1169)

Les responsables de secteur, le choix « Tout un secteur / Un poste précis », le
classement par secteur et les nouveaux titres n'apparaissent que dans un événement
qui a adopté les secteurs. Les scénarios `seed-video-*` n'en créent aucun : la page
« Responsables de secteur », la page du responsable (« Responsable · Buvette »), les
emails des responsables et le choix des responsables à la duplication restent
identiques à l'écran.

Vidéos vérifiées (sources, manifestes, bloc `viewer` et sélecteurs, sans rendu) :
`sector-leaders`, `event-duplicate`, `staffing-gaps`, `registrations-management`,
`admin-features-tour`, `admin-navigation`, `privacy-personal-links`,
`data-exports-archives`, `event-review-publish`. Les sélecteurs de
`videos/tools/record.ts` (bouton « + Ajouter un responsable », champ « Poste »,
titre « Responsables de secteur ») ne changent pas ; seule une ligne de calcul y
accepte désormais un responsable sans poste. Aucune narration à modifier. Une
future vidéo des responsables de secteur demandera un scénario qui ouvre la bêta.

## À revoir : choix sous leur destinataire dans « Écrire aux bénévoles » (#1170)

Dans le formulaire « Écrire aux bénévoles », les champs **Poste** et **Créneau** s'affichent
désormais juste sous leur bouton radio (« Les bénévoles d'un poste », « Les bénévoles d'un
créneau ») au lieu d'après toute la liste des destinataires. Le destinataire « Les bénévoles
d'un secteur » n'apparaît qu'avec la bêta des secteurs, que les scénarios `seed-video-*`
n'ouvrent pas. Les sélecteurs (`getByRole("radio", …)`, `getByLabel(/^Poste/)`) ne changent
pas, mais l'image diffère quand un poste ou un créneau est choisi.

Vidéos à revoir, non régénérées dans ce changement (pas de pile locale, disque Docker plein) :
`targeted-messages` (choix du poste, puis du créneau), `last-minute-changes` (choix du
créneau), `organizer-monitor-followup` (choix du poste) et la vidéo qui ouvre le message
prérempli sur un créneau (`checks.messageAudiencePrefilled` dans `videos/tools/record.ts`).
Aucune narration ni bloc `viewer` à modifier.

## Écart connu : réponses « Demande enregistrée » des demandes de lien

« Mot de passe oublié » titre maintenant « Demande enregistrée » (au lieu de
« Email envoyé »), et les réponses de la demande d'un lien personnel
(`LINK_REQUEST_RESPONSE`) et de « Recevoir ce lien par email »
(`LINK_RESENT_RESPONSE`, src/lib/personal-link.ts) commencent par « Demande
enregistrée » au lieu de « vient de partir ». Aucune vidéo ne filme
`/admin/forgot-password`.

Vidéos dont l'image montre l'ancienne réponse, non régénérées dans ce
changement (pas de rendu ici) :

- `volunteer-session-availability` : scènes `resend` (« Un nouvel email avec ton
  lien vient de partir. ») et `recover` (ancienne réponse de « Recevoir un nouveau
  lien ») ;
- `privacy-personal-links` : scènes `personal` (renvoi du lien) et `recovery`
  (même réponse pour trois adresses).

Sélecteurs mis à jour : `videos/tools/record.ts` attend la nouvelle réponse de
« Recevoir ce lien par email » ; la scène `recover` cherche toujours « Si une
inscription existe à cette adresse », contenu dans la nouvelle réponse ;
`videos/lib/record-privacy.ts` lit la constante `LINK_REQUEST_RESPONSE`. La
narration et les blocs `viewer` restent exacts (« la réponse reste la même »,
« regarde aussi les indésirables ») : seule l'image est à reprendre au prochain
rendu, avec `revision` et `updatedAt` dans `videos/catalog.json`.

## Écart connu : noms de famille réalistes des personnes filmées

Les personnes fictives des données filmées ne s'appellent plus « Exemple ». Chaque
prénom garde le même nom de famille courant dans toutes les vidéos
(`videos/lib/fixture-names.ts`) : Aline Martin, Nicolas Peeters, Léa Müller,
Noah De Jong, Sarah Smith, Lucas Silva, Camille Rossi, Zoé Papadopoulos,
Emma Johansson, Élodie Nováková, Colette Jensen, Samira García, Paul Murphy,
Morgane Korhonen, Lou Tóth, Alex Ivanov, Jules Hansen. Les 56 membres du journal
d'organisation reçoivent des noms courants en alternance (`ROSTER_SURNAMES`),
au lieu de « Exemple 01 » à « Exemple 56 » ; la personne ajoutée à chaque prise
de `accessibility-keyboard-display` s'appelle « Clavier … Gruber ». Les adresses
restent sur `example.org`.

Vidéos dont l'image montre un ancien nom, non régénérées dans ce changement (pas
de rendu ici) ; seeds, gardes de fixtures, sélecteurs et scripts sont déjà à jour :

- `privacy-personal-links` : **narration à régénérer (TTS)**, segment `welcome`
  (« deux organisations ont chacune une Léa Müller ») ; narration continue, donc
  toute la piste est à refaire ; image : fiches et listes
  des deux organisations, responsable Camille Rossi, inscription de Jules Hansen ;
- `attendance-check-in` : image seulement (liste de pointage, Jour J, carte de
  Zoé Papadopoulos, « Activité de Léa Müller ») ;
- `event-activity-log` : image seulement (Aline, Nicolas et Léa dans le journal) ;
- `last-minute-changes` : image seulement (inscriptions, membres, Zoé
  Papadopoulos ajoutée à la main) ;
- `organization-activity-log` : image seulement (auteurs Colette Jensen et Samira
  García, « Activité de Aline Martin », invitation d'Alex Ivanov) ;
- `platform-internal-administration` : image seulement (comptes Morgane Korhonen,
  Élodie Nováková, Samira García, Paul Murphy, nouvel espace de Lou Tóth) ;
- `accessibility-keyboard-display` : image seulement (membres et ajout manuel) ;
- `volunteer-confirmation-errors` : image seulement (formulaires d'Aline, Alex,
  Nicolas et Zoé, propriétaire Élodie Nováková).

Non touchées : `data-exports-archives`, `email-delivery-failures`,
`members-duplicates-merge`, `volunteer-hours-certificate` et `event-questions`
avaient déjà des noms réalistes (registres `identity-version-2.json` et
constantes de leurs fixtures) ; leurs seules mentions de « Exemple » sont les
gardes des anciennes bases.

Une base locale préparée avant ce changement : `prepare-day-of --reset-owned` et
`prepare-registration-error-fixture` acceptent encore l'ancien nom pour la remise à
zéro et renomment la fiche ; `prepare-accessibility` (créé une seule fois) demande
une base vidéo remise à zéro. Au prochain rendu, incrémenter `revision` et mettre à
jour `updatedAt` dans `videos/catalog.json` pour chacune de ces huit vidéos.

## Vidéos des fonctions bêta : sources et production (#1168, #1147, #1169, #1174)

Les quatre rendus ont été publiés dans les lots 32 et 33. Chaque rendu utilise
le build vérifié de `origin/main`, avec le seed de son scénario avant chaque prise
(chaque prise modifie sa fixture : secteurs enregistrés, échanges, responsables).


Les quatre scénarios utilisent l'organisation fictive dédiée `formation-beta`
(`scripts/seed-video-beta.ts`), jamais l'organisation de démonstration ; ils ouvrent seulement les
fonctions bêta dont leur vidéo a besoin. La liste des fonctions ouvertes est commune à la
plateforme locale : `scripts/seed-demo.ts` la retire, et désinscrit l'organisation de démonstration,
pour que les autres vidéos ne montrent ni la carte « Fonctions bêta » ni les options bêta.
Les quatre scénarios ont réussi leur répétition `--rehearse --quick-rehearse` sur
un seed neuf. Chaque prise narrée est également précédée d'un nouveau seed. Les prises de `shift-swaps` et de `sector-leaders` attendent les vrais emails dans la boîte
locale (« Échange effectué », nomination du responsable de secteur).

`workload-protection` (protection des pauses et de la charge, #1171) ne fait pas partie de ce lot :
ses sources ont suivi le lot 2 de #1171 ; voir les comptes rendus des lots 33 à 35
plus bas pour les prises, puis la première publication.

### Lot 32 — tentative du 2026-10-29 : build produit bloqué

Les cinq vidéos restent **NOT READY** et ne sont pas publiées. La branche
`video-batch32` cible `origin/main` à `e924abdc35bb03c19a99f1d3126bd06ecc6abc82`.
Le build propre via `build-main-product.ts --commit` compile le JavaScript, puis
Next.js refuse l’export `SWAP_PROPOSALS_PER_DAY` de la route
`src/app/api/public/registrations/[token]/swaps/route.ts:38` : cet export ne fait
pas partie des exports autorisés d’une route. Aucune correction produit n’est
faite, conformément à l’interdiction de modifier `src/` dans ce lot.

Aucun BUILD_ID vérifié, aucune répétition ni prise narrée, aucun nouveau MP4.
Les lignes « sources prêtes, rendu en attente » ci-dessus restent valables.
Catalogue (`published`, dates, révisions) et `videos/renders.json` inchangés.
La révision 6 de SECTOR_LEADERS reste donc à tourner en priorité parmi les vidéos
publiées ; le MP4 en ligne n’a pas été remplacé. PRIVACY_PERSONAL_LINKS reste à
régénérer intégralement avec la même voix et à refilmer.

Préparation : PostgreSQL 45435, SMTP 41032 et Mailpit 48032 dans deux conteneurs
créés pour ce lot ; aucun conteneur existant repris ou arrêté. Le nettoyage des
messages vidéo utilise maintenant `VIDEO_MAILPIT_URL`, au lieu du port historique
codé en dur. Le contrôle de types des outils passe (203 sources), ainsi que les
23 fichiers de tests vidéo (1123 tests), sur le client Prisma généré dans la copie
jetable. Aucun fichier `src/` ni `content/guide/` du checkout n’a été modifié.
Les anciens artefacts ont été archivés ; les preuves versionnées précédentes
sont conservées et leurs rapports sont explicitement remplacés par NOT READY.

La nouvelle narration continue de BETA_ACCESS (Kore, sans balises de pause) est
conservée localement mais **non validée** : l’audit indépendant signale un mauvais
découpage entre `beta-operator` (16,7 % d’écart, fin déplacée/manquante) et
`beta-owner` (15,7 %, début déplacé/manquant). Elle ne doit pas servir à une prise
avant correction des frontières et nouvel audit. Ce défaut s’ajoute au blocage
commun du build ; aucune narration n’est déclarée contrôlée à tort.

### Lot 32 — reprise du 2026-10-29

Le build produit est débloqué sur `9831e86e40ae3dd1ba60eb632b8e90951483a11c`
(origin/main, incluant #1206). BUILD_ID : `jJH5zvJlD2hQBFLXtZa0x`.
Les ports isolés de cette reprise sont 45436 / 41033 / 48033 ; le serveur vérifié
écoute sur 43102. Aucun conteneur tiers ni fichier produit du checkout n'est modifié.

**BETA_ACCESS : READY et publiée** après aperçu puis APPLY=1 sur le contexte default.
Première publication : `published: true`, `added` et `updatedAt` au 2026-10-29,
révision 1 conservée. Narration Kore entièrement régénérée en une passe, sans balises.
Répétition rapide réussie, puis nouveau seed et prise narrée. La passerelle publique
locale évite le refus légitime de l'origine localhost sans modifier le produit.
Durée 126,5 s ; musique 15,4–18,9 LU sous la voix ; musique seule au minimum -34,2 LUFS.
Zéro tutoiement dans l'ASR intégrale et les VTT, aucun anglais parasite ; cinq audits
AV / 16 points, zéro signalement. Images réelles inspectées. Six clics sonorisés.
Contrôle de types (204 sources) et 34 fichiers / 1142 tests vidéo réussis.
Preuves : `videos/evidence/beta-access/batch32/`. `videos/renders.json` inchangé.

**SECTORS : READY et publiée** après aperçu puis APPLY=1 (default), cinq fichiers.
Première publication : `published: true`, `added` et `updatedAt` au 2026-10-29,
révision 1 conservée. Piste Puck entièrement régénérée et découpée sur les silences
du même enregistrement ; onze audits source et onze audits du MP4 final réussis.
Durée 222,280 s ; musique 14,5–19,2 LU sous la voix, minimum sans voix -34,1 LUFS.
ASR intégrale et VTT : zéro tutoiement ; pas de paroles parasites. Onze chapitres AV,
41 points, dix sans signalement et un point de cadrage résolu : la phrase expliquant
le filtre dans l'URL accompagne son résultat et sa persistance après un vrai
rechargement, sans annoncer une action sur la barre d'adresse. Le recorder vérifie
la query réelle et la valeur conservée ; l'image après rechargement montre Parking
et cinq inscriptions actives. Détail : `videos/evidence/sectors/batch32/source-review.json`.
28 clics et 47 frappes réelles sonorisés. Preuves : `videos/evidence/sectors/batch32/`.
Les correctifs des répétitions restent sous vidéos et seeds : Mailpit configurable,
titres de postes sans virgule, dates de confidentialité relatives à la prise,
cadrage du corps réel des emails. Contrôle de types 204 sources et 1142 tests verts.

**SECTOR_LEADERS : READY et publiée**, première parmi les vidéos déjà publiées du lot.
Aperçu puis APPLY=1 (default), cinq fichiers, notification après publication.
Révision 6 préannoncée conservée ; `updatedAt` et le badge `updated` au 2026-10-29.
L'ancien MP4 a été remplacé par le récit qu'annonçait déjà le catalogue.
Durée 296,760 s ; treize audits de narration source et finale réussis, treize
chapitres AV / 48 points sans signalement. Images téléphone et secteur relues.
Musique 13,7–19,1 LU sous la voix, musique seule au minimum -32,9 LUFS ; zéro trou.
36 clics et 152 frappes réelles sonorisés. ASR intégrale et VTT : zéro tutoiement,
pas de paroles parasites. Deux cadrages de vrais corps Mailpit sans en-tête anglais,
disjoints du cadrage téléphone avec refus explicite de tout chevauchement.
Preuves : `videos/evidence/sector-leaders/batch32/`.

SHIFT_SWAPS reste NOT READY à ce stade : la première prise avait un clic d'acceptation
anticipé ; la seule reprise narrée prévue par les règles a échoué dans la dernière
scène sur une référence `event` non définie ajoutée dans le recorder vidéo. Le correctif
utilise l'EVENT_ID explicite et la vraie route du journal a été vérifiée (13 entrées).
Aucune modification produit. Les deux prises sont archivées, jamais publiées.
Une dérogation à « One re-film per video within a batch » a été demandée au propriétaire,
sans supposer sa réponse. Les travaux autorisés sur PRIVACY continuent.


### État final provisoire du lot 32 — dérogations de tournage en attente

**PRIVACY_PERSONAL_LINKS : NOT READY, aucun nouveau MP4 publié.** L'ancien film
reste en ligne ; catalogue `published: true`, révision 4 et dates conservés.
La première prise ne montrait pas réellement le rapport annoncé. Le focus du tab
filmé est restauré après fermeture du popup et le vrai H1/sous-titre du rapport
sont désormais exigés. Un diagnostic enregistré puis la seconde prise montrent
le vrai rapport avant le CSV ; ce point passe la revue AV.
La seconde prise est rejetée pour une dérive de timbre à 22–22,5 s du chapitre
`result`, signalée par l'AV, l'audio final seul et la comparaison source/mix.
Une reconnaissance de la narration seule contredit ces résultats et est également
conservée. La provenance prouve une seule génération continue : la spéculation du
modèle sur un assemblage de voix n'est pas reprise comme un fait.

Toute la narration a été régénérée de nouveau en une passe avec **Kore**, sans
balises de pause et avec une consigne d'identité constante jusqu'à la conclusion.
Les dix nouveaux audits de paroles passent (0–1,7 %, aucune fin/début déplacé), et
le contrôle vocal du fichier entier relève une seule voix constante. Cette nouvelle
piste n'est pas montée sur les images rejetées : elle nécessite une nouvelle prise.
La limite « One re-film per video within a batch » étant atteinte, une dérogation
explicite a été demandée au propriétaire, comme pour SHIFT_SWAPS. Aucune réponse
n'est supposée. Preuves : `videos/evidence/privacy-personal-links/batch32-not-ready/`.

Au stade présent : BETA_ACCESS, SECTORS et SECTOR_LEADERS READY et publiées ;
SHIFT_SWAPS et PRIVACY_PERSONAL_LINKS NOT READY, sources corrigées/préparées,
nouvelle prise bloquée uniquement par la limite de reprise sans dérogation.
Les lignes du bloc « sources prêtes, rendu en attente » sont retirées uniquement
pour les vidéos READY. Aucun `videos/renders.json`, `src/` ou guide modifié.

Vérification de clôture : 204 sources vidéo et 34 fichiers / 1144 tests réussis ;
les 15 fichiers des trois publications ont les mêmes SHA-256 distants et locaux,
et neuf vérifications HTTP (MP4, VTT, JPEG) réussissent. Source produit, guides et
`videos/renders.json` inchangés contre origin/main. Seuls le PID vidéo 8876 et les
deux conteneurs créés pour cette reprise ont été arrêtés ; aucun tiers touché.
Synthèse : `videos/evidence/batch32-resume/summary.json`. Les fichiers antérieurs,
ignorés et non suivis sont conservés, y compris toutes les prises rejetées.

## Sources prêtes, rendu en attente : disponibilités datées côté bénévole (#1146)

Sources ajoutées sans rendu (aucune capture, aucune voix, aucune publication) ; le rendu se fait
depuis un checkout à jour de `origin/main`, avec un seed neuf avant chaque prise (la prise demande
ses disponibilités à Morgane par la vraie route des organisateurs, hors champ, puis enregistre sa
réponse) :

- `volunteer-event-availability` (`VOLUNTEER_EVENT_AVAILABILITY`, nouvelle, `published: false`) :
  sources prêtes, rendu en attente. Seed `scripts/seed-video-scenario.ts volunteer-event-availability`.

Le scénario utilise l'organisation fictive dédiée `formation-disponibilites`
(`scripts/seed-video-volunteer-availability.ts`), jamais l'organisation de démonstration ni celle
des autres vidéos bêta ; la liste bêta globale n'ouvre que `availability`. L'email filmé est celui
que le produit remet au Mailpit local ; son lien est lu par le recorder sans être affiché. Les
phrases lues (date limite, dates, indication de nuit, confirmation, état enregistré) sont vérifiées
d'avance par `videos/lib/__tests__/volunteer-availability-fixture.test.ts`. Vidéo distincte de
`VOLUNTEER_SESSION_AVAILABILITY` (disponibilités habituelles de « Mes inscriptions »), inchangée.
À prévoir avec le lot de rendu : le recadrage de l'email sous les en-têtes de Mailpit (sujet sur
deux lignes : la zone de `SHIFT_SWAPS` laisserait voir les onglets) et un contrôle de fixture pour
`videos/tools/audit-audiovisual.ts`.

## Lot 33 — reprises autorisées du 2026-10-29

Cette reprise remplace les statuts NOT READY historiques de SHIFT_SWAPS et
PRIVACY_PERSONAL_LINKS ci-dessus. Le propriétaire a explicitement autorisé leur
troisième prise, et aucune quatrième n'a été faite. Build produit commun vérifié :
`f8357a76441c78fe64cbf378fd76694a1ab0ef37`, BUILD_ID `hxc0T9m6qdNq_z0QuUTy4`.
Les dépendances du lockfile sont installées dans la copie jetable (Next 16.4.2),
sans modifier les dépendances ou `src/` du worktree. Pile propre sur
45437/41034/48034, serveur local vérifié sur 43102.

- **SHIFT_SWAPS : READY, publiée.** Troisième prise après seed neuf, 208,4 s.
  Onze chapitres et 39 points de contrôle audiovisuels sans signalement ; audits
  des WAV et du MP4 réussis, bande-son complète reconnue sans consigne parasite.
  Musique 15–19,3 LU sous la voix, minimum musique seule −33,6 LUFS, aucun trou.
  Zéro tutoiement du spectateur ; deux citations exactes « Tu cèdes / Tu reçois ».
  Confirmation d'acceptation et journal final vérifiés sur les images réelles.
  Catalogue : `published: true`, `added` et `updatedAt` au 2026-10-29, révision 1.
- **PRIVACY_PERSONAL_LINKS : READY, publiée.** Troisième prise après précontrôles
  réels et seed neuf, master Kore entier du lot 32 revalidé, 365,36 s. Dix
  chapitres et 43 points de contrôle sans signalement, conclusion comprise ;
  audits source/final réussis et voix constante sur le master entier. Le rapport
  de stand réel est visible à copies +6,5 s ; les copies CSV et la page personnelle
  sont vérifiées. Musique 14,8–19,5 LU, minimum seule −33,6 LUFS, aucun trou.
  Zéro tutoiement du spectateur ; une citation « Ton lien personnel ». L'ancien
  MP4 est resté en ligne jusqu'au remplacement READY. Catalogue : révision 5,
  `updatedAt` et `updated` au 2026-10-29, `published: true` conservé. Aucune ligne
  PRIVACY ne figurait dans le bloc des nouvelles sources en attente.

Chaque publication a eu son aperçu puis `APPLY=1` sur le contexte `default`,
cinq fichiers envoyés, suivis de la notification demandée. Les rapports et
images sélectionnés sont conservés dans `videos/evidence/batch33/`. L'écoute
subjective en temps réel est indisponible ; les observations audio/vidéo
assistées et l'inspection des images ne sont pas présentées comme une écoute humaine.


**WORKLOAD_PROTECTION : NOT READY, aucun fichier publié.** Première répétition
sur seed neuf réussie sur les 19 scènes. La première prise narrée a dépassé
la durée du chapitre d'inscription de 1,565 s ; la saisie directe des trois
champs d'identité a corrigé ce dépassement dans l'unique reprise autorisée,
précédée d'une répétition et d'un seed neufs. Cette reprise dure 406,92 s.
La revue finale confirme cependant que la conclusion cadre le milieu de la
carte trop haute (repas/trajets), sans son état activé ni le lien « 1 programme
à revoir » annoncés. La limite d'une reprise est atteinte : aucune troisième
prise ni publication. La ligne des sources en attente et `published: false`,
révision 1, restent en place.

Les signalements audiovisuels sont conservés : choix de règle insuffisamment
visible à l'activation, programme de Sarah montré après son énumération,
cadrage final. Le signalement des valeurs prétendument absentes du chapitre
Limites est contredit par les images réelles : 6 h / 30 min / 8 h au quart du
chapitre, puis 20 h / 3 h à 85 % et à la fin. L'erreur 503 du service pour le
repas a été relancée avec succès. Les corrections de cadrage et de repères
supplémentaires sont préparées sous `videos/`, mais non filmées ou répétées.
Ce sont des défauts de capture ; aucun défaut produit n'a été contourné.

Sur ce rendu **rejeté** : validation technique et 19 ASR source/final réussies,
voix Kore constante sur le master entier, bande-son complète et VTT sans
tutoiement ni consigne parasite, musique 15–19,5 LU sous la voix, minimum seule
−33,6 LUFS, aucun trou. Ces mesures ne le rendent pas publiable. Les sources
narratives sont une nouvelle génération entière Kore, jamais un mélange de
phrases ; le premier master rejeté et toutes les prises sont archivés.

Derniers contrôles du lot : 208 sources typées, 35 fichiers / 1 200 tests vidéo
réussis (dont les repères de phrases). `src/`, `content/guide/` et
`videos/renders.json` inchangés. Synthèse et preuves :
`videos/evidence/batch33/summary.json`. Commits locaux uniquement, sans push
ni fusion. Les fichiers ignorés et non suivis sont conservés.

## Lot 34 — protection de la charge, 2026-10-29

**WORKLOAD_PROTECTION : NOT READY, aucune publication.** Deux répétitions
`--rehearse --quick-rehearse` passent sur seed neuf ; chacune des deux prises
narrées autorisées est aussi précédée d'un seed neuf. La première prise est
rejetée : clic de confirmation à +27,238 s, après la phrase de refus à +24,779 s.
La seconde remplace les quatre animations de clic sur les champs par leur vraie
saisie `fill()`, sans inventer de clic ni de touche. Confirmation à +23,059 s ;
le véritable refus 409 est visible à +24,8 s.

La seconde prise échoue cependant à la revue : dans Inscriptions, seul le
premier des deux créneaux restants de Sarah est visible. Le second reste sous
le cadre durant le chapitre, alors que les deux sont annoncés. L'image finale
confirme ce signalement. Les deux prises sont utilisées : arrêt de la production,
aucune troisième prise, catalogue `published: false`, révision 1, aucune date `added`.
La ligne des sources en attente reste en place. Aucun défaut produit constaté
ni contourné ; la limite restante est un défaut de cadrage du recorder.

Les points du lot 33 sont vérifiés sur ce rendu : titre et état activé avec
« 1 programme à revoir » visibles de +2 s à la fin de la conclusion ; option
« Ne pas appliquer cette règle » cochée et tenue 700 ms ; les trois créneaux de
Sarah sont cadrés durant leur énumération. Les images des limites montrent
6 h / 30 min / 8 h à 25 %, puis 20 h / 3 h à 85 %. Le texte ne prétend pas que
ces valeurs manquent : la narration Kore vérifiée est donc conservée sans
modification ni nouvelle génération. Les signalements automatisés de valeurs
ou d'état final absents sont conservés, mais contredits par ces images ; la
conclusion récapitule le parcours sans promettre de le rejouer.

Rendu rejeté : **406,64 s**, build **4SZGZi_wlBN3PZTL_VMhp**, commit produit
`463644b712c5cde8c7c96549631b0fb5949202a2`. Validation technique réussie,
36 fichiers / 1 203 tests vidéo et 208 sources typées réussis. ASR de la bande-son
entière : zéro tutoiement, zéro dans le VTT, aucune consigne parasite relevée.
Musique 15–19,6 LU sous la voix, minimum seule −33,6 LUFS, aucun trou ; effets
doux sur les interactions réellement enregistrées. Le contrôle ASR final du
chapitre repas/trajets signale une fin omise dans sa reconnaissance : il reste
consigné, sans annoncer une validation de tous les chapitres. Une reconnaissance
indépendante de ce chapitre sur la première prise retrouvait sa fin et le WAV
source vérifié est inchangé. Cela ne résout pas le blocage visuel de la seconde prise.

Preuves et résolution des signalements : `videos/evidence/batch34/summary.json`,
images et rapports adjacents ; rapport complet local dans
`videos/output/workload-protection/review-report.txt`. Écoute subjective en temps
réel indisponible ; inspection des images et contrôles audio/vidéo assistés
effectués. `src/`, `content/guide/` et `videos/renders.json` inchangés.


## Lot 35 — protection des pauses et de la charge (2026-10-30)

**WORKLOAD_PROTECTION : READY, publiée.** Une prise narrée après deux répétitions
rapides réussies, chacune sur seed neuf ; main `aed410c8`, BUILD_ID
`5Oaosk5GvwNjq85Z4bYwR`, durée 406,48 s. Les deux lignes complètes de Sarah sont
centrées, stabilisées et vérifiées dans le viewport ; les images du MP4 à
25/60/85 % les montrent ensemble pendant la narration. La confirmation
d'inscription arrive à +22,927 s, avant la phrase du refus à +24,779 s.

La narration Kore vérifiée reste inchangée. Le signalement ASR de fin
repas/trajets est résolu par une reconnaissance indépendante des sept dernières
secondes du son final : le lien « Choisir les lieux dans Créneaux y ramène »
est entendu en entier. Les deux signalements audiovisuels automatisés restent
conservés : les images montrent les valeurs 6 h / 30 min / 8 h puis 20 h / 3 h ;
la conclusion récapitule le parcours sur la carte activée avec son lien
« 1 programme à revoir », sans promettre de rejouer chaque action.

Validation, 1 244 tests vidéo et 211 sources typées réussis. Musique
14,7–19,7 LU sous la voix, minimum seule −33,6 LUFS, aucun trou ; effets sur
35 clics et 12 touches réels. ASR intégrale multilingue et VTT : zéro tutoiement.
OCR des 57 images : aucun ancien libellé ni adresse locale interdits. Affiches
générées avec un index de métadonnées isolé ; `videos/renders.json` inchangé.
Aperçu puis publication effective des cinq fichiers via le contexte `default`.
Catalogue publié, révision 1, `added` et `updatedAt` au 2026-10-30.

Preuves : `videos/evidence/batch35/workload-protection/`. Écoute subjective
en temps réel indisponible ; revue audio/vidéo assistée et inspection des images
réelles effectuées. Aucun changement produit, aucun push ni merge.


## Lot 35 — proposition d'affectations (2026-10-30)

**ASSIGNMENT_PROPOSALS : READY, publiée.** Deux prises narrées après seed neuf,
chacune précédée d'une répétition rapide réussie sur le build main vérifié
`aed410c8`, BUILD_ID `5Oaosk5GvwNjq85Z4bYwR`. Une génération Kore entière,
recoupée sur des silences mesurés puis reconnue indépendamment ; aucun texte
modifié, aucune voix mélangée.

La première prise est rejetée : ouverture de Léa à +0,564 s et retrait
à +1,348 s, avant la phrase d'action à +2,391 s. Les clics existent, malgré
le signalement automatisé d'absence ; leur avance est corrigée par un repère
de phrase et 600 ms de maintien du vrai dialogue. La seconde et dernière prise
ouvre à +2,862 s et retire à +4,245 s. Les onze revues audiovisuelles du nouveau
MP4 sont sans signalement, dont la correction désormais alignée.

Rendu final : 160,20 s ; onze chapitres et onze ASR finales réussis, validation
et repères de phrase réussis. `ap-lock` tient en 10,322 s pour 10,321 s de voix.
La proposition est affichée en 4,163 s, avec la graine saisie 2026. La preuve
en base confirme le résultat impossible démontré, 29 brouillons actifs, Emma
verrouillée, Lou ajoutée manuellement à la billetterie et Léa retirée vendredi ;
aucune inscription ni notification. La confirmation de publication est annulée.

Musique 14,7–19,2 LU sous la voix, minimum seule −33,7 LUFS, aucun trou ;
21 clics et 7 touches réels avec leurs effets. ASR intégrale multilingue et VTT :
zéro tutoiement, aucune consigne parasite ; OCR des 33 images sans libellé ni
adresse locale interdits. Revue des images réelles des onze chapitres effectuée.
1 244 tests vidéo, 211 sources typées et lint des six fichiers TypeScript modifiés
réussis. L'écoute subjective en temps réel est indisponible, conformément aux
règles du lot. Aucun défaut produit constaté.

Le garde-fou `verify-proposals-review-fixture.ts` autorise la revue des seules
données fictives vérifiées sur la pile dédiée 45439/41036/48036. WORKLOAD a été
filmée avant le seed des propositions. Affiches avec métadonnées isolées,
`videos/renders.json` inchangé. Aperçu puis `APPLY=1`, cinq fichiers publiés sur
le contexte `default`, notification envoyée. Catalogue publié, révision 1,
`added` et `updatedAt` au 2026-10-30 ; ligne des sources en attente retirée.

Preuves finales : `videos/evidence/batch35/assignment-proposals/`. Première prise
rejetée : `videos/evidence/batch35/assignment-proposals-rejected-take1/`,
avec les fichiers lourds locaux archivés. Aucun push ni merge.

## Lot 36 — ASSIGNMENT_PROPOSALS après la refonte des écrans

**ASSIGNMENT_PROPOSALS : READY, republiée, révision 2.** Deux prises narrées,
chacune après seed neuf et répétition rapide réussie, sur le main épinglé
`eed7abaae331f8d15ca9adf3948b105366812fe7`, BUILD_ID `XkyJ_3vtHOL38BaQPtehJ`.
Une nouvelle génération Kore entière, recoupée sur les silences réels puis auditée,
sans mélange de voix. Les PR #1227, #1228 et #1229 sont intégrées au build filmé.

La première prise n'est pas retenue : le six de Noah apparaît trop près de la fin
du chapitre ; l'explication d'Emma, visible en bas d'écran, est centrée pour la
seconde. Les seules corrections de sources sont dans le recorder : repère
« tapons six », maintien de 650 ms après la saisie, attentes après les instructions
de verrouillage, retrait, confirmation et ajout, et centrage de l'explication.
La seconde et dernière prise montre le six dans son chapitre et Emma au centre.

Rendu final : 167,64 s ; onze revues audiovisuelles sans signalement, ASR intégrale
multilingue sans tutoiement ni consigne parasite, VTT sans tutoiement. Les onze ASR
de chapitres sont vérifiées : les signalements du modèle standard sur le lancement
(homophones) et le résultat (nombres écrits en chiffres) sont contre-vérifiés sur
les mêmes octets audio par le modèle indépendant (3,2 % et 0 %). Les rapports
initiaux sont conservés. Un premier appel ASR complet a expiré ; il ne sert pas
de preuve. Les 34 images du MP4 contrôlées par OCR ne portent aucun ancien libellé
ni adresse locale interdits ; les images réelles des onze chapitres sont relues.

Le résultat précède le formulaire, affiche « 29 places couvertes sur 31 »,
« Couverture complète impossible » et « tirage n° 2026 ». Réglages facultatifs
repliés, objectifs initialement vides puis suggestion, ligne « À pourvoir »,
« Proposé », cadenas et confirmation du retrait sont montrés. Calcul affiché
en 4,035 s. `ap-lock` : 12,846 s pour 12,845 s de voix ; `ap-adjust` : 17,455 s
pour 17,453 s. Verrouillage à +7,919 s après l'instruction finie à +7,286 s ;
correction : ouverture +3,029 s, retrait +6,427 s, confirmation +8,144 s,
ajout +13,760 s, après leurs annonces. La confirmation de publication est annulée.

Musique 12,5–19,1 LU sous la voix, aucun trou ; aucune fenêtre de trois secondes
sans voix dans ce rendu. 22 clics et 7 touches réels avec effets synchronisés.
Preuve en base : 29 brouillons, Emma verrouillée, Lou ajoutée manuellement,
Léa retirée de la billetterie du vendredi, aucune inscription ni notification.
1 247 tests vidéo (37 fichiers), 211 sources typées et lint du recorder réussis.
Description : 130 octets audités, sous la limite de 160. L'écoute subjective en
temps réel est indisponible, conformément aux règles. Aucun défaut produit constaté.

Affiches et métadonnées isolées ; `videos/renders.json` inchangé. Aperçu puis
`APPLY=1` sur `default` : cinq fichiers envoyés. Catalogue publié, révision 2,
`updatedAt` et `updated` au 2026-10-31. Preuves :
`videos/evidence/batch36/assignment-proposals/` ; première prise conservée et
non retenue : `videos/evidence/batch36/assignment-proposals-rejected-take1/`.
Aucun changement sous `src/` ou `content/guide/`, aucun push ni merge.
