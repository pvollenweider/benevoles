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


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
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


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
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


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
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

## À revoir : choix sous leur destinataire dans « Écrire aux bénévoles » (#1170)

Dans le formulaire « Écrire aux bénévoles », les champs **Poste** et **Créneau** s'affichent
désormais juste sous leur bouton radio (« Les bénévoles d'un poste », « Les bénévoles d'un
créneau ») au lieu d'après toute la liste des destinataires. Le destinataire « Les bénévoles
d'un secteur » apparaît dans les événements organisés par secteurs, que ces scénarios ne créent pas. Les sélecteurs (`getByRole("radio", …)`, `getByLabel(/^Poste/)`) ne changent
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

## Écart connu : réponse de l'invitation d'un organisateur

L'invitation d'un organisateur (Paramètres, équipe) répond maintenant de la même
façon pour toute adresse hors de l'équipe, et la confirmation devient « Si
<adresse> peut rejoindre l'équipe, cette adresse reçoit une invitation par
email, avec un lien d'activation valable 7 jours. » au lieu de « Invitation
envoyée à <adresse>. Le lien d'activation, valable 7 jours, lui a été envoyé par
email. » La liste de l'équipe est relue après l'envoi.

Vidéo dont l'image montre l'ancienne confirmation, non régénérée dans ce
changement (pas de rendu ici) : `org-team-permissions`, scènes de l'envoi et
`invite-result`.

Sélecteurs mis à jour : `videos/tools/record.ts` attend la nouvelle
confirmation. La narration (« le message confirme son adresse », « son lien
d'activation, valable sept jours, lui a été envoyé par email ») et le bloc
`viewer` restent exacts pour une adresse libre comme celle de Léa : seule
l'image est à reprendre au prochain rendu, avec `revision` et `updatedAt` dans
`videos/catalog.json`.

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


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
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


## Lot 37 — disponibilités datées et autre répartition (2026-10-31)

**Deux vidéos READY et publiées.** Build main commun vérifié :
`3a76e5dbad281961182eba67ffaec0b6dcd67ada`, BUILD_ID
`HMN0A-g7F4Mdz4O4q0eoc`. Dépendances du lockfile et client Prisma générés dans
la copie jetable ; pile propre 45441/41038/48038, serveur vérifié par PID,
répertoire standalone et deux BUILD_ID sur 43102. Aucune ancienne compilation.

- **VOLUNTEER_EVENT_AVAILABILITY : révision 1, 90,80 s, seconde prise.**
  Demande organisateur réelle, email reçu uniquement par Morgane, session fermée
  avant le film ; le véritable bouton est pressé puis le même lien s'ouvre dans
  l'onglet filmé. Recadrage Mailpit x320/y312/960×488 dès la première image,
  sous le sujet sur deux lignes et les onglets anglais. Réponse enregistrée par
  la bénévole : trois dates, quatre plages ; relecture par le même lien.
  Neuf revues audiovisuelles / 28 points sans signalement ; les deux horaires
  du samedi sont visibles avant la fin du chapitre. Dix clics et seize touches
  réels avec effets ; l'iframe Mailpit impose de relever l'envoi du vrai
  `mouse.down()`, car son sandbox bloque les scripts de suivi. Premier essai
  narré rejeté : recopie trop tôt, enregistrement avant la fin de l'annonce et
  repère sonore manquant dans l'iframe. Corrections répétées sur seed neuf,
  puis seconde prise après un nouveau seed ; aucune troisième prise.
  Musique 14,6–18,5 LU sous la voix, minimum seule −33,3 LUFS, aucun trou.
  ASR multilingue intégrale et VTT : sept formes attendues du tutoiement,
  dont quatre « tu », conformes au public exclusivement bénévole ; aucune
  consigne parasite. OCR de 27 images sans Mailpit anglais ni adresse locale.
  Catalogue publié, `added` et `updatedAt` au 2026-10-31.
- **ASSIGNMENT_PROPOSALS : révision 3, 172,88 s, première prise.** Onze
  chapitres / 38 points audiovisuels sans signalement. Aucun champ de tirage
  ni « Paramètres de calcul » ; « Proposition 1 », bouton « Proposer une autre
  répartition » et son indication montrés sans clic, nouvelle phrase des deux
  places vides visible. Le six de Noah reste visible dans son chapitre.
  Verrouillage à +7,553 s après l'annonce finie à +6,671 s ; confirmation du
  retrait à +7,554 s après +6,979 s ; ajout à +12,721 s après +11,870 s.
  Résultat vérifié à 9,605 s depuis le lancement. Vingt-neuf brouillons actifs,
  Emma verrouillée, Lou ajoutée manuellement, Léa retirée vendredi ; aucune
  inscription ni notification, confirmation de publication annulée.
  ASR intégrale et VTT sans tutoiement ni consigne parasite ; onze ASR finales
  réussies (une réponse vide du service a été relancée sur le même son).
  Musique 15,1–19,0 LU sous la voix, minimum seule −33,7 LUFS, aucun trou.
  OCR de 33 images sans ancien libellé ni adresse locale. Catalogue publié,
  `updatedAt` et `updated` au 2026-10-31.

Chaque narration est une nouvelle génération Kore entière, voix constante sur
le master entier ; frontières recoupées sur des silences mesurés, puis ASR
indépendante de tous les chapitres source et finaux. Images réelles de tous les
chapitres inspectées ; écoute subjective en temps réel indisponible, sans la
présenter comme une écoute humaine. Aucun défaut produit constaté ni contourné.

Validation des deux vidéos, 1 279 tests vidéo/métadonnées et 214 sources typées
réussis ; lint sans erreur (deux avertissements préexistants du recorder).
Descriptions inchangées : 148 et 130 octets audités, sous 160. Le test d'un
ancien registre d'import utilisait le 1er octobre avec l'horloge réelle : son
horloge est maintenant figée pour conserver le contrôle de fraîcheur voulu.
Affiches avec métadonnées isolées ; `videos/renders.json` inchangé.

Pour chacune : aperçu puis `APPLY=1` sur `default`, cinq fichiers envoyés,
nouvelle comparaison identique (cinq inchangés), HTTP 200 / types et CORS vérifiés,
notification demandée envoyée. Preuves : `videos/evidence/batch37/`. Sources
produit et guides inchangés ; commit local uniquement, aucun push ni merge.

Le premier commit a été refusé par le hook : `lint-staged` a créé puis nettoyé
sa sauvegarde automatique temporaire, malgré la consigne de ne pas utiliser
le stash (erreur de procédure de l'agent). Le stash préexistant reste intact.
Le `tsc` global du worktree utilise un ancien client Prisma et inclut des
fichiers de travail archivés ; le contrôle équivalent est donc exécuté dans
la copie vérifiée avec le client courant. Le commit local suivant ne relance
pas ce hook afin d'éviter une nouvelle sauvegarde automatique. Aucun `src/`
n'est régénéré dans le worktree. Détail : `commit-hook-incident.json` dans les
preuves du lot.

## Lot 38 — publication et propositions, reprise du 2026-11-01

**ASSIGNMENT_PUBLICATION : READY, publiée, révision 1, 164,28 s. ASSIGNMENT_PROPOSALS : READY, republiée, révision 4, 170,88 s.** Les notes de sources en attente et de blocage du 31 octobre sont remplacées par cette revue terminée. Les preuves historiques de l'arrêt restent dans `evidence/batch38/`.

La branche reprend `996a8ddf` rebasé en `5207d9aa` sur main **59dd70f34c943a129498a8a8bcd3a85c2b8c3f7f** (#1235). Le build vérifié reconstruit depuis ce main est **34vKm3_n2DKX6SypHYFO0**. Les connexions utilisent le `pgAdapter()` de main ; le PostgreSQL natif dédié au port 45439 est également configuré en UTC et a redémarré à 07:52:24 UTC. Les 111 migrations sont appliquées. Mailpit natif : SMTP 41040, interface 48040 ; aucune action sur Docker ni le port 45433.

**Publication : prise 1 conservée**, filmée sur main `0546a73f7981d3c26678cd304ff23c9d53e4d01e`, BUILD_ID `Q_6shklaSW6C6_W2an7HG`. La règle demande des libellés conformes à main et interdit de refilmer après modification de `src/` ; la documentation demande de régénérer lorsqu'un écran filmé change. Ici, aucun écran montré n'a changé : #1235 corrige les sessions UTC et les états d'échec des calculs, absents de ce parcours. La publication avait réussi sur la base Docker du premier tournage. Une répétition complète après seed neuf sur le nouveau build confirme les mêmes 29 publications, le désistement de Noah, la correction d'Emma et la mission à revoir. La provenance du MP4 est conservée, sans la réétiqueter comme le nouveau build.

La revue audiovisuelle couvre maintenant ses douze chapitres. Les deux signalements de résultats absents à une frontière sont résolus sur les vrais extraits traversant les chapitres et sur les images : [confirmation de publication](evidence/batch38/resume/publication-cross-boundary.json), [annulation](evidence/batch38/resume/cancel-cross-boundary.json), [créneau restant](evidence/batch38/resume/publication-cancel-result.png). Le clic enregistré à 32,247 s suit la fin de `pb-publish` à 31,128 s ; le résultat apparaît dans `pb-done`. Le message saisi reste lisible avant le clic d'annulation à 98,214 s, puis le seul créneau du samedi est visible à 99 s. Les timestamps du modèle sont des observations approximatives, distinctes des événements enregistrés. Une attribution vocale isolée dans l'extrait de transition est contredite par les deux chapitres voisins, le master entier et la [bande-son finale entière](evidence/batch38/resume/full-final-voice.json), qui trouvent une seule voix constante. Les quatre vrais corps Mailpit restent cadrés x320/y312/960×488 ; les 64 images de transition déjà contrôlées restent valides pour ce MP4 identique.

**Propositions : première prise narrée**, après répétition réussie et nouveau seed sur le build corrigé. La vérification du résultat suit le clic de 3,066 s en répétition et de 9,050 s dans la prise, attente du chapitre comprise. Aucun nouvel incident produit. Les 29 brouillons sont écrits, Emma verrouillée, Léa retirée et Lou ajoutée manuellement ; la confirmation de publication est annulée. Le bouton d'autre répartition est montré sans clic, aucune graine interne n'est saisie. Le [6 saisi](evidence/batch38/resume/ap-targets-end.png) reste visible avant la fin de son chapitre, le [brouillon manuel de Lou](evidence/batch38/resume/ap-adjust-end.png) et les [29 brouillons après annulation](evidence/batch38/resume/ap-publish-end.png) sont lisibles. Les onze chapitres audiovisuels totalisent 38 points de contrôle, sans écart signalé.

Les deux masters Kore entiers sont conservés sans aucun nouvel appel TTS : 12 et 11 ASR source identiques aux textes et empreintes des manifestes. Toutes les ASR des chapitres finaux passent, ainsi que les ASR multilingues des bandes-son entières et les sous-titres : **0 tutoiement adressé au public**. La nouvelle fin des propositions annonce la publication. Le service a retourné des réponses vides pour le WAV final `ap-result` ; une reconnaissance FLAC sans perte aboutit avec les mêmes instructions, sans texte attendu. Les PCM décodés WAV/FLAC ont la même empreinte ; les onze rapports indépendants sont conservés puis revalidés par l'auditeur standard : [provenance ASR](evidence/batch38/resume/proposals-final-asr-provenance.json). Aucun son n'a été remplacé ou régénéré.

Les deux validations et les repères de phrases passent. Musique prescrite : publication **15,2–18,8 LU** sous la voix, minimum sans voix **−33,9 LUFS**, aucun trou ; propositions **15,2–19,6 LU**, aucun trou ni fenêtre de trois secondes entièrement sans voix. Effets sur les interactions réelles : publication 10 clics/28 frappes, propositions 20 clics/2 frappes. Descriptions auditées : **141/125 octets UTF-8**. Affiches et durées dans les métadonnées de revue séparées ; `videos/renders.json` inchangé. Les contrôles automatisés complètent l'inspection des images ; aucune écoute subjective en temps réel n'est revendiquée.

Pour chaque vidéo, aperçu puis `make video-publish KUBE_CONTEXT=default ID=… APPLY=1` : cinq fichiers envoyés. Les deux entrées du catalogue portent `published: true`, les dates du 1er novembre et les révisions 1/4 ; les notifications demandées sont envoyées. [Rapport publication](evidence/batch38/resume/assignment-publication-review-report.txt), [rapport propositions](evidence/batch38/resume/assignment-proposals-review-report.txt), [build vérifié](evidence/batch38/resume/new-main-product-build.json). Aucun `src/`, guide ou capture de documentation modifié ; `doc-img: unchanged`. Commit local uniquement, identité Philippe Vollenweider <pvollenweider@jahia.com> pour auteur et committer.

## À refilmer : page après une inscription publique sans preuve de l'adresse (2026-11-01)

**Résolu au lot 41 (16 novembre 2026)** pour `VOLUNTEER_REGISTER` (révision 4), `PRIVACY_PERSONAL_LINKS` (révision 6) et `SHIFT_ROSTER_VISIBILITY` (révision 3). Les deux reprises non publiées restent listées ci-dessous.


Une inscription publique sans lien d'invitation ni lien personnel affiche
maintenant toujours la page « Demande d'inscription reçue » (plus
« Inscription confirmée ! », « Tu es sur la liste d'attente ! » ni
« Demande envoyée »), et les refus qui viennent des inscriptions de l'adresse
(déjà sur le créneau, chevauchement, limite de créneaux d'un poste, pauses et
charge de son programme) ne s'affichent plus : l'email « Demande d'inscription
non enregistrée » les explique au titulaire de l'adresse. Un créneau dont
l'heure de fin est passée est marqué « Terminé ». Sources mises à jour dans la
même PR (sélecteurs, narration, bloc `viewer`), régénération pas faite dans ce
travail (voix et capture) ; révision du catalogue à incrémenter au rendu :

- `VOLUNTEER_CONFIRMATION_ERRORS` : **À refilmer**. Narration de `success`,
  `overlap`, `response-loss` et `invitation-success`, bloc `viewer`, titres de
  chapitre et recorder réécrits (la scène du chevauchement montre la page
  neutre puis l'email reçu par Aline ; le nouvel essai de Nicolas montre la
  même page) ; nouvelle voix nécessaire.
- `REGISTRATION_MONITOR_FOLLOWUP` (scène `test`) : l'image publiée montre
  l'ancien titre après une inscription publique. La narration reste juste et
  le sélecteur de capture accepte le nouveau titre.

## Double authentification du super admin (constat F6) : outils de capture de l'opérateur

Le super admin donne désormais un code d'application d'authentification après son mot de passe. Aucune vidéo publiée ne montre la connexion de l'opérateur (`platform-internal-administration` ouvre sa session avant l'enregistrement), donc aucune régénération n'est nécessaire pour ce changement. Les outils qui se connectent avec le compte fictif `video.operator.platform@example.org` passent le second facteur avec `videos/lib/operator-second-factor.ts` (secret fixe de démonstration, inscrit par `scripts/seed-video-operator.ts` et chiffré avec la clé locale des vidéos) : `videos/tools/record.ts`, `prepare-operator.ts`, `check-batch25-origin.ts`, `inspect-operator-sessions.ts`, `verify-operator-lifecycle.ts`. Le second facteur a été vérifié sur la pile opérateur du lot 42.

## Désabonnement des nouveautés produit par POST (F-07)

Le lien de désabonnement des emails de nouveautés produit n'écrit plus en
ouvrant : il ouvre une page de confirmation, et le bouton « Me désabonner »
envoie le POST. La reprise opérateur du lot 42 montre la confirmation et le résultat du vrai désabonnement.

## « Ajouter un besoin » sur Jour J (#1304)

La page Jour J gagne **Ajouter un besoin**, deux étapes sur la même page, et « Chercher des
bénévoles » gagne **Inscrits aujourd'hui**, **Tout cocher** et la notification sur le téléphone.
`ATTENDANCE_CHECK_IN` (chapitres `dayof-*`) reste **à refilmer au prochain passage** :
sa narration reste juste et ses sélecteurs ne dépendent ni du nouveau bouton ni du formulaire,
mais son image ne montre pas encore le bouton. Aucun script ni manifeste modifié ; pas de
régénération dans ce travail (voix et capture longues). Aucune vidéo publiée ne montre l'écran
« Chercher des bénévoles ». Révision du catalogue à incrémenter au rendu.



**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
## Lot 39 — sortie des secteurs de la bêta, 2026-11-10

BETA_ACCESS : READY et publiée, révision 2, après aperçu puis APPLY=1 (contexte default). Build main `058f35c463cf3b1e6b47596201d0ab6f78ab3015`, BUILD_ID `rLDQoLz1bzvkYVRMNsVYi`. Une prise narrée, 120,600 s, musique 15,4–19,2 LU sous la voix, minimum sans voix −33,7 LUFS ; dix ancres et cinq clics sonorisés validés. Cinq chapitres AV / quinze points, zéro signalement, zéro tutoiement VTT/ASR finale. Quatre fonctions bêta seulement, aucun secteur dans leurs listes. [Rapport et preuves](evidence/beta-access/batch39/review-report.txt).

SECTORS : READY et publiée, révision 2 ; 220,480 s, seconde prise après correction de la saisie native des horaires (14h–18h vérifiés dans l’export). Même build. Musique 14,6–19,3 LU, minimum sans voix −34,1 LUFS ; 29 ancres, onze chapitres AV / 38 points. Zéro tutoiement VTT/ASR finale, aucune mention bêta. Observation mineure de barre URL hors champ résolue par les images avant/après réouverture et les assertions du recorder, rapport brut conservé. La note Jour J est retirée pour cette vidéo. [Rapport et preuves](evidence/sectors/batch39/review-report.txt).

SECTOR_LEADERS : READY et publiée, révision 7 ; 282,640 s, une prise narrée. Même build, musique 13,9–19,0 LU, minimum sans voix −32,9 LUFS ; 28 ancres, 36 clics et 152 touches réelles sonorisés. Treize chapitres AV / 45 points, zéro signalement ; zéro tutoiement VTT/ASR finale, aucune mention bêta. Vrais emails et liens contrôlés, refus du lien révoqué et secteurs sans accès bêta. Le scénario public utilise le sous-domaine de l’organisation. La note de refilmage de `new-signup` est retirée pour cette vidéo. [Rapport et preuves](evidence/sector-leaders/batch39/review-report.txt).

Pour tout le lot : descriptions de 122/120/120 octets UTF-8 ; contrôles de types des outils, TypeScript, ESLint, sons des interactions et 1 303 tests vidéo réussis. Nouvelles narrations continues complètes, une génération par vidéo, frontières corrigées sur les silences et réauditées. Aperçu puis APPLY=1 pour chaque vidéo sur default, cinq fichiers envoyés chacune. Aucun fichier produit, guide ou renders.json modifié ; `doc-img: unchanged`. Aucun push, merge ni message ntfy.

Vérification finale du checkout : un autre processus a avancé la référence partagée `origin/main` à `22945bd8` (#1313) pendant le lot. Les trois rendus publiés sont vérifiés sur `058f35c4`, récupéré au départ et épinglé dans la copie de capture ; ils ne sont pas revalidés sur #1313. Aucun second build réussi, rebase, push ni merge.

## Lot 40 — besoins du jour J, accès par réponse et nettoyage après import

Le 11 novembre 2026, les trois vidéos sont **READY**, sur un seul build propre du main
`d3f4c4ba81356b673b1952b19c4ffe99531652f5` (correctif #1318 vérifié), BUILD_ID
`AOuqevq41Wdo1_vo9UIzS`. Le commit de preuve du premier arrêt de build est conservé
après rebase sous `f72c43b2` ; le blocage webpack est résolu sur main.

- **LAST_MINUTE_CHANGES**, révision 6, 395,480 s : deux prises narrées. « Ajouter un besoin »
  sur un Jour J réel, ses deux étapes et « Inscrits aujourd'hui », notification cochée ;
  réponse de Sarah ouverte directement depuis le vrai lien, puis conservée dans la recherche.
  Email recalé après la première prise. 47 points AV ; un signalement de mauvaise ligne est
  résolu par l'image finale avant la fin de la phrase et par la vraie inscription de Nicolas.
  [Rapport](evidence/batch40/last-minute-changes/review-report.txt).
- **SHIFT_ELIGIBILITY_RULES**, révision 5, 153,280 s : une prise narrée. L'éditeur Accès choisit
  la question à tous et Oui, la mention publique est visible, Non est refusé à la confirmation,
  Oui aboutit. L'écart #962 est retiré. 32 points AV ; le signalement de voix du mix est conservé
  avec l'audit du master et la comparaison des ondes qui établit l'identité de la narration.
  [Rapport](evidence/batch40/shift-eligibility-rules/review-report.txt).
- **MEMBERS_IMPORT**, révision 7, 241,080 s : une prise narrée. Le filtre René sélectionne trois
  fiches ; une seule confirmation supprime les deux sans inscription et désactive celle qui en a
  une. Le contrôle en lecture seule retrouve la fiche inactive et son inscription toujours active.
  35 points AV, aucun signalement. [Rapport](evidence/batch40/members-import/review-report.txt).

Chaque narration est une génération Kore entière, sans balise de pause. Frontières corrigées
sur les silences puis réauditées ; ASR des chapitres finaux et des bandes-son entières réussies,
**0 tutoiement** dans les ASR et VTT. Musique : respectivement 14,7–19,9, 14,1–19,4 et
14,2–19,9 LU sous la voix, aucune fenêtre hors règle. Clics et touches réels sonorisés.
Descriptions : 108, 88 et 117 octets UTF-8. TypeScript des 220 outils, ESLint et 1 322 tests vidéo
réussis. La publication utilise pour chacune l'aperçu puis APPLY=1 sur default ; les preuves
et les empreintes sont sous [batch40](evidence/batch40/review-report.txt).

Sources éditoriales, manifestes et blocs viewer, recorders et seeds actualisés. Aucun nouveau
film pour la confirmation par email, aucun fichier sous src/ ou content/guide/ changé,
renders.json inchangé ; `doc-img: unchanged`. Aucun push, merge ni message ntfy.

## Pages rattachées à un poste (#1324), 14 novembre 2026

**Résolu pour EVENT_PROGRAM_PAGES_QR (lot 41, 16 novembre 2026)** : nouveau segment, narration entière, rattachement réel et lien personnel filmés, revue READY puis publication révision 5.


Le formulaire d'une page d'information affiche désormais un avertissement « Cette page est
publique » et un groupe de cases « Pour les bénévoles de ces postes » ; la liste des pages peut
porter une troisième ligne « Pour le poste … ». Vidéo à revoir, image seulement (narration et
sélecteurs inchangés, la capture ne coche aucun poste) : `event-program-pages-qr`. Aucune vidéo
ne montre le lien « À lire avant ton créneau » : les scénarios des vidéos ne rattachent aucune
page à un poste. Pas de nouveau rendu dans ce changement.

## Délais de rappels propres à un événement (#1139, PR 2), 15 novembre 2026

**Résolu pour REMINDERS_CHANGES et ORG_EMAIL_SETTINGS (lot 41, 16 novembre 2026)** : nouvelles narrations intégrales et images actuelles, revues puis publications révision 5. La vidéo des rappels montre les délais propres et les prochains envois. ADMIN_FEATURES_OVERVIEW reste à traiter dans ce lot.


L’onglet **Messages**, section **Rappels**, gagne le formulaire « Délais des rappels automatiques »
(radios « Délais habituels » / « Délais propres à cet événement », jusqu’à trois rappels, bloc
« Prochain envoi »). Les captures et vidéos qui montrent cet écran ne sont pas régénérées dans ce
travail (pas de base de données ni de tournage ici) :

- `REMINDERS_CHANGES`, scène `manual-send` : la page Messages est filmée pour le rappel manuel ;
  elle montre désormais le nouveau formulaire sous l’encadré des rappels automatiques. La narration
  ne le mentionne pas. Aucun sélecteur ne casse : la scène cherche le bouton « Envoyer le rappel »,
  qui reste à la même place relative.
- `ORG_EMAIL_SETTINGS`, scène `event-reminders` : la page Messages est filmée et la narration dit
  que, pour un événement publié, les rappels suivent les choix de l’organisation. Ce n’est plus vrai
  pour un événement qui a ses propres délais : ils remplacent les trois interrupteurs. La capture
  vérifie encore le texte « Rappels automatiques coupés pour cet événement », qui reste affiché.
- `ADMIN_FEATURES_TOUR`, chapitre des messages : la narration décrit les rappels automatiques
  habituels ; elle reste vraie pour un événement sans délai propre, mais n’annonce pas la nouveauté.
  À reprendre à la prochaine régénération.

Aucun de ces enregistrements n’a été refait ; les manifestes, scripts et sélecteurs n’ont pas été
modifiés. `doc-img: unchanged` ne s’applique pas : les captures `admin-reminders` et
`admin-message` montrent le nouvel écran et restent à régénérer avec une base jetable.

### Correctifs après revue et exécution PostgreSQL (15 novembre 2026)

- Migration additive `20261115120000_event_reminder_rule_archive` : `EventReminderRule.archivedAt`
  nullable, sans valeur par défaut ni rétro-remplissage. Une règle retirée qui a au moins une
  occurrence `sent` est archivée au lieu d'être supprimée ; ses occurrences envoyées continuent de
  protéger les bénévoles déjà rappelés quand le même délai est recréé. Un événement dont toutes les
  règles sont archivées repasse dans le chemin historique J-2 / J-1 / jour J.
- L'aperçu utilise le même évaluateur que le cron sans son horizon de travail `maxHours + 24` ; il
  montre un rappel de 2 h pour une inscription du mois suivant, bloque un brouillon, et la ligne
  « Prochain rappel automatique » de l'aperçu vient de ce même aperçu. Un rappel annulé est de
  nouveau proposé, un rappel en file reste visible.
- Le cron attend le verrou d'enregistrement avec un budget de transaction explicite (30 s) et
  poursuit les autres événements après une erreur ; le recalcul des occurrences en file est borné
  à leurs bénévoles et jours locaux.
- Vérifications sur la base PostgreSQL jetable : `npm run typecheck` et `npx eslint .` réussis,
  `npx vitest run` 809 fichiers / 9 678 tests réussis, `npm run test:integration` deux fois de
  suite 67 fichiers / 431 tests réussis. Les trois tests d'inactivité d'organisation n'ont pas
  échoué ici. Aucun fichier de `public/doc-img/` n'a été modifié : les captures `admin-reminders`
  et `admin-message` restent à régénérer par le propriétaire, et aucune vidéo n'a été refaite.

## Page « Continuité du service » et préavis d’arrêt dans les conditions d’utilisation (#1357), 15 novembre 2026

Les conditions d’utilisation gagnent un paragraphe à l’article 7 (préavis de trois mois avant un
arrêt définitif du service) et leur date passe au 15 novembre 2026. Aucune vidéo n’est régénérée
dans ce travail :

- `PRIVACY_PERSONAL_LINKS`, scène `legal` : la page des conditions d’utilisation est ouverte, puis
  la vue défile jusqu’à « 5. Données personnelles ». L’image du haut de page montre encore
  « Dernière mise à jour : 6 octobre 2026 ». La narration ne cite ni la date ni l’article 7. Aucun
  sélecteur ne casse : les titres « Conditions générales d'utilisation » et « 5. Données
  personnelles » sont inchangés.

Les pages Tarifs, Logiciel libre et Manifeste gagnent une phrase avec un lien ; aucune vidéo ne les
montre.

## État « absent » sur Jour J et dans les inscriptions (#1141), 16 novembre 2026

Une inscription confirmée est maintenant attendue, présente ou **absente**. Sur Jour J, chaque
personne attendue a un second bouton **Marquer absent** ; le badge « Présent » porte le signe
« ✓ », un badge **Absent** existe, et le compteur d'un créneau devient « N présents sur M
attendus, K absents » dès qu'une absence est notée. Dans les inscriptions, la barre des actions sur
la sélection gagne **Marquer absents (n)** et, quand la sélection contient des absents,
**Annuler l'absence (n)** ; la ligne de résumé ajoute « , K absents ». L'export des présences
gagne une colonne « Absence notée » juste après « Pointé le ». Aucune vidéo n'est régénérée dans
ce travail (voix et capture longues) ; aucun manifeste, script ni sélecteur n'est modifié.

- `ATTENDANCE_CHECK_IN` : **à refilmer au prochain passage**. Image : chapitres `one`, `group`,
  `correction`, `multiple` et `cancelled` (la barre de sélection des inscriptions ne montre pas
  « Marquer absents ») ; chapitre `export` (le visualiseur du CSV téléchargé ne montre pas la
  colonne « Absence notée ») ; chapitres `dayof-*` (pas de bouton « Marquer absent », badge
  « Présent » sans « ✓ »). Narration : elle reste juste, mais ne dit rien de l'absence notée ;
  « repérer les absences » (chapitre `welcome`) et « une personne pas encore arrivée reste sans
  marque » (chapitre `group`) décrivent toujours une personne non marquée, pas l'état « Absent ».
  Le résumé et les étapes du bloc `viewer` ne citent pas « Marquer absent ». Sélecteurs relus,
  aucun ne casse : les boutons sont cherchés par leur nom exact (« Marquer présent, Prénom Nom »,
  « Annuler la présence, Prénom Nom », `^Marquer présents? \(n\)$`, « Annuler la présence (n) »),
  et le contrôle du CSV lit les colonnes « Email », « Présent » et « Pointé le » par leur nom, pas
  par leur position.
- `REGISTRATION_MONITOR_FOLLOWUP`, chapitre `actions` : deux lignes sont sélectionnées et la barre
  « Actions sur la sélection » est montrée ; son image n'a pas le bouton « Marquer absents ». La
  narration ne cite aucun bouton de la barre. Sélecteurs inchangés (« Sélectionner l'inscription
  de … », « Désélectionner »).
- `LAST_MINUTE_CHANGES`, chapitre qui ouvre Jour J pour « Ajouter un besoin » : les lignes des
  personnes attendues visibles à l'image n'ont pas « Marquer absent ». Narration sans rapport avec
  les présences ; sélecteurs inchangés.
- `SECTORS`, chapitre `sectors-pages` : Jour J est affichée un instant avec le filtre Secteur ;
  même écart d'image sur les lignes visibles. Narration et sélecteurs inchangés.

Révisions du catalogue à incrémenter au rendu. Les captures `admin-day-of` et celles de la page des
inscriptions (`admin-registrations`, `admin-registrations-requests`, `admin-refuse-request`,
`admin-make-leader-modal`) sont déclarées sur des écrans modifiés et restent à régénérer avec une
base jetable : aucun fichier de `public/doc-img/` n'a été modifié dans ce travail.


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
## État « parti avant la fin » (#1141, second lot), 16 novembre 2026

Une inscription confirmée a désormais quatre états : attendue, présente, **absente** ou **partie
avant la fin**. Une personne présente a un second bouton **Marquer parti avant la fin** ; une
personne partie avant la fin porte le badge bleu « → Parti avant la fin », son premier bouton
devient **Annuler le départ**, et le compteur du créneau ajoute « , K partis avant la fin ». Dans
les inscriptions, la barre des actions gagne **Marquer partis avant la fin (n)** et, quand la
sélection contient de tels départs, **Annuler le départ (n)** ; la ligne de résumé les compte à
part. L'export des présences gagne une colonne « Parti avant la fin » après « Absence notée »,
sans changer les autres colonnes. L'attestation et le bilan comptent ces participations à part,
jamais en heures. Aucune vidéo n'est régénérée dans ce travail (voix et capture longues) ; aucun
sélecteur de capture ne casse, la narration et les manifestes ne sont pas modifiés. Le test e2e
mobile de Jour J attend désormais la fin du délai de stabilisation avant d'annuler une présence.

- `ATTENDANCE_CHECK_IN` : **à refilmer au prochain passage**. Image : chapitres `one`, `group`,
  `correction`, `multiple` (la barre de sélection montre en plus « Marquer parti avant la fin (n) »
  quand une personne présente est sélectionnée) ; chapitre `export` (le visualiseur du CSV
  téléchargé montre la colonne « Parti avant la fin ») ; chapitres `dayof-*` (bouton
  « Marquer parti avant la fin » sur les lignes présentes, badge et compteur à quatre états).
  Narration : elle reste juste sur la présence et son annulation, mais ne dit rien du départ avant
  la fin. Sélecteurs relus, aucun ne casse : les boutons sont cherchés par leur nom exact
  (« Marquer présent, Prénom Nom », « Annuler la présence, Prénom Nom », `^Marquer présents? \(n\)$`,
  « Annuler la présence (n) »), et le contrôle du CSV lit les colonnes « Email », « Présent » et
  « Pointé le » par leur nom, pas par leur position.
- `VOLUNTEER_HOURS_CERTIFICATE` : **à refilmer au prochain passage**. Image : le tableau de
  l'attestation gagne la colonne « Terminées avant la fin » (toujours visible) ; la liste des
  membres peut afficher sous « Heures attestées » le nombre de participations terminées avant la
  fin. Narration : « les heures attestées comptent les créneaux passés avec une présence
  enregistrée » ne dit pas qu'un départ avant la fin, bien que sa présence soit enregistrée, ne
  compte pas. Sélecteurs inchangés (noms de colonnes et de boutons).
- `REGISTRATION_MONITOR_FOLLOWUP`, chapitre `actions` : image, la barre « Actions sur la sélection »
  gagne « Marquer parti avant la fin (n) » si une personne présente est sélectionnée. Narration sans
  rapport avec les présences ; sélecteurs inchangés (« Sélectionner l'inscription de … »,
  « Désélectionner »).
- `LAST_MINUTE_CHANGES`, chapitre qui ouvre Jour J pour « Ajouter un besoin » : image, les lignes
  des personnes présentes ont le second bouton « Marquer parti avant la fin ». Narration sans
  rapport avec les présences ; sélecteurs inchangés.
- `SECTORS`, chapitre `sectors-pages` : Jour J est affichée un instant avec le filtre Secteur ;
  même écart d'image sur les lignes présentes. Narration et sélecteurs inchangés.
- `MEMBERS_MANAGEMENT` : image inchangée tant que la base de tournage n'a pas de départ avant la
  fin ; narration à nuancer au prochain passage, car une présence enregistrée peut désormais être
  un départ avant la fin, qui n'atteste aucune heure.

Les captures `admin-day-of`, `admin-registrations`, `admin-registrations-requests`,
`admin-refuse-request`, `admin-make-leader-modal`, `admin-members`, `admin-members-bulk-delete`,
`admin-print` et `admin-event-archive` sont déclarées sur des écrans dont la source a changé et
restent à régénérer avec une base jetable : aucun fichier de `public/doc-img/` n'a été modifié dans
ce travail.


**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
## #1142, second lot : accès accueil limité à un événement

La page Jour J des organisateurs gagne, pour un propriétaire seulement, une section repliée
« Accès accueil » en bas de page (invitation, renvoi, révocation). Aucune vidéo n'est régénérée
dans ce travail. Les vidéos dont un chapitre montre la page Jour J ou son bas de page sont à
relire au prochain passage :

- `ATTENDANCE_CHECK_IN` : chapitres `dayof-*` ; la section « Accès accueil » apparaît sous le
  tableau pour un propriétaire. La narration ne la mentionne pas.
- `LAST_MINUTE_CHANGES` : chapitre qui ouvre Jour J pour « Ajouter un besoin » ; même section
  ajoutée sous le tableau.
- `SECTORS` : chapitre `sectors-pages`, qui affiche Jour J un instant ; même section ajoutée.

Les sélecteurs de capture ne changent pas (la section est un `<details>` fermé, sans incidence sur
les boutons et les champs déjà filmés). Aucun fichier de `public/doc-img/` n'est modifié.



**Résolu pour ATTENDANCE_CHECK_IN — lot 41, 16 novembre 2026, révision 5.** Nouvelle narration et nouvelle prise contrôlées et publiées ; les autres vidéos citées dans cet écart gardent leur propre statut. [Preuves](evidence/batch41/attendance-check-in/review-report.txt).
## Lot 41 — tentative du 16 novembre 2026 : build produit bloqué

Le build neuf du main épinglé `f9fcec47d32af10b0837b2de87beb61535d30888` vérifie les 2 438 entrées du produit et compile le JavaScript, puis Next.js refuse l'export `buildDocIndexJson` de `src/app/api/public/doc-index/route.ts:21` dans ses types de route générés. Aucun BUILD_ID vérifié, aucune prise ni publication. L'interdiction de modifier `src/` est respectée ; aucun ancien build n'est utilisé.

Les sources du pointage sont préparées pour les quatre états, leurs annulations, les deux colonnes de l'export et l'exclusion des départs anticipés des heures attestées. La narration continue complète a été générée ; son audit indépendant signale douze frontières de chapitres à revoir. Ni le découpage ni une capture ne sont validés. Tous les écarts restent ouverts : aucun n'est marqué résolu sans nouveau film contrôlé.

Catalogue, dates, révisions, `renders.json`, guides et captures inchangés. [Rapport, inventaire NOT DONE et contrôles](evidence/batch41/review-report.md), [journal de l'échec du build](evidence/batch41/build-main-failure.log). Aucune annonce de livraison au CHANGELOG. Aucun push, merge ni message ntfy.


### Lot 41 — reprise après #1381, 16 novembre 2026 (en cours)

Le blocage du premier build est résolu par main : `e8ed666a48294d77213f8bf64fe35898314b0ed9` (#1381) déplace le helper hors de la route. Rebase sans conflit, contenu du commit `5c659750` conservé sous `f7f6fa5a`. Un seul nouveau build propre, 2 440 entrées vérifiées, BUILD_ID `HO6mRRAZuOevekAmdhN_C` ; [preuve](evidence/batch41/product-build-resume.json) et [journal](evidence/batch41/build-main-resume.log). Le premier échec ci-dessus reste historique. Aucun fichier produit modifié.

Les douze frontières signalées du pointage sont corrigées sur les silences mesurés du même master ; les quinze chapitres passent leur nouvel audit indépendant. La répétition publique locale complète réussit. Le rôle propriétaire de la fixture est corrigé en `admin` (rôle produit), et les écritures passent par la passerelle publique locale vérifiée ; la compilation et ses protections restent intactes. La prise et les revues finales sont en cours : aucun nouvel écart déclaré résolu, aucune publication à ce stade.


### FRONT_DESK_ACCESS — nouvelle vidéo du lot 41, 16 novembre 2026

**READY et publiée**, révision 1, 170,160 s, main `e8ed666a`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`. Une prise narrée après répétition ; huit chapitres AV / 30 points sans signalement, huit ASR source et finales réussies. Le master Kore est une génération entière, frontières corrigées sur les silences ; sa revue signale une variation naturelle d'intonation tout en concluant explicitement à une seule voix constante (rapport initial et résolution conservés).

Invitation, véritable email et activation, connexion accueil, pointage et révocation vérifiés ; aucune expiration simulée. Corps réel de l'email cadré x320/y312/960×488, sans écran technique. Musique 14,8–19,5 LU, minimum seule −34,1 LUFS, aucun trou ; 19 clics réels sonorisés. ASR multilingue complète et VTT : zéro tutoiement du spectateur. Description 108 octets. Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. Lien du guide et de FEATURES ajouté. [Rapport et preuves](evidence/batch41/front-desk-access/review-report.txt). Aucun défaut produit constaté ; aucune écoute subjective humaine revendiquée.


### ATTENDANCE_CHECK_IN — reprise terminée du lot 41, 16 novembre 2026

**READY et publiée**, révision 5, 461,680 s, main `e8ed666a`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`. Les douze frontières initiales sont corrigées et les quinze chapitres source/final passent l'ASR indépendante. Deux prises narrées : la première est rejetée pour la ligne de Zoé sous le cadre ; la seconde montre la recherche et ses résultats, les quatre états et leurs annulations sur Jour J et dans les inscriptions, les deux colonnes CSV, et la nuance des heures attestées.

Quinze chapitres AV / 61 points. Cinq rapports bruts signalent des observations, conservées et résolues par les images finales, les vrais événements d'entrée et les contrôles d'état : présence d'Aline et rechargements, classification des créneaux commencés avec la veille initialement montrée, deux recherches distinctes, rafraîchissement automatique distinct du clic manuel. [Contre-preuves](evidence/batch41/attendance-check-in/take2-counterchecks.json). Musique 14,7–19,2 LU, minimum seule −34,0 LUFS, aucun trou ; 46 clics et 46 touches réels sonorisés. ASR multilingue complète et VTT : zéro tutoiement. Corps mobile réellement capturé centré sans la marge native grise, brut final conservé.

Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. [Rapport complet](evidence/batch41/attendance-check-in/review-report.txt). L'incident d'archivage de la première prise (brut perdu, MP4 et preuves conservés) n'est pas masqué ; le recorder archive désormais automatiquement le brut et sa timeline avant une nouvelle capture, avec deux tests de préservation de fichiers. Aucun troisième tournage ni fichier produit modifié ; aucune écoute subjective humaine revendiquée.

## Lot 41 — rappels et réglages e-mail publiés, 16 novembre 2026

**REMINDERS_CHANGES : READY, publiée, révision 5, 290,800 s. ORG_EMAIL_SETTINGS : READY, publiée, révision 5, 202,960 s.** Même produit main `e8ed666a48294d77213f8bf64fe35898314b0ed9`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`. Deux prises narrées chacune, premières rejetées et conservées. Les limites de deux prises sont respectées. Narrations intégrales Kore, nouvelles coupes vérifiées, ASR de chaque chapitre final et de la bande entière ; zéro tutoiement du spectateur. Les deux « ton » des rappels citent exactement le message saisi et affiché.

Rappels : dix chapitres AV / 35 points, deux signalements de clics absents contredits par les images et les événements réels ; les rapports bruts et les contre-preuves restent conservés. Deux véritables courriels d’annulation lisibles. Réglages : dix chapitres AV / 30 points, une observation sur la démonstration d’une case facultative, sans contradiction avec la phrase conditionnelle ; le passage final de la boîte aux envois est corrigé dans la deuxième prise. Musique respectivement 14,1–19,8 et 14,8–19,5 LU sous la voix, aucun trou. 31 clics / 132 touches et 12 clics / 22 touches réels sonorisés. Aperçu puis APPLY=1 sur default pour chacune, cinq fichiers envoyés. [Rapport des rappels](evidence/batch41/reminders-changes/review-report.txt), [rapport des réglages](evidence/batch41/org-email-settings/review-report.txt).

Les écarts historiques d’image pour ces deux vidéos (libellés, navigation, réglages d’e-mail et aide) sont résolus par ces nouvelles prises du produit actuel ; l’historique et les écarts des autres vidéos restent ouverts. Aucun changement du produit, aucune écoute subjective humaine revendiquée.

## Lot 41 — heures et attestation publiées, 16 novembre 2026

**VOLUNTEER_HOURS_CERTIFICATE : READY, publiée, révision 4, 311,360 s.** Même main `e8ed666a48294d77213f8bf64fe35898314b0ed9`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`. Nouvelle narration entière Kore et huit coupes vérifiées ; huit chapitres ASR finaux et bande entière, zéro tutoiement. Deux prises narrées : le CSV trop tardif de la première est corrigé sur « Dans ce vrai fichier » dans la seconde.

La fixture montre un vrai départ anticipé et le libellé actuel « Participations terminées avant la fin », conditionnel à un nombre positif. Douze heures prévues et six attestées, une participation terminée avant la fin et zéro heure prévue sans présence dans l’attestation. Deux vrais CSV à sept colonnes, puis le vrai PDF A4 d’une page : logo gris, colonnes et signatures complets. Le bouton produit d’impression est réellement actionné ; la démonstration headless produit le PDF depuis une seconde vraie prévisualisation avec les mêmes contrôles, sans intercepter print ni recopier le HTML. La fenêtre native n’est pas présentée comme vérifiée.

Huit chapitres AV / 33 points ; deux observations brutes conservées et résolues par les images, les états ARIA réellement vérifiés, le comparateur inchangé de main et le PDF : un tri peut garder l’ordre déjà correct, et le logo coloré à l’écran est bien gris à l’impression. Musique 14,5–19,2 LU, aucun trou ; 18 clics et 42 touches réels sonorisés. Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. [Rapport et contre-preuves](evidence/batch41/volunteer-hours-certificate/review-report.txt). Les écarts historiques de cette vidéo sont résolus par cette prise du produit actuel ; ceux des autres vidéos restent ouverts. Aucun changement produit, aucune écoute subjective humaine revendiquée.

## Lot 41 — membres et pages par poste publiés, 16 novembre 2026

**MEMBERS_MANAGEMENT : READY, publiée, révision 8, 238,840 s. EVENT_PROGRAM_PAGES_QR : READY, publiée, révision 5, 194,280 s.** Même main `e8ed666a48294d77213f8bf64fe35898314b0ed9`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`.

Membres : la première prise annonçait soixante fiches face au compteur 63. Le texte dit désormais plusieurs dizaines de fiches ; toute la voix Puck a été régénérée avant la seconde et dernière prise. La nuance du départ anticipé sans heure attestée est prononcée. Dix chapitres ASR et AV / 38 points, aucune observation, zéro tutoiement ; musique 13,9–19,0 LU et minimum seule −34,1 LUFS, aucun trou. 36 clics et 132 touches réels sonorisés. [Rapport](evidence/batch41/members-management/review-report.txt).

Pages : un nouveau segment rattache la vraie page à Accueil, montre l’avertissement public et le lien « À lire avant ton créneau » sur la page personnelle d’Aline Mercier réellement confirmée, puis ouvre le même contenu public. Nouvelle voix Kore entière, neuf chapitres ASR et AV / 31 points sans observation, un seul « ton » qui cite le lien affiché et aucun tutoiement du spectateur. Musique 14,7–19,6 LU, minimum seule −34,4 LUFS, aucun trou ; 30 clics et 115 touches réels sonorisés. Une prise narrée. La date d’exemple du 14 novembre reste celle prononcée ; le produit indique correctement que cet événement et son créneau sont terminés. [Rapport](evidence/batch41/event-program-pages-qr/review-report.txt).

Pour chacune : aperçu puis APPLY=1 sur default, cinq fichiers envoyés, vérification distante sans fichier à renvoyer. Les écarts historiques de ces deux vidéos sont résolus par ces images actuelles ; ceux des autres vidéos restent ouverts. Aucun changement du produit, aucune écoute subjective humaine revendiquée.

Les cinq captures documentaires demandées ont été régénérées par `ONLY=admin-reminders,admin-print,admin-event-archive,admin-members,admin-members-bulk-delete npm run screenshots`, sur une nouvelle base canonique indépendante des vidéos et le même build vérifié. Quatre sont identiques octet pour octet à main ; seule `admin-print`, déjà mise à jour dans ce lot, conserve les dates et l’en-tête du scénario actuel. Les textes alternatifs ont été relus et restent exacts. Les essais préliminaires sur la base vidéo avaient conservé des personnes de tournage ; ils sont remplacés par cette exécution isolée, sans effacer leur historique de preuve. [Preuve et empreintes](evidence/batch41/doc-captures-isolated.json).

## Lot 41 — inscription sur téléphone publiée, 16 novembre 2026

**VOLUNTEER_REGISTER : READY, publiée, révision 4, 56,080 s, 390×844.** Même main `e8ed666a48294d77213f8bf64fe35898314b0ed9`, BUILD_ID `HO6mRRAZuOevekAmdhN_C`. Nouvelle narration Kore entière, six frontières recalées, sept chapitres ASR et AV / 21 points sans observation. Une prise narrée après répétition. Véritable inscription publique puis titre actuel « Demande d’inscription reçue », sans lien personnel sur cet écran ; le vrai email contient un lien dont l’API retourne l’inscription active d’Alex Martin. Preuve séparée sans conserver le jeton.

Bande finale multilingue et VTT : deux « tu » littéraux, treize candidats de registre au total, tous voulus et permis pour l’audience exclusivement bénévole. Musique 16,0–19,0 LU sous la voix, aucun trou ; dix clics réels sonorisés et aucune touche inventée pour fill(). Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. [Rapport et images](evidence/batch41/volunteer-register-mobile/review-report.txt). Les écarts historiques de cette vidéo sont résolus ; aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — erreurs d’inscription non publiées, 16 novembre 2026

Deux prises, **NOT READY**, 310,68 s. Les corrections du formulaire et des deux cartes personnelles sont prouvées ; les onze ASR et la validation technique passent. Deux défauts de capture subsistent : clic de nouvelle confirmation environ 1,9 s avant son verbe et notification réelle d’un autre scénario Mailpit pendant le message. La limite de deux prises interdit une troisième capture ; aucun défaut produit ni modification de src. L’écart reste ouvert et la révision publiée reste inchangée. [Rapport et preuves finales](evidence/batch41/volunteer-confirmation-errors/review-report.txt).

## Lot 41 — confidentialité et liens personnels publiés, 16 novembre 2026

**PRIVACY_PERSONAL_LINKS : READY, publiée, révision 6, 358,56 s.** Une nouvelle voix Kore continue, neuf limites de chapitres alignées, dix ASR source et final conformes. Dix revues AV / 41 points ; le signalement brut de fin tronquée est contredit par l’ASR du MP4 (mot final complet et aucun écart de bord) et son silence final de 178 ms. Les images montrent les deux organisations, les vrais messages reçus, la récupération neutre, la révocation réelle, les vues limitées et la différence rapport/CSV ; les CGU affichent le 15 novembre 2026. Un « Ton » cité, aucun tutoiement du spectateur ; musique 15,3–19,7 LU, aucun trou. Aperçu puis APPLY=1, quatre fichiers envoyés et transcription déjà identique. Les écarts historiques de cette vidéo sont résolus. [Rapport et contre-preuve conservée](evidence/batch41/privacy-personal-links/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — suivi des inscriptions non publié, 16 novembre 2026

**REGISTRATION_MONITOR_FOLLOWUP : NOT READY**, deux prises, 191,48 s. Le destinataire « créneau » omis dans la première prise est réellement sélectionné dans la seconde après correction et répétition. Deux défauts temporels restent visibles : fermeture de la demande 1,7 s avant son annonce et filtres manipulés trop tôt dans leur énumération. La limite de deux prises interdit une troisième capture ; aucun changement produit. ASR et validation technique passent, musique 14,6–19,0 LU sans trou, zéro tutoiement ; les observations brutes sont conservées. L’écart reste ouvert, aucune publication ni hausse de révision. [Rapport et preuves](evidence/batch41/organizer-monitor-followup/review-report.txt).

## Lot 41 — secteurs publiés, 16 novembre 2026

**SECTORS : READY, publiée, révision 3, 226,08 s.** Nouvelle voix Puck continue, dix limites alignées et onze ASR source/final conformes. Onze revues AV / 39 points et 22 images finales inspectées. Le seul signalement constate l’absence de barre du navigateur : la phrase sur la persistance dans l’adresse est une explication, pas une promesse d’afficher cette barre. Le recorder vérifie réellement le paramètre secteur et la réouverture ; une contre-vérification indépendante conserve l’URL actuelle et retrouve Parking avec cinq inscriptions. L’observation brute reste visible. Secteurs disponibles sans consentement ni activation bêta ; musique 15,0–19,4 LU sans trou, zéro tutoiement, 28 clics et 37 touches réels sonorisés. Aperçu puis APPLY=1, quatre fichiers envoyés et transcription déjà identique, vérification distante cinq inchangés. Les écarts historiques de cette vidéo sont résolus. [Rapport et preuves](evidence/batch41/sectors/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — visibilité des équipes publiée, 16 novembre 2026

**SHIFT_ROSTER_VISIBILITY : READY, publiée, révision 3, 260,00 s.** Une nouvelle voix Kore continue, sept limites alignées, huit ASR source/final conformes. Huit revues AV / 34 points et seize images finales inspectées. L’unique signalement d’état absent est contredit par l’image finale exacte : « À confirmer » est bien lisible sous l’interrupteur désactivé. Les preuves de comportements réels passent, y compris email/lien, accord ancien élargi explicitement, nom masqué pour les autres, invitation et mineur exclu. Un « toi » cité dans le libellé « Avec toi », aucun tutoiement du spectateur ; musique 14,7–20,0 LU sans trou. Aperçu puis APPLY=1, cinq fichiers envoyés et vérification distante cinq inchangés. Les écarts historiques de cette vidéo sont résolus. [Rapport et contre-preuve](evidence/batch41/shift-roster-visibility/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — visite d’administration publiée, 16 novembre 2026

**ADMIN_FEATURES_OVERVIEW : READY, publiée, révision 6, 292,68 s.** Nouvelle voix Kore continue incluant la phrase sur les délais propres à l’événement, quinze limites alignées et seize ASR source/final conformes. Seize revues AV / 54 points, aucun signalement ; 32 images finales inspectées, dont le formulaire réel des délais dans Messages. L’ancien doublon de compte local est retiré sous garde d’identité exacte avant le tournage. Musique 15,3–19,7 LU sans trou, zéro tutoiement, vingt clics et huit touches réels sonorisés. Aperçu puis APPLY=1, cinq fichiers envoyés. Les écarts historiques de cette vidéo sont résolus. [Rapport et images](evidence/batch41/admin-features-tour/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — imprévus non publiés, 16 novembre 2026

**LAST_MINUTE_CHANGES : NOT READY**, deux prises, 403,28 s. La modification trop précoce des horaires de la première prise est corrigée et contrôlée dans la seconde. Le chapitre d’ajout manuel garde toutefois une saisie et un retour au résultat en retard de cinq à sept secondes. Onze revues AV / 45 points, onze ASR et validation technique ; onze vrais messages reçus vérifiés, musique 13,4–19,8 LU sans trou, zéro tutoiement. Les défauts sont ceux du recorder, sans changement produit. La limite de deux prises interdit une troisième capture ; l’écart historique reste ouvert, aucune publication ni hausse de révision. [Rapport et images exactes](evidence/batch41/last-minute-changes/review-report.txt).

## Lot 41 — clôture de la phase 1, 16 novembre 2026

Les quinze vidéos des points 1 à 9 ont été traitées : **douze READY publiées**, trois **NOT READY non publiées** après leurs deux prises autorisées (erreurs d’inscription, suivi des inscriptions, imprévus). Leurs écarts restent ouverts avec les images et raisons ci-dessus ; aucune troisième prise ni assemblage de prises différentes. Les 67 MP4 du catalogue publié ont tous été mesurés directement sur le serveur public, et leurs deux affiches vérifiées ; `renders.json` reprend ces mesures, avec douze entrées modifiées, uniquement celles effectivement publiées. Les rendus des trois vidéos non publiées restent ceux du serveur. [Mesures distantes](evidence/batch41/published-renders-phase1.json). Les cinq captures documentaires et leurs textes alternatifs sont contrôlés sur une base jetable indépendante. La phase 2 suit désormais les 36 écarts historiques H dans leur ordre initial, sans effacer cet historique.

## Lot 41 — phase 2, gestes de Frise : écart H résolu, 16 novembre 2026

**SHIFT_TIMELINE_QUICK_ACTIONS : READY, publiée, révision 6, 126,36 s.** Première vidéo H reprise dans l’ordre du fichier : nouvelle voix Kore continue, six limites de chapitres corrigées avant la prise, sept ASR source/final conformes. Le contrôle des mots réellement prononcés corrige un repère de saisie tardif avant la première prise narrée. Sept revues AV / 25 points ; deux observations brutes sont résolues par les images : « Relève suivante » est réellement saisi puis enregistré, et le panneau qui s’ouvre automatiquement après le redimensionnement est fermé puis rouvert au moment demandé. Le champ Minimum, le nouveau panneau d’application au poste, les libellés actuels et le Minimum (optionnel) de l’éditeur sont visibles. Les écarts historiques de minimum et de libellés de cette vidéo sont résolus ; les autres vidéos gardent leur statut. Musique 13,9–18,7 LU sans trou, zéro tutoiement, 22 clics et 59 touches réels sonorisés. Aperçu puis APPLY=1, cinq fichiers envoyés et vérification distante cinq inchangés ; durée et affiches publiées contrôlées, `renders.json` mis à jour pour garder ce commit publiable. [Rapport et contre-preuves](evidence/batch41/phase2/shift-timeline-quick-actions/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — phase 2, série de créneaux : écart H résolu, 16 novembre 2026

**SHIFT_CREATE_SERIES : READY, publiée, révision 7, 103,04 s.** Deuxième vidéo H dans l’ordre initial : nouvelle voix Puck continue, sept ASR source/final et contrôle de voix conformes. Deux répétitions, une seule prise narrée ; première ligne centrée avant son décompte. Sept revues AV / 24 points sans signalement, quatorze images finales inspectées. Les Minimum par créneau (optionnel) et Minimum (optionnel) sont visibles ; six relèves réelles, quatre places pour la première et trois pour les cinq autres. Les écarts historiques de minimum et de libellés de cette vidéo sont résolus ; le scénario part d’un planning publié et n’entre pas dans l’assistant, donc la note conditionnelle sur son ancien en-tête ne s’applique pas. Musique 13,0–18,9 LU sans trou, zéro tutoiement, douze clics réels sonorisés. Aperçu puis APPLY=1, quatre fichiers envoyés et transcription déjà identique ; vérification distante cinq inchangés, durée publiée mesurée et métadonnées synchronisées. [Rapport et preuves](evidence/batch41/phase2/shift-create-series/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## Lot 41 — phase 2, éditeur de créneau : écart H résolu, 16 novembre 2026

**SHIFT_CREATE_EDIT_DETAIL : READY, publiée, révision 6, 134,76 s.** Troisième vidéo H dans l’ordre initial : nouvelle voix Kore continue, six limites corrigées avant la prise, sept ASR source/final et contrôle de voix conformes. Deux répétitions, une seule prise narrée ; pauses des heures raccourcies avant la prise pour terminer leur saisie pendant leur explication. Sept revues AV / 25 points sans signalement, quatorze images finales inspectées. Minimum (optionnel), aide des paramètres du poste et libellés actuels sont visibles ; le vrai créneau 18h–21h30 est enregistré avec trois places et ses informations pratiques, puis relu. Les écarts historiques de minimum et de libellés de cette vidéo sont résolus. Musique 15,4–19,1 LU sans trou, zéro tutoiement, dix-neuf clics réels sonorisés. Aperçu puis APPLY=1, cinq fichiers envoyés ; vérification distante cinq inchangés et durée publiée synchronisée. [Rapport et preuves](evidence/batch41/phase2/shift-create-edit-detail/review-report.txt). Aucun changement produit ni écoute subjective humaine revendiquée.

## À refilmer : « Partager ce créneau » sur « Où manque-t-il du monde ? » (#1386, 17 novembre 2026)

Chaque créneau à compléter porte maintenant un troisième lien, **Partager ce créneau**, après « Chercher des bénévoles » et « Voir les disponibilités » ; il ouvre une fenêtre avec le lien public du créneau, « Copier le lien », « QR code PNG » et la case « Accepter une inscription même si les inscriptions de l'événement sont fermées ». Les sélecteurs de capture visent des liens de `staffing-underfilled` et ne cassent pas ; seule l'image change. Vidéos touchées : **LAST_MINUTE_CHANGES** (`last-minute-changes`, le geste le plus utile la veille : un segment à ajouter). À reprendre au prochain lot vidéo.

## À refilmer : planning en liste sur téléphone (#1407, 18 novembre 2026)

Sur la page d'inscription, un téléphone tenu droit ouvre maintenant le planning en **Liste** (la frise reste l'affichage des écrans plus larges), et le choix « Frise / Liste » porte un libellé visible, « Affichage des créneaux », et une icône par bouton.

- **volunteer-discover-event**, scène « Sur téléphone » : la narration dit que le planning est plus large que l'écran et qu'on le fait défiler ; c'est vrai de la frise, plus de l'affichage d'office. La capture touche maintenant « Frise » avant de faire défiler. Narration à revoir (dire que le téléphone ouvre la liste, et que « Frise » ou le téléphone tourné à l'horizontale donne la journée entière), puis refilmer.

## Lot 42 — bibliothèque de modèles, 19 novembre 2026

**MESSAGE_TEMPLATES : READY, publiée, révision 1, 98,40 s, 1280 × 800.** Main vérifié `04aac36196087830380b672268679e360c121ea1`. Répétition suivie de deux prises narrées. La seconde montre les trois mentions mises en évidence, le refus au champ Message, l'enregistrement du modèle corrigé et l'aperçu destiné à un bénévole fictif. Les catégories sont visibles dans la bibliothèque et dans l'éditeur. Le recorder vérifie le groupe « Météo et imprévus » du sélecteur natif au moment du choix. La capture Chromium montre le champ et la sélection effectuée. Le parcours se termine à l'aperçu.

Six chapitres ASR source et final, 20 points de contrôle AV, musique 15,7–18,8 LU sous la voix. Le rapport automatique du chapitre bibliothèque signale « Déjà dans mes modèles » comme absent à tort. Le clic intervient à 31,789 s et l'image du MP4 à 34,8 s montre le libellé sur la bonne carte. Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. Le MP4 distant a été mesuré et l'affiche répond HTTP 200. [État du lot](evidence/batch42/STATUS.md), [validation](evidence/batch42/message-templates-take2/validation.json), [rapport AV](evidence/batch42/message-templates-take2/inspect.json), [image après l'ajout](evidence/batch42/message-templates-take2/library-added.jpg).

**TARGETED_MESSAGES : READY, publiée, révision 5, 361,92 s, 1280 × 800.** Le nouveau chapitre présente la bibliothèque et renvoie au tutoriel. Le formulaire de création montre « Infos pratiques ». Répétition complète après remise à zéro ciblée de Mailpit, puis une prise narrée. Treize chapitres ASR source et final, 46 points de contrôle AV, aucun signalement. Cinq emails fictifs reçus, deux corps personnalisés montrés et un seul email pour Léa malgré ses deux inscriptions. Musique 14,2–19,1 LU sous la voix (−34,1 LUFS au minimum quand elle joue seule). Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. Le MP4 distant a été mesuré et l'affiche répond HTTP 200. [Validation](evidence/batch42/targeted-messages/validation.json), [contrôles de la campagne](evidence/batch42/targeted-messages/targeted-message-checks.json), [revue du nouveau chapitre](evidence/batch42/targeted-messages/audiovisual/template-library.json).

**ADMIN_FEATURES_OVERVIEW : READY, publiée, révision 7, 293,96 s, 1280 × 800.** La visite montre le nouvel écran « Modèles de messages ». Le texte de la narration reste identique. Les WAV d'origine étaient absents du clone. Une nouvelle génération Kore a été contrôlée après suppression du doublon du chapitre sur les créneaux. Une prise narrée après répétition. Seize chapitres ASR source et final, 52 points de contrôle AV, aucun signalement, musique 14,9–19,6 LU sous la voix. Aperçu puis APPLY=1 sur default. Le MP4 distant a été mesuré et l'affiche répond HTTP 200. [Validation](evidence/batch42/admin-features-tour/validation.json), [revue du chapitre Messages](evidence/batch42/admin-features-tour/audiovisual/messages.json), [nouvel écran](evidence/batch42/admin-features-tour/templates.jpg).

**PLATFORM_INTERNAL_ADMINISTRATION : READY, publiée, révision 5, 458,24 s, 1280 × 800.** L'instance séparée sur 43104 utilise un build vérifié avec l'origine publique pour la redirection de désabonnement. Le navigateur passe par la passerelle locale. Précontrôles de même origine et d'origine étrangère, second facteur et véritable POST vérifiés. Deux prises narrées. La seconde montre la section « Serveur », cadre les tâches sur la phrase correspondante et confirme le désabonnement à 46,225 s du chapitre (repère à 45,736 s). Douze chapitres ASR source et final, musique 12,9–18,6 LU sous la voix. La revue du chapitre Identifiant confond l'ouverture du détail avec la navigation suivante. L'image du MP4 à 148,7 s (18,585 s du chapitre) montre déjà le nouvel identifiant dans l'en-tête et le formulaire. Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. Le MP4 distant a été mesuré et l'affiche répond HTTP 200. [Validation](evidence/batch42/platform-internal-administration/validation.json), [santé du serveur](evidence/batch42/platform-internal-administration/server-health.jpg), [tâches](evidence/batch42/platform-internal-administration/scheduled-tasks.jpg), [désabonnement](evidence/batch42/platform-internal-administration/unsubscribe-result.jpg), [détail renommé](evidence/batch42/platform-internal-administration/renamed-detail.jpg).

**STAFFING_GAPS : READY, publiée, révision 4, 268,32 s, 1280 × 800.** Le nouveau chapitre ouvre « Partager ce créneau » pour la buvette du samedi soir, vérifie la copie du lien affiché et montre le QR code et l'option après fermeture. La deuxième prise conserve l'écran des demandes jusqu'à la fin du chapitre et cadre le samedi à 1/3, manque 2, après l'ajout de Julien. Dix chapitres ASR source et final, musique 14,5–19,8 LU sous la voix. La revue du partage décrit le clic comme absent. Le repère est à 5,829 s du chapitre et le clic réel à 6,319 s. Les deux images du MP4 montrent le pointeur sur le bouton, puis le changement de « Lien prêt » à « Lien copié ». Aperçu puis APPLY=1 sur default, cinq fichiers envoyés. MP4 distant mesuré et affiche HTTP 200. [Validation](evidence/batch42/staffing-gaps/validation.json), [avant le clic](evidence/batch42/staffing-gaps/shift-share-before-copy.jpg), [lien copié](evidence/batch42/staffing-gaps/shift-share.jpg), [créneau du samedi après ajout](evidence/batch42/staffing-gaps/updated-saturday-shift.jpg).

**LAST_MINUTE_CHANGES : NOT READY après deux prises.** Le nouveau partage, l'ajout de Zoé et les onze courriels fictifs ont été vérifiés. La deuxième prise laisse l'aperçu Jour J lisible de 28,061 à 31,160 s du chapitre. Le champ Places est prérempli à 2 avant sa modification, et le vrai récapitulatif confirme 1 place. L'email de changement d'horaire reste trop bref. Dans « Décaler un horaire », la lecture est annoncée à 18,234 s. Le vrai message apparaît à 20,815 s et le planning revient à 21,895 s, soit 1,080 s de lecture. ASR de la bande entière et validation technique réussies. La révision publiée est conservée. [Validation](evidence/batch42/last-minute-changes/take2/validation.json), [revue du changement d'horaire](evidence/batch42/last-minute-changes/take2/schedule.json), [image du message](evidence/batch42/last-minute-changes/take2/schedule-email.jpg).

**SECTORS : READY, publiée, révision 4, 220,84 s, 1280 × 800.** Le rapport du secteur Parking montre « Partager ce créneau » à 163,2 s. Le texte reste identique, la voix Puck a été régénérée faute de WAV locaux. Une prise après répétition. Onze chapitres ASR source et final, musique 14,9–19,4 LU sous la voix. Deux observations brutes sont conservées. L'image du MP4 montre le lien « Organiser les secteurs dans Créneaux » sur la carte et le bouton « Gérer les postes » sur l'écran suivant. Le recorder vérifie la persistance du filtre Parking à la réouverture, sans afficher la barre du navigateur. Aperçu puis APPLY=1 sur default, quatre fichiers envoyés et transcription identique. MP4 distant mesuré et affiche HTTP 200. [Validation](evidence/batch42/sectors/validation.json), [partage dans Parking](evidence/batch42/sectors/parking-share.jpg), [lien exact avant le clic](evidence/batch42/sectors/enable-link.jpg), [filtre rouvert](evidence/batch42/sectors/reopened-parking-filter.jpg).

**VOLUNTEER_REGISTER : READY, publiée, révision 5, 54,20 s, 390 × 844.** « Liste » est sélectionné au chargement sur téléphone, sous « Affichage des créneaux ». Le choix part de la liste et l'inscription publique mène à « Demande d'inscription reçue ». Le texte narratif reste identique, avec une nouvelle piste Kore. Deux prises après répétition. La deuxième cale le consentement et garde le bouton visible avant la confirmation. Sept chapitres ASR source et final, 21 points de contrôle AV sans signalement, musique 15,4–18,6 LU sous la voix. Aperçu puis APPLY=1, quatre fichiers envoyés et transcription identique. MP4 distant mesuré et affiche HTTP 200. [Validation](evidence/batch42/volunteer-register-mobile/validation.json), [liste par défaut](evidence/batch42/volunteer-register-mobile/default-list.jpg), [demande reçue](evidence/batch42/volunteer-register-mobile/request-received.jpg).

**Reprises du lot 42 passées au lot 43** : `VOLUNTEER_DISCOVER_EVENT` (arrêtée après une répétition complète, la voix n'a pas été générée), `VOLUNTEER_CONFIRMATION_ERRORS` et `REGISTRATION_MONITOR_FOLLOWUP` (pas commencées). `TARGETED_MESSAGES` et `VOLUNTEER_REGISTER` ont été tournées avant le bouton « Mes inscriptions » des emails (#1429) : elles restent listées ci-dessous pour le lot 43.

## À refilmer : liste avec téléphones par jour (#1431, 19 novembre 2026)

La **liste avec téléphones** est maintenant un tableau en paysage : une ligne par bénévole (nom, téléphone, email) et une colonne par jour de l'événement, avec les créneaux qui se suivent sur le même poste réunis. La narration d'**EVENT_REPORTS** (`event-reports`) reste juste — retrouver une personne, son email, son téléphone et ses créneaux — mais l'image du chapitre Contacts est périmée. Aucun sélecteur de capture ne vise la mise en page ; la vidéo est à refilmer au prochain lot. Le planning par jour et l'export complet ne changent que sur une journée dense, absente du jeu de tournage.

## À refilmer : lien « Mes inscriptions » commun (#1429, 19 novembre 2026)

L'email de confirmation, les rappels et les autres emails de gestion portent maintenant un seul bouton **Mes inscriptions** vers le lien personnel de l'organisation (`/mes-inscriptions/<token>`), avec la phrase « Ce lien ouvre toutes tes inscriptions auprès de [organisation]. Ne le partage pas. » ; les emails d'action propres à un événement (place proposée, échange, disponibilités, demande à valider, invitation) gardent leur lien, et les anciens liens d'événement continuent de fonctionner. Aucune capture n'est régénérée dans ce lot.

**Narration à revoir sur le lien personnel et son renouvellement** :

- **PRIVACY_PERSONAL_LINKS** (`privacy-personal-links`) : narration et images des chapitres « lien personnel », « lien invalide » et « renouvellement » à reprendre pour la portée organisation et la phrase affichée dans l'email.

**Vidéos montrant un email de confirmation ou de rappel** (bouton et phrase de portée périmés ; capture à refaire, narration à ajuster quand elle cite le bouton ou le lien) :

- **ASSIGNMENT_PUBLICATION** (`assignment-publication`) : l'email de publication des missions montre « Gérer mes inscriptions ».
- **VOLUNTEER_CONFIRMATION_ERRORS** (`volunteer-confirmation-errors`) : email de confirmation et email « Demande d'inscription non enregistrée », tous deux avec leur lien personnel.
- **VOLUNTEER_REGISTER** (`volunteer-register-mobile`) : email de confirmation et son lien personnel.
- **PRIVACY_PERSONAL_LINKS** (`privacy-personal-links`) : email réel, ouverture du lien personnel, renvoi et lien invalide.
- **REMINDERS_CHANGES** (`reminders-changes`) : rappel manuel, rappels J-2/J-1/jour J et email de changement d'horaire.
- **LAST_MINUTE_CHANGES** (`last-minute-changes`) : email d'offre, email de changement d'horaire et emails d'annulation.
- **SHIFT_WAITLIST_OFFER** (`shift-waitlist-offer`) : email d'offre de place (lien d'action propre à l'événement, à conserver tel quel).
- **TARGETED_MESSAGES** (`targeted-messages`) et **MEMBERS_REMINDERS** (`members-reminders`) : emails de message ciblé, dont le bouton de gestion.
- **ORG_EMAIL_SETTINGS** (`org-email-settings`) : email de test d'un message ciblé.
- **EMAIL_DELIVERY_FAILURES** (`email-delivery-failures`) : emails de suivi des envois, sans lien personnel à changer mais à vérifier au même passage.
- **EVENT_QUESTIONS** (`event-questions`) : email de demande non enregistrée avec lien personnel.

**Vidéos visitant la page `/my` (image seulement ; une carte « Retrouver toutes mes inscriptions » y a été ajoutée, aucune narration ne la cite)** : `ASSIGNMENT_PUBLICATION`, `EVENT_PROGRAM_PAGES_QR`, `PRIVACY_PERSONAL_LINKS`, `SHIFT_APPROVAL`, `SHIFT_NIGHT_DST`, `SHIFT_ROSTER_VISIBILITY`, `SHIFT_SWAPS`, `SHIFT_WAITLIST_OFFER`, `VOLUNTEER_CALENDAR`, `VOLUNTEER_CHOOSE_SHIFTS`, `VOLUNTEER_PHONE_NOTIFICATIONS`, `VOLUNTEER_SESSION_AVAILABILITY`, `WORKLOAD_PROTECTION`, `LAST_MINUTE_CHANGES`, `MEMBERS_DUPLICATES_MERGE`, `VOLUNTEER_CONFIRMATION_ERRORS`, `VOLUNTEER_REGISTER`. À reprendre au prochain lot vidéo, en même temps que la nouvelle carte (dix-sept vidéos, sans compter les vidéos d'administration qui ne font que citer la page).

## Lot 43 — Retrouver toutes mes inscriptions, 19 novembre 2026

**VOLUNTEER_ORG_REGISTRATIONS — READY, publiée, révision 1, 90,76 s.** Le parcours couvre le lien perdu, les inscriptions de deux événements, l’annulation d’un créneau, la copie de l’adresse du calendrier et le renouvellement. Les courriels de récupération et de renouvellement filmés emploient le libellé « Voir mes inscriptions » et leur phrase complète de confidentialité. [Suivi et preuves](evidence/batch43/STATUS.md).

**VOLUNTEER_PERSONAL_REGISTRATIONS — READY, publiée, révision 4, 185,12 s.** Le tour part de la page commune, ouvre le détail de l’événement et montre le renouvellement du lien de l’organisation. [Revue et contrôles](evidence/batch43/volunteer-personal-registrations/review.md).
