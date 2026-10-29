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

## Sources prêtes, rendu en attente : vidéos des fonctions bêta (#1168, #1147, #1169, #1174)

Sources ajoutées sans rendu (aucune capture, aucune voix, aucune publication) ; le rendu se fait
depuis un checkout à jour de `origin/main`, avec le seed de chaque scénario avant chaque prise
(chaque prise modifie sa fixture : secteurs enregistrés, échanges, responsables) :

- `beta-access` (`BETA_ACCESS`, nouvelle, `published: false`) : sources prêtes, rendu en attente.
  Seed `scripts/seed-video-scenario.ts beta-access`.
- `sectors` (`SECTORS`, nouvelle, `published: false`) : sources prêtes, rendu en attente.
  Seed `scripts/seed-video-scenario.ts sectors`.
- `sector-leaders` (`SECTOR_LEADERS`, mise à jour, révision 6) : sources prêtes, rendu en attente.
  Narration modifiée (`welcome`) et deux scènes ajoutées (`leaders-sector-scope`,
  `leaders-sector-roster`) : toute la piste continue est à régénérer. Seed : démo, puis
  `scripts/seed-video-scenario.ts sector-leaders` (`videos/tools/build.ts` enchaîne les deux).
  La vidéo publiée garde l'ancien rendu jusqu'à la régénération : titre, bloc `viewer` et
  transcription de la page de la vidéo décrivent déjà la nouvelle version.
- `shift-swaps` (`SHIFT_SWAPS`, nouvelle, `published: false`) : sources prêtes, rendu en attente.
  Seed `scripts/seed-video-scenario.ts shift-swaps`.

Les quatre scénarios utilisent l'organisation fictive dédiée `formation-beta`
(`scripts/seed-video-beta.ts`), jamais l'organisation de démonstration ; ils ouvrent seulement les
fonctions bêta dont leur vidéo a besoin. La liste des fonctions ouvertes est commune à la
plateforme locale : `scripts/seed-demo.ts` la retire, et désinscrit l'organisation de démonstration,
pour que les autres vidéos ne montrent ni la carte « Fonctions bêta » ni les options bêta.
Le recorder (`videos/lib/record-beta-features.ts`) n'a pas encore été répété sur la pile locale :
une répétition `--rehearse --quick-rehearse` (après un seed neuf) est à faire avant la prise
narrée. Les prises de `shift-swaps` et de `sector-leaders` attendent les vrais emails dans la boîte
locale (« Échange effectué », nomination du responsable de secteur).

`workload-protection` (protection des pauses et de la charge, #1171) ne fait pas partie de ce lot :
son lot 2 (repas, trajets, journée OFF, limites individuelles) est encore en cours. Sa vidéo suivra
après le lot 2 de #1171.

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
