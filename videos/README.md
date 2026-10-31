# Vidéos du produit

Ce dossier contient les sources reproductibles des tutoriels vidéo : scripts éditoriaux, transcripts, manifestes de narration et scénarios Playwright. Les fichiers lourds générés restent dans `videos/output/`, ignoré par Git.

Le catalogue central `catalog.json` donne à chaque vidéo un identifiant sémantique stable,
indépendant de son titre, de sa langue, de son fichier et de sa future position dans la galerie.
Les commandes, les logs, la documentation et les futures traductions doivent référencer cet
identifiant, jamais un numéro d'ordre. Les slugs ci-dessous ne sont que les noms actuels des
manifestes et des fichiers de sortie.

Le catalogue complet et les statuts de production se trouvent dans `catalog.json` et
`MASTERCLASS_PLAN.md`. Parmi les premières vidéos de présentation :

- `volunteer-register-mobile` : inscription d’un bénévole depuis un téléphone ;
- `organizer-create-publish` : création d’un événement, préparation des créneaux et publication.
- `admin-features-tour` : tour d’horizon autonome des principales fonctions de l’administration.
- `organizer-monitor-followup` : suivi des inscriptions, relances ciblées et préparation du jour J.
- `masterclass-03-first-steps` (`ORG_FIRST_STEPS`) : première mise en place d'une organisation.

## Licence

Le contenu éditorial (scripts, plan, narration, textes des fiches, catalogue, vidéos rendues,
sous-titres et transcriptions) est sous licence **CC BY-SA 4.0** : réutilisation et adaptation
libres, avec attribution « Benevol (benevol.app), CC BY-SA 4.0 » et partage dans les mêmes
conditions. Le nom et le logo Benevol n'en font pas partie. Les outils de génération restent sous
AGPL v3 comme le reste du dépôt. Détails dans `videos/LICENSE`.

## Sécurité

- Le recorder refuse tout hôte autre que `localhost`, `127.0.0.1` ou `::1`.
- Utiliser uniquement la base E2E ou une autre base locale jetable.
- `scripts/seed-demo.ts` supprime et recrée son événement fictif : ne jamais l’exécuter avec une URL de base de données de production.
- Les identités utilisent `example.org` et la capture ne doit contenir aucune donnée réelle.
- `GEMINI_API_KEY` est lu depuis l’environnement et n’est jamais écrit dans les fichiers de sortie.

## Prérequis

- Node.js et les dépendances du projet ;
- Chromium installé pour Playwright ;
- FFmpeg et FFprobe ;
- une pile locale avec PostgreSQL, Mailpit et l’application ;
- la base initialisée avec le seed principal puis `scripts/seed-demo.ts` ;
- une clé Gemini pour générer la narration et contrôler les paroles des extraits générés.

Les captures utilisent une pile qui leur est propre afin de ne pas prendre les ports du
développement ni ceux des tests E2E :

- application : `43100` ;
- PostgreSQL : `45433` ;
- SMTP : `41026` ;
- interface Mailpit : `48026`.

Pour les jeux spécialisés, exécuter le point d'entrée, pas le module qui ne fait
qu'exporter une fonction :

```bash
node --env-file=.env.video.e2e --import tsx scripts/seed-video-scenario.ts data-exports-archives
node --env-file=.env.video.e2e --import tsx scripts/seed-video-scenario.ts last-minute-changes
node --env-file=.env.video.e2e --import tsx scripts/seed-video-scenario.ts privacy-personal-links
```

Une commande terminée sans message de création n'est pas une preuve de remise à
zéro. Les précontrôles et le début du recorder vérifient aussi les valeurs attendues.

### Cas de la confirmation en environnement compilé local

Les effets doublés du mode développement peuvent confirmer une offre puis afficher
le refus du second appel. Ne pas monter une telle prise comme un succès. Pour
`LAST_MINUTE_CHANGES`, une copie compilée jetable sous
`/tmp/benevoles-video-production.<suffixe>/` peut tourner sur **43102**, sans toucher
au serveur de développement ni déployer. `local-production.ts serve-capture <copie>`
sert le build standalone avec ses assets copiés. La copie doit être construite
depuis le même code que le tournage. `local-production.ts build <copie>` compile
cette copie avec l’origine de capture `http://localhost:43102` ; les assets doivent
ensuite être copiés dans le standalone. Le wrapper ne copie pas le dépôt.

```bash
node --env-file=.env.video.e2e --import tsx videos/tools/local-production.ts run scripts/seed-video-scenario.ts last-minute-changes
node --env-file=.env.video.e2e --import tsx videos/tools/local-production.ts run videos/tools/record.ts LAST_MINUTE_CHANGES
node --env-file=.env.video.e2e --import tsx videos/tools/local-production.ts run videos/tools/verify-last-minute-mail.ts
node --env-file=.env.video.e2e --env-file=.env.video.local --import tsx videos/tools/local-production.ts run videos/tools/audit-audiovisual.ts LAST_MINUTE_CHANGES
```

Le wrapper refuse une base non locale ou autre que `benevoles_video`. Sa clé
déterministe publique est réservée aux fixtures, **jamais à une application
déployée**. Employer le même wrapper pour les outils qui lisent les jetons ou la
file d'envoi de cette prise. Montage, extraction d'images et contrôle des paroles
ne lisent pas ces données et restent inchangés. Ne pas arrêter un serveur de
l'utilisateur pour libérer un port ; identifier uniquement le processus vidéo créé.

`PRIVACY_PERSONAL_LINKS` utilise aussi cette copie, avec `serve` (domaine public) plutôt
que `serve-capture`. Le domaine public évite le
double `?` de l'email d'invitation sous localhost (`?org=…?token=…`). Ne pas réparer
le lien reçu dans le recorder : générer le vrai message avec la configuration de
formation. Aucun accès réseau au site public n'est nécessaire : seuls les
chemins des liens de ces messages fictifs sont ouverts sur localhost:43102.
Avant la capture, exécuter le seed `privacy-personal-links`, `prepare-privacy.ts`,
puis `verify-privacy-details.ts` via ce wrapper ; refaire le seed avant chaque
répétition ou prise narrée. Les deux sessions administrateurs proviennent de vrais
logins. Jules et Zoé sont deux destinataires distincts : la session bénévole locale
de l'événement est vidée avant d'ouvrir l'invitation de Zoé.

### Vidéo opérateur : base séparée

La console super-admin et ses communications sont globales. Ne pas utiliser la
base des autres captures pour cette vidéo. `provision-operator-db.ts`, lancé avec
`.env.video.e2e`, crée uniquement `benevoles_video_operator` sur le PostgreSQL local
45433 et y applique les migrations. Il refuse une base existante sans marqueur de
fixture ; il ne vide aucune base. `scripts/seed-video-operator.ts` exige cette base
nouvelle et vide et crée ses seules identités fictives.

`operator-local.ts serve <copie compilée>` utilise le port **43104**, la base
opérateur marquée et uniquement le SMTP local **41026**. Il ne déploie rien.
`operator-local.ts run videos/tools/prepare-operator.ts` contrôle les vrais logins,
les refus d'accès, le choix explicite d'organisation et la page santé sans écrire
de faux succès de sauvegarde. Le premier jeu compte trois organisations et un seul
administrateur actif abonné aux communications. Re-vérifier les destinataires
avant chaque diffusion, notamment après l'activation d'un nouveau compte fictif.

`operator-local.ts run videos/tools/verify-operator-lifecycle.ts` contrôle les
routes réelles sur un quatrième espace jetable : création, rotation de lien,
activation, collision d'identifiant, désactivation/réactivation et suppression
avec identifiant exact. Ce contrôle API ne remplace pas le parcours visuel.
Le recorder vérifie trois organisations initiales et les destinataires fictifs ;
il peut retirer uniquement son précédent espace jetable, identifié par son nom,
son identifiant, son unique administrateur réservé et l'absence d'événements ou de
membres. Aucune autre organisation n'est vidée. Les comptes opérateur et nouveau
propriétaire utilisent des sessions obtenues par de vraies connexions.

```bash
node --env-file=.env.video.e2e --import tsx videos/tools/operator-local.ts run videos/tools/record.ts PLATFORM_INTERNAL_ADMINISTRATION --rehearse --quick-rehearse
node --env-file=.env.video.e2e --import tsx videos/tools/operator-local.ts run videos/tools/record.ts PLATFORM_INTERNAL_ADMINISTRATION
```

La répétition accélérée vérifie les actions mais n'est jamais montée avec une
narration. L'entrée opérateur du catalogue est publiée comme les autres.

Préparation :

```bash
make video-up
make video-setup
make video-server
```

Après la capture, `make video-down` supprime cette base et cette boîte email jetables.

## 1. Relire le transcript sans appeler Gemini

Contrôler explicitement les outils vidéo et leurs imports, même si le contrôle de types de
l'application ne les inclut pas :

```bash
node --import tsx videos/tools/check-types.ts
```

Le build exécute ce contrôle avant tout appel de génération.

### Répéter le parcours sans narration

Après préparation du seed approprié, une répétition permet de vérifier les manipulations
locales sans appeler Gemini :

```bash
npm run video:record -- TARGETED_MESSAGES --rehearse
```

Cette prise utilise les durées provisoires du manifeste. Elle produit un fichier de travail
`capture.webm` et un timeline marqué `capturePurpose: rehearsal`, pas une vidéo synchronisée.
L'assembleur refuse cette prise : il faut refaire une capture avec les durées de la narration
vérifiée avant de monter le MP4. Les clics et emails du parcours sont réels dans la pile vidéo
isolée ; remettre les données à zéro avant la prise finale. Ne pas utiliser la répétition pour
écraser une capture finale déjà validée.

```bash
npm run video:tts -- VOLUNTEER_REGISTER --dry-run
```

La source éditoriale lisible se trouve dans `scripts/volunteer-register-mobile.md`. Le transcript effectivement envoyé à l’API vient du manifeste JSON, qui est également utilisé pour les sous-titres. Les deux doivent être modifiés ensemble.

## 2. Générer la narration

Créer d’abord un fichier local, ignoré par Git :

```dotenv
# .env.video.local
GEMINI_API_KEY=...
```

Puis lancer :

```bash
npm run video:tts -- VOLUNTEER_REGISTER
```

Variables facultatives :

- `GEMINI_TTS_MODEL`, par défaut `gemini-3.8-flash-tts` ;
- `GEMINI_TTS_VOICE`, par défaut la voix du manifeste ;
- option `--force` pour régénérer les WAV existants.

Les vidéos de la masterclass utilisent `continuousNarration` : Gemini produit la narration en
une seule prise, avec la voix choisie dans le manifeste. Les consignes de livraison doivent
rester courtes (sourire, rythme, articulation), sans longues instructions d'identité vocale.
Le repérage des pauses ne fournit qu'un premier découpage : il peut déplacer des phrases entre
chapitres. La durée de chaque extrait est mesurée par FFprobe dans `audio-metadata.json`.
Si une prise prononce une consigne de pause, `continuousPauseTags: false` dans son manifeste
retire les balises et conserve une seule prise avec des paragraphes naturels. Il faut ensuite
recaler les frontières et refaire le contrôle indépendant ; un faible taux d'erreur n'autorise
pas à garder des mots ajoutés ou une première phrase déplacée dans le chapitre précédent.

Pour une correction éditoriale limitée aux phrases modifiées, archiver d'abord le manifeste
original sous `source-manifest.json`, les WAV sous `audio-original/` et leurs métadonnées et
audit dans le dossier `previous-…` de cette vidéo, puis utiliser :

```bash
node --env-file=.env.video.local --import tsx videos/tools/revise-narration-sentences.ts VIDEO_ID videos/output/<slug>/previous-<timestamp>
```

Cette reprise garde les phrases inchangées de la prise continue vérifiée et génère seulement
les phrases modifiées avec la même voix et les mêmes consignes, sans balises de pause.
`continuousPauseTags` doit être `false`. Les identifiants et frontières des phrases restent
identiques. Une correction modérée de tempo rapproche les durées de celles d'origine.
Les métadonnées distinguent cette reprise d'une nouvelle prise continue et gardent les
empreintes du texte initial, des WAV sources et de chaque remplacement. Un nouvel audit
indépendant des chapitres remontés, une capture et une revue complète du MP4 sont obligatoires ;
le choix de la même voix ne prouve pas à lui seul l'uniformité audible.
Une proposition de frontières dans `sentence-boundaries.json` doit nommer l'empreinte du
WAV original et des bornes croissantes, de zéro à sa durée réelle. Les repères proposés par
un modèle se rapprochent d'abord de silences réellement mesurés ; ils ne deviennent une
preuve de découpage qu'après l'ASR indépendant du chapitre remonté, sans mot ajouté ou perdu.

### Contrôler les paroles avant la capture

```bash
node --env-file=.env.video.local --import tsx videos/tools/audit-narration.ts SECTOR_LEADERS
```

Ce contrôle envoie uniquement les extraits de narration fictive à Gemini pour une transcription
indépendante, sans fournir le texte attendu dans la demande. `narration-audit.json` garde la
comparaison et l'empreinte de chaque WAV. Une différence importante arrête le pipeline.
Un rapport indépendant déjà réussi est réutilisé seulement si le modèle, le texte attendu
et l'empreinte SHA-256 du WAV sont inchangés ; son score est recalculé. La date de reconnaissance
est conservée et la date de revalidation est distincte. `--force` demande une nouvelle
reconnaissance. Cela évite de facturer à nouveau les mêmes extraits lors d'une reprise de capture.
Le contrôle ne prouve pas la qualité du sourire ni la concordance phrase/manipulation : la
passe audiovisuelle reste obligatoire, y compris lorsque le taux de différence est faible.

Pour une frontière incorrecte, `locate-narration-boundary.ts VIDEO_ID segment-id` propose un
repère à partir d'une courte fenêtre sonore et d'un silence réel. Les timestamps suggérés par
un modèle ne sont jamais acceptés comme preuve. Après diagnostic, appliquer un repère avec
`recut-narration.ts VIDEO_ID segment-id=secondes`, refaire l'audit puis refaire la capture.
Si des paroles manquent réellement à la prise, régénérer la narration complète.

`video:build` contrôle les paroles après le TTS et avant le seed/capture. `video:validate`
refuse un rapport en échec ou dont les empreintes ne correspondent plus aux WAV actuels.

Si Gemini refuse un appel faute de crédits, conserver les sources et les narrations existantes.
Ne jamais marquer un nouvel audio comme contrôlé sans reconnaissance indépendante. Les captures
et montages utilisant une narration déjà vérifiée peuvent continuer ; aucun achat ni changement
de facturation n'est effectué par ces scripts.

## 3. Enregistrer les manipulations

Avec l’application vidéo disponible sur le port 43100 :

```bash
node --env-file=.env.video.e2e node_modules/.bin/tsx scripts/seed-demo.ts
npm run video:record -- VOLUNTEER_REGISTER
```

Rejouer le seed avant **chaque** prise : le scénario crée une véritable inscription et finirait sinon par remplir son créneau de démonstration.

Pour tester seulement les manipulations avant le tournage, `video:record -- VIDEO_ID --rehearse --quick-rehearse` conserve les vrais clics, saisies et assertions, mais saute les attentes calées sur la narration. Cette répétition accélérée reste marquée `rehearsal` : elle ne peut ni être assemblée en livrable ni servir de preuve de synchronisation. `--quick-rehearse` est refusé sans `--rehearse`. La capture narrée complète, à vitesse normale, reste obligatoire après remise à zéro du scénario.

Variables facultatives :

- `VIDEO_BASE_URL`, par défaut `http://localhost:43100` ;
- `VIDEO_ORG`, par défaut `default` ;
- `VIDEO_EVENT_SLUG`, par défaut `fete-du-village`.

### Inserts natifs d’accessibilité

`ACCESSIBILITY_KEYBOARD_DISPLAY` exige les vraies prises Safari de zoom à 200/400 %
et de VoiceOver, produites par `capture-accessibility-native.ts` sur le build vérifié.
Le processus natif vérifie ses autorisations macOS avant de chercher le titre de fenêtre.
Des identifiants de fenêtres visibles avec des titres absents ne prouvent pas une fenêtre
fermée : `CGPreflightScreenCaptureAccess=false` et ScreenCaptureKit `-3801` indiquent
un refus TCC. `AXIsProcessTrusted=false` bloque aussi les manipulations natives vérifiables.
Dans ce cas, conserver `NOT READY`, sans MP4 final incomplet ; réaliser les inserts dans
une session macOS autorisée avec le même build, puis refaire la répétition et la prise.
Ne pas remplacer ces démonstrations natives par du zoom CSS ou une image fixe.

### Caler une action sur sa phrase

Dans une scène, `at(0.42)` attend 42 % de la durée de sa narration ; `at("Créons les créneaux")`
attend le début de la phrase qui contient ces mots, mesuré sur le WAV de la prise
(`videos/lib/sentence-timing.ts`). Le rythme de la voix varie d'une génération à l'autre : un
pourcentage juste sur une prise tombe une demi-seconde trop tôt sur la suivante, ce qui a coûté
trois des quatre prises du pilote `SHIFT_RECURRENCE`.

- Une phrase s'arrête à « . », « ! », « ? », « … », « ; » ou « : » ; ses limites sont les pauses
  de la voix (FFmpeg `silencedetect`, au moins 120 ms sous -38 dB) les plus proches de ce que la
  longueur du texte prévoit. Sans pause à moins d'un quart du segment, la limite reste estimée.
- Le texte se compare sans majuscules, accents ni ponctuation, et doit désigner une seule phrase
  du segment, sinon la capture s'arrête.
- En répétition sans narration, les phrases sont réparties selon leur longueur.
- Les deux formes cohabitent : une action au milieu d'une phrase, sans pause pour la repérer,
  garde son pourcentage.
- Chaque attente sur une phrase est notée dans `timeline.json` (`anchors`). `video:validate`
  remesure ces phrases sur l'audio du rendu et refuse un clic ou une frappe placés après l'attente
  mais avant le début de sa phrase (120 ms de marge).

Tous les scénarios sont migrés : une action annoncée par une phrase attend cette phrase
(`at("<premiers mots de cette phrase>")`). Un pourcentage ne reste que là où l'action tombe au
milieu d'une phrase (commentaire `/* mid-sentence */`) ou dans une fonction partagée par plusieurs
scènes, qui ne sait pas de quelle narration il s'agit (`/* shared helper: scene-independent */`).
Les scénarios de `videos/lib/record-*.ts` typent leur paramètre avec `Cue` (`sentence-timing.ts`).

`videos/lib/__tests__/sentence-anchors.test.ts` vérifie que chaque `at("…")` désigne exactement
une phrase de sa scène (la plus proche `scene("id", …)` au-dessus) : une coquille ou une narration
modifiée sans son repère échoue en test, pas au milieu d'une prise.

### Adresses affichées : benevol.app, jamais localhost

Les liens à partager, QR codes, emails et adresses d'événement que montrent les vidéos sont ceux
de la production : `https://<espace>.benevol.app/…`. Ils viennent de `NEXT_PUBLIC_APP_URL`, que le
produit lit à l'exécution :

- `videos/tools/local-production.ts serve` (et `operator-local.ts`) sert la compilation avec
  `NEXT_PUBLIC_APP_URL=https://www.benevol.app` (sauf les deux captures HTTP décrites
  ci-dessous) ; un serveur lancé à la main doit recevoir la même
  valeur. `video:record` le vérifie avant de filmer (lien canonique de `/doc`) et refuse sinon.
- Chaque navigateur des outils vidéo passe par `launchVideoBrowser` (`videos/lib/public-hosts.ts`) :
  benevol.app et tous ses sous-domaines y sont redirigés vers un proxy TLS local, devant le serveur
  de capture. Un lien suivi pendant le scénario reste donc sur cette machine ; sans le proxy, le port
  est fermé et la navigation échoue, elle n'atteint jamais le vrai site. Le lanceur le prouve à
  chaque démarrage, sur une page servie par le proxy lui-même.
- Le navigateur continue de parler à `http://localhost:<port>` (sessions, `?org=`, contrôles côté
  Node). Les pages qui affichent leur propre hôte, comme « Adresse de votre espace » dans
  Paramètres, montrent donc encore `localhost:<port>`.

L'organisateur de l'organisation par défaut est `elodie.rochat@example.org` (« Élodie Rochat »), et non
plus `org-admin@localhost`. `videoAdminEmail()` remplace l'ancienne valeur d'un `.env.video.e2e`
existant, `make video-setup` et `video:build` passent la nouvelle aux seeds, et
`videos/tools/rename-video-admin.ts` renomme une fois le compte déjà créé dans la base vidéo :

```bash
node --env-file=.env.video.e2e --import tsx videos/tools/rename-video-admin.ts
```

Le scénario utilise les durées réelles des WAV lorsqu’elles existent, sinon les estimations du manifeste. Playwright produit `capture.webm` et `timeline.json`. Le pointeur, les clics et le titre de chapitre font partie du screencast.

Pour extraire quatre images réelles du MP4 par chapitre, dont le début de l'intertitre :

```bash
node --import tsx videos/tools/review-frames.ts MEMBERS_INVITATIONS
```

Le dossier `review-frames/` contient les images, leur index temporel et une planche de contrôle.
Cette planche aide à repérer un écran erroné ou vide ; elle ne remplace pas le visionnage intégral
avec la narration, ni un contrôle de la voix.

Les images citées comme preuve dans une revue (`videos/scripts/*.md`, `videos/*.md`) sont copiées
dans `videos/evidence/<slug>/` et versionnées ; le reste de `review-frames/` reste local.

### Contrôle audiovisuel assisté sur les données fictives

```bash
node --env-file=.env.video.e2e --env-file=.env.video.local --import tsx videos/tools/audit-audiovisual.ts EVENT_REPORTS
```

Cet outil examine des extraits du MP4 final avec leur son : phrases entendues, actions et
résultats visibles, horaires relatifs et défauts de synchronisation. Les rapports gardent
l'empreinte du MP4 et du prompt ; une capture remplacée exige une nouvelle revue. Le contrôle
est une aide automatisée, pas une validation humaine, et ses observations doivent être
confrontées aux images et au parcours réel. Un résultat signalé ne doit pas être ignoré au
motif que `video:validate` passe.

L'envoi visuel est limité aux vidéos dont le jeu fictif est vérifié (liste dans
`videos/tools/audit-audiovisual.ts`), dans la base locale `benevoles_video`.
Un garde-fou vérifie le jeu explicitement fictif (dont les trois événements des rappels) et les identifiants,
adresses `example.org` et téléphones de démonstration (ou leur absence pour le pointage) de chaque inscription. Aucune autre
vidéo, capture de production ou donnée réelle n'est acceptée. Les exports et les
imprévus ont leurs propres vérifications de périmètre, de fichiers ou d'emails
fictifs. L'API utilisée pour ces extraits
est distincte de celle du TTS ; le modèle de narration reste `gemini-3.8-flash-tts`.

Le contrôle de narration signale aussi les consignes de pause ajoutées à tort, même si
leur petit nombre laisse passer le seuil global d'erreur de mots. Le validateur recalcule
ce garde-fou sur les transcriptions enregistrées. Une transcription qui répète un
paragraphe doit être contre-vérifiée sur le son avant de conclure à une répétition du TTS.

Pour vérifier les paroles réellement présentes après montage (découpe, mixage et fin de
fichier compris), utiliser également l'audio extrait du MP4 final :

```bash
node --env-file=.env.video.local --import tsx videos/tools/audit-narration.ts TARGETED_MESSAGES --from-video
node --env-file=.env.video.local --import tsx videos/tools/audit-narration.ts VOLUNTEER_BADGES result --from-video
```

Ce mode écrit `narration-audit-video*.json` séparément des contrôles des WAV source,
conserve l'empreinte du MP4 et refuse un film modifié pendant le contrôle. Il ne prouve
pas la qualité du timbre, une syllabe bien articulée ou la synchronisation des clics :
ces points restent dans la revue audiovisuelle. Ne jamais l'exécuter pendant le montage.

## 4. Assembler le MP4 et les sous-titres

```bash
npm run video:assemble -- VOLUNTEER_REGISTER
```

FFmpeg place chaque phrase au repère enregistré, normalise la narration et produit :

- `volunteer-register-mobile.mp4` ;
- `volunteer-register-mobile.vtt` ;
- `volunteer-register-mobile.txt`.

Toutes les vidéos produites ou régénérées doivent inclure une musique discrète. Elle est configurée sans copier le morceau dans le dépôt :

```dotenv
# .env.video.local
VIDEO_MUSIC_PATH=/chemin/vers/musique.mp3
```

La musique doit rester faible mais audible, sans jamais gêner la narration. L'assemblage (`videos/lib/music-levels.ts`) :

- ne boucle que la partie stable du morceau, de 0,5 s à 95 s, avec un fondu enchaîné de 2 s à chaque raccord : le morceau entier (102,4 s) finit par son propre fondu, ce qui laissait un trou de musique (jusqu'à -77 LUFS) dans toute vidéo de plus de 100 s ;
- nivelle d'abord la narration : chaque chapitre ramené à la même intensité (-18 LUFS), puis un compresseur doux égalise les phrases faibles et fortes d'un même chapitre, avant la normalisation de la voix à -16 LUFS. Sur PLATFORM_INTERNAL_ADMINISTRATION (479 s), la voix variait de 9,9 LU d'une fenêtre de 3 s à l'autre, plus que la bande de 8 LU qu'une musique constante peut tenir ; nivelée, 6,3 LU. Les gains par chapitre sont notés dans `audio-levels.json` ;
- compresse le morceau puis le joue à un niveau constant, fondu au début (1,5 s) et à la fin (2 s). Le mix final n'est plus renormalisé (un `loudnorm` dynamique remontait la musique d'environ 5 LU dans chaque pause) : un limiteur de crête suffit. Pas d'atténuation sous la voix (ducking) : mesurée sur SHIFT_RECURRENCE, elle élargissait l'écart entre voix et musique au lieu de le tenir, en baissant davantage la musique sous les phrases fortes ;
- mesure le résultat et refuse de terminer si la règle n'est pas tenue : par fenêtres de 3 s, là où la voix parle, la musique reste entre 12 et 20 LU sous la voix (comparées sur les instants où la voix parle) ; là où personne ne parle, le mix ne descend pas sous -36 LUFS et ne monte pas au-dessus de 12 LU sous le niveau médian de la voix (une pause ne doit pas sonner plus fort que la narration). Les niveaux sont relevés image par image selon leur horodatage : ffmpeg écrit « M: nan » sur un silence numérique, et ignorer ces lignes décalait toute la suite (6 s en fin de EVENT_CREATE_TEMPLATE). Les chiffres, fenêtre par fenêtre, vont dans `audio-levels.json`, lié au MP4 par son empreinte.

Un manifeste peut activer `narrationStaticNormalization: true` si la normalisation dynamique crée une rampe de gain indésirable. L’assembleur mesure alors la voix nivelée et compressée avant d’appliquer un gain fixe vers -16 LUFS ; ce gain figure dans `audio-levels.json`. La règle musicale reste identique.

`npm run video:validate` refait la même vérification à partir de `audio-levels.json` et échoue s'il manque ou s'il a été mesuré sur un autre rendu. Une vidéo assemblée avant cette règle doit donc être assemblée à nouveau. Vérifier les droits de diffusion avant toute publication.

Le morceau retenu est `mixkit-tech-house-vibes-130.mp3`. Chaque clic et chaque touche réellement enfoncée doivent également recevoir un son doux, calé sur l'interaction enregistrée, sans masquer la narration. Cette exigence fait partie du contrôle final ; elle ne signifie pas que les anciennes vidéos disposent déjà de ces effets. Sans repères d'interaction fiables, refaire la capture plutôt qu'estimer les timings.

Le recorder enregistre désormais les événements `pointerdown` et `keydown` dans `timeline.json` (version `inputAudioVersion: 1`), sans valeurs de touches ni texte saisi. L'assemblage synthétise localement deux sons distincts dans `input-effects.wav`, les mélange à la voix et à la musique, et écrit les nombres d'interactions ainsi que les empreintes des fichiers dans `audio-mix.json`. Il refuse une capture sans repères ou une musique non configurée. Le contrôle unitaire se lance avec `node --import tsx videos/tools/check-input-audio.ts`.

Une fois les WAV générés, les étapes 3 et 4 peuvent être lancées ensemble :

```bash
npm run video:pilot
```

Pour la vidéo organisateur :

```bash
npm run video:organizer
```

Pour le tour des fonctionnalités :

```bash
npm run video:features
```

Pour le suivi des inscriptions et les relances :

```bash
npm run video:followup
```

## 5. Publier sur medias.benevol.app

Les rendus ne vont jamais dans Git ni dans l'image de l'application : ils sont servis par
`https://medias.benevol.app` (`k8s/media.yaml`, un nginx et son volume). Après avoir créé ou
régénéré une vidéo :

```bash
make video-publish KUBE_CONTEXT=<contexte> ID=EVENT_CREATE_BLANK          # aperçu
make video-publish KUBE_CONTEXT=<contexte> ID=EVENT_CREATE_BLANK APPLY=1  # envoi
```

Sans `ID` ni `IDS`, tout le catalogue est comparé. Seuls les fichiers nouveaux ou modifiés partent
(`<slug>/<slug>.mp4`, `.vtt`, `.txt`, et les affiches `<slug>.jpg` et `<slug>-og.jpg`, comparés par
SHA-256 avec ceux du serveur) ; rien n'est jamais
supprimé sur le serveur, et une vidéo pas encore rendue en local est simplement signalée.
`KUBE_CONTEXT` est obligatoire : la commande écrit sur le cluster de production. Si `kubectl` ne
joint pas le serveur de médias (mauvais contexte, `k8s/media.yaml` pas encore appliqué), elle
s'arrête sans rien envoyer.

Le serveur n'autorise que `benevol.app` et ses sous-domaines en CORS (nécessaire aux sous-titres
chargés depuis un autre domaine), sert les types `video/mp4`, `text/vtt` et `image/jpeg`, accepte les requêtes
partielles (avancer dans la vidéo) et ne liste pas les dossiers. Son volume n'est pas sauvegardé :
tout se régénère depuis les sources de ce dossier ; gardez votre copie de `videos/output`.

### Affiches et durée réelle (`videos/renders.json`)

Après un rendu, et avant de publier, générez les affiches de la vidéo :

```bash
node --import tsx videos/tools/posters.ts EVENT_CREATE_BLANK                       # une vidéo
node --import tsx videos/tools/posters.ts                                          # toutes les vidéos publiées
node --import tsx videos/tools/posters.ts --input /chemin/vers/videos/output       # rendus d'un autre dossier
```

L'outil (FFmpeg et FFprobe du système, avec l'encodeur JPEG) prend une image au tiers de la vidéo,
ou à `posterAtMs` (millisecondes) si le manifeste le précise, en choisissant la plus représentative
des 48 images suivantes (filtre `thumbnail`, pour éviter une transition). Il écrit dans
`videos/output/<slug>/` (ignoré par Git) :

- `<slug>.jpg` : l'affiche au format de la vidéo (1280 x 800, ou 390 x 844 pour une vidéo
  mobile), montrée par le lecteur avant la lecture et utilisée comme miniature par les moteurs de
  recherche ;
- `<slug>-og.jpg` : la même image dans un cadre de 1200 x 630 sur fond bleu, pour les aperçus de
  lien (WhatsApp, X, LinkedIn...).

Il met aussi à jour `videos/renders.json` (versionné, copié dans l'image) : durée réelle du MP4,
taille de l'image, et `poster: true`. L'application ne référence une affiche que si ce fichier le
dit : sans entrée, pas d'affiche (jamais d'image cassée) et la durée reste l'estimation du
manifeste. Publiez donc les affiches (`make video-publish … APPLY=1`) avant de déployer un
`renders.json` qui les annonce.

Les affiches doivent venir des MP4 réellement publiés, pas d'un rendu local plus ancien : au
besoin, téléchargez-les depuis `https://medias.benevol.app/<slug>/<slug>.mp4` dans un dossier et
passez-le à `--input`. `POSTERS_ONLY=1` (`--posters-only`) n'envoie alors que les deux affiches,
sans jamais renvoyer une vidéo, ses sous-titres ou sa transcription :

```
make video-publish KUBE_CONTEXT=<contexte> POSTERS_ONLY=1           # aperçu
make video-publish KUBE_CONTEXT=<contexte> POSTERS_ONLY=1 APPLY=1   # envoi
```

## Bibliothèque vidéo publique (`/videos`, #644)

`src/lib/video-catalog.ts` lit `catalog.json`, `renders.json`, les manifestes et les scripts
(server-only, au build et à la requête) pour alimenter `/videos` (galerie) et `/videos/[id]`
(détail, l'identifiant stable ; le slug du manifeste redirige vers l'identifiant).

Depuis le 2026-10-07, la bibliothèque est publique et référencée (`src/lib/video-seo.ts`) :

- une vidéo publiée **et** jouable (`VIDEO_MEDIA_BASE_URL` défini, la même condition que le
  lecteur) est indexée ; une vidéo « À venir » garde `noindex` ;
- canonique absolue `https://www.benevol.app/videos/<ID>` (jamais le slug, ni un paramètre, ni un fragment),
  construite sur `NEXT_PUBLIC_APP_URL` lu à l'exécution (pages rendues à la requête) ;
- données structurées `VideoObject` (titre, résumé, affiches, date `updatedAt`, durée ISO 8601,
  MP4, langue, transcription, éditeur) et `BreadcrumbList` ; sur la galerie, `CollectionPage` et
  `ItemList` des vidéos indexées ;
- aperçus de lien : Open Graph `video.other` (affiche 1200 x 630, `og:video` vers le MP4, avec sa
  taille) et carte X `summary_large_image` (pas de `twitter:player` : aucune page de lecteur
  intégrable) ; la galerie a sa propre image (`/videos/og-image.png`) ;
- sitemap vidéo `/video-sitemap.xml` (extension vidéo de Google), cité dans `robots.txt`, servi
  sur le domaine principal seulement ;
- liens « Tutoriels vidéo » dans le pied de page public, sur `/doc` et sur `/fonctionnalites`
  (`content/pages/FEATURES.md`).
- le téléphone de l'accueil de benevol.app joue `VOLUNTEER_REGISTER` sur place (#765,
  `src/lib/home-signup-video.ts`) : la dépublier ou la renommer rend au téléphone son image fixe.

Champs du catalogue ajoutés par #644, en plus de `id`, `manifest`, `category`, `tags`, `published`
et `seedScenario` (#637, #638) :

- `themes` (tableau d'identifiants, non vide) : un ou plusieurs des neuf thèmes du carrousel
  (`videos/MASTERCLASS_PLAN.md`, « Organisation du carrousel » ; registre complet dans
  `src/lib/video-catalog.ts`, `THEMES`). Une vidéo peut appartenir à plusieurs thèmes sans être
  dupliquée dans le catalogue (principe « un seul catalogue », #645).
- `audience` (tableau non vide parmi `organisateur`, `benevole`, `super-admin`).
- `level` (optionnel parmi `decouverte`, `intermediaire`, `avance`) : aucune vidéo n'en a
  aujourd'hui, le plan ne donnant pas encore de niveau par module.
- `feature` : le nom de la fonctionnalité Benevol illustrée (texte simple aujourd'hui, pas encore
  un lien vérifié vers une ancre de `content/pages/FEATURES.md` ou `content/guide/GUIDE_ADMIN.md`).
- `updatedAt` (`AAAA-MM-JJ`) et `revision` (entier ≥ 1) : `revision` identifie le rendu sur
  lequel portent les réponses « utile ? » (#646, voir plus bas). L'augmenter quand une vidéo est
  entièrement régénérée : ses réponses repartent de zéro.
- `added`, `updated` (facultatifs, `AAAA-MM-JJ`) et `new` (facultatif, seulement `false`) : comme
  dans l'en-tête d'une fiche (#763), « Nouveau » ou « Mis à jour » sur la carte de la galerie et
  sur la page de la vidéo pendant 30 jours. Jamais déduits de `updatedAt` ou de `revision`, qui
  bougent à chaque rendu : à renseigner quand le changement mérite d'être signalé.

`published` vaut `true` pour une vidéo dont le film est en ligne sur `medias.benevol.app`. La galerie affiche aussi
les vidéos non publiées, avec leur état (« À venir »). Les
guides publics renvoient aux vidéos publiées par leur
identifiant (`<!-- video: ID -->`, #645, `src/lib/doc-video-references.ts`). `filterPublishedVideos(videos, VIDEO_LIBRARY_PUBLIC_ONLY)` filtre déjà sur
`published` : passer la constante `VIDEO_LIBRARY_PUBLIC_ONLY` (dans `video-catalog.ts`) à `true`
est le seul changement nécessaire pour ne montrer que les vidéos publiées, le jour venu.

La durée affichée est celle du MP4 mesurée par `videos/tools/posters.ts` (`renders.json`) ; à
défaut, celle de `videos/output/<slug>/audio-metadata.json` (présent dans un checkout seulement,
jamais dans l'image) ; à défaut, la somme des `fallbackDurationMs` des segments du manifeste.

### Lecture des médias (`VIDEO_MEDIA_BASE_URL`)

Les fichiers rendus ne sont jamais dans Git ni dans l'image : la page construit leurs URLs à partir
de `VIDEO_MEDIA_BASE_URL` (`src/lib/env.ts`, voir `docs/configuration.md`) —
`<base>/<slug>/<slug>.mp4`, `.vtt`, `.txt` (et `.jpg`, `-og.jpg` quand `renders.json` annonce
les affiches). Sans la variable, ou si le rendu d'une vidéo précise
n'existe pas encore sur le serveur de médias, la page affiche « Vidéo bientôt disponible » :
jamais de sonde réseau côté serveur (build ou requête) ; côté navigateur, l'échec de chargement de
la balise `<video>` (`onError`) retombe sur le même message.

Le lecteur (`<video crossOrigin="anonymous">`) charge la vidéo et ses sous-titres (`<track>`)
depuis un autre domaine que `www.benevol.app` : `medias.benevol.app` doit répondre avec
`Access-Control-Allow-Origin` (voir « 5. Publier sur medias.benevol.app » ci-dessus, et
`k8s/media.yaml`) et les bons `Content-Type` (`video/mp4`, `text/vtt`). Les sous-titres sont
disponibles mais désactivés par défaut (décision du propriétaire) : la piste `<track>` reste
sélectionnable depuis le menu natif du lecteur, et le transcript est toujours affiché en texte
sous le lecteur, donc WCAG 1.2.2 reste respecté sans sous-titres activés d'office. En local, deux
options équivalentes :

- `make video-media-serve` (`scripts/serve-video-media.mjs`, sans dépendance) sert `videos/output`
  sur `http://localhost:4870` avec les mêmes en-têtes CORS et `Content-Type` que `k8s/media.yaml` ;
- ou pointer `VIDEO_MEDIA_BASE_URL` vers une copie locale du nginx de `k8s/media.yaml`.

```dotenv
VIDEO_MEDIA_BASE_URL="http://localhost:4870"
```

Aucune Content-Security-Policy n'existe aujourd'hui dans l'application : rien à y ajouter pour ce
domaine séparé.

### Lecture automatique

La vidéo démarre seule, avec le son, uniquement en arrivant sur sa page de détail depuis une
carte de la galerie ou un lien « Vidéos liées » de la même session — jamais sur une URL tapée, un
lien externe ou un rechargement — et jamais avec `prefers-reduced-motion: reduce` (décision du
propriétaire, `src/lib/video-autoplay.ts`). Pas de paramètre dans l'URL (qui la rendrait
partageable avec lecture automatique) : `AutoplayLink.tsx` pose un indicateur dans
`sessionStorage` juste avant la navigation, que le lecteur lit puis efface une seule fois au
montage (`consumeAutoplayIntent`), et appelle `video.play()` sans l'attribut `autoplay` ; un refus
du navigateur (politique de lecture automatique) est simplement ignoré, la vidéo reste en pause,
prête pour « Lecture ».

### « Cette vidéo vous a-t-elle été utile ? » (#646)

Sous le lecteur de `/videos/[id]`, toujours visible (pas seulement à la fin de la lecture), deux
boutons **Oui** et **Non**, sans commentaire (« tu » pour une vidéo destinée seulement aux
bénévoles, « vous » sinon). `POST /api/public/video-feedback` enregistre une ligne anonyme
(`VideoFeedback`) : identifiant et `revision` de la vidéo (refusée si ce n'est pas la révision
actuelle du catalogue), langue (`fr`, tirée du manifeste), réponse, contexte de lecture et jour.
Ni adresse IP, ni cookie, ni compte, ni organisation : la limitation de fréquence par IP reste en
mémoire du processus, et le navigateur retient dans `localStorage` qu'il a déjà répondu pour cette
vidéo et cette révision (au mieux). Les réponses sont effacées après la durée de
`RETENTION_DAYS.videoFeedback` (`src/lib/retention.ts`, `docs/retention.md`).

Contexte de lecture : `masterclass` par défaut ; `documentation` quand la page est ouverte avec
le fragment `#doc`, que portent les liens des guides vers une vidéo (#645), par exemple
`/videos/EVENT_CREATE_BLANK#doc` (`FROM_DOC_FRAGMENT` dans `src/lib/video-feedback.ts`, lu dans le
navigateur au moment de répondre). Un fragment et non un paramètre : il n'arrive pas au serveur et
les robots l'ignorent, la vidéo garde une seule URL. L'ancien `?from=doc` est redirigé (308) vers
`/videos/<ID>#doc`. Le fragment est gardé lors de la redirection d'un slug. Le lecteur
ouvert sur place dans une fiche de documentation (`/doc/<fiche>`) répond directement en
`documentation`.

Les super admins voient Oui, Non et total par vidéo et par révision dans **Super Admin → Avis sur
les vidéos** (`/super-admin/video-feedback`) ; aucun score n'est montré au public.

## Ajouter une vidéo

1. Choisir un identifiant sémantique stable, par exemple `EVENT_CREATE`, sans langue ni numéro.
2. Déclarer cet identifiant, son manifeste, sa catégorie et ses tags dans `videos/catalog.json`.
3. Écrire le script humain dans `videos/scripts/`.
4. Ajouter son manifeste dans `videos/manifests/`, avec le même `id` que le catalogue.
5. Ajouter un scénario de capture dans `videos/lib/record-*.ts` et le déclarer dans `videos/tools/record.ts`.
6. Relire le transcript avec `--dry-run`.
7. Générer la voix, enregistrer, assembler et visionner le résultat complet.
8. Lancer `npm run video:validate -- VIDEO_ID` : le contrôle refuse plusieurs prises vocales,
   une voix différente du manifeste, une scène manquante ou un décalage audio/vidéo important.
9. Vérifier ensuite humainement les sous-titres, le rythme, les données fictives, la lisibilité
   mobile et l’exactitude de l’interface avant publication. Le contrôle automatique ne remplace
   pas ce visionnage.

Cette vérification humaine est à la charge de l’agent qui génère la vidéo, avant toute livraison :
il visionne le MP4 avec le son et contrôle notamment que chaque action commence sur la phrase qui
la décrit. Une durée audio et une durée de scène identiques ne prouvent pas cette synchronisation
sémantique.

Avec la pile vidéo et le serveur déjà démarrés, la chaîne complète se lance par identifiant :

```bash
make video ID=ORG_FIRST_STEPS
make videos IDS="ORG_FIRST_STEPS VOLUNTEER_REGISTER"
```

`make videos` sans `IDS` reconstruit tout le catalogue. Le Makefile ne contient que
l'orchestration ; le seed, la voix, la capture et l'assemblage restent dans les outils dédiés.

**`make videos-changed` (reporté, #639).** Reconstruire seulement les vidéos dont les sources ont
changé demanderait une empreinte par vidéo de tout ce qui influence son rendu : son manifeste, son
script, le scénario de `tools/record.ts` qui la concerne, les outils communs et, surtout, l'interface
de l'application qu'elle filme. Les trois premiers se hachent facilement (SHA-256 des fichiers,
empreinte notée dans `videos/output/<slug>/` après un rendu réussi). Le dernier non : une vidéo
devient obsolète quand l'écran qu'elle montre change, ce qu'aucun fichier de `videos/` ne révèle.
Une commande qui ne regarderait que les sources donnerait donc une fausse assurance. En attendant,
on régénère par identifiant (`make video ID=…`) quand un changement d'interface touche un écran
filmé, puis on publie (`make video-publish`), qui ne renvoie que les fichiers réellement modifiés.

### Capture HTTP et contrôle d’origine (#1062, lot 25-2)

Les captures `LAST_MINUTE_CHANGES` et `PLATFORM_INTERNAL_ADMINISTRATION` utilisent
respectivement `http://localhost:43102` (`local-production.ts serve-capture`) et
`http://localhost:43104` (`operator-local.ts serve`) comme
`NEXT_PUBLIC_APP_URL` à l’exécution. Le build commun utilise la première origine.
`src/lib/urls.ts` lit la variable par nom dynamique, y compris depuis le proxy ;
le port opérateur est donc lu à l’exécution. La configuration de build conserve
aussi le schéma HTTP pour toute expression publique susceptible d’être intégrée.
Le recorder contrôle le canonique local pour ces deux captures. Les autres prises
restent soumises au contrôle du domaine public. Aucun contrôle produit n’est modifié.

Après compilation vérifiée et seed, lancer `check-batch25-origin.ts` (et son
argument `operator` pour 43104), avec `.env.video.e2e`. Le navigateur fait un
POST JSON réel : aperçu sans envoi côté organisation, corps vide refusé par la
validation côté opérateur. Une page fictive étrangère servie localement soumet
ensuite un formulaire : son véritable Origin doit être refusé avec 403.
Les liens locaux éventuellement visibles restent à signaler à la revue finale.

Pour rejouer la vidéo opérateur après suppression visuelle du quatrième espace,
`scripts/seed-video-operator.ts --reset-owned` remet les trois espaces initiaux
à zéro puis les recrée. Il exige le marqueur de la base opérateur locale, les
identités exactes (3 espaces, 4 comptes, 3 événements, 9 membres), aucune
inscription ni tâche et uniquement les communications de cette formation.
Toute donnée inconnue arrête le reset. Les essais interrompus avec un quatrième
espace passent d’abord par la remise à zéro ciblée du recorder existant.

### Reprise opérateur : adresses publiques via la passerelle locale (lot 26)

La compilation conserve l’origine HTTP du lot 25-2 et `operator-local.ts serve`
permet toujours les contrôles d’origine sur 43104. Après ces contrôles, arrêter
ce PID et lancer `operator-local.ts serve-public <copie>` pour filmer les liens :
ce mode utilise `https://www.benevol.app` à l’exécution. Avec
`VIDEO_OPERATOR_PUBLIC=1`, le recorder vérifie toujours le PID et le BUILD_ID
sur 43104, mais navigue sur les hôtes publics via le proxy TLS local vérifié.
La passerelle CONNECT réservée à benevol.app permet aussi aux requêtes de
contrôle Playwright de rester locales. Aucun Origin, écran ou résultat produit
n’est réécrit. Les liens d’activation et la redirection d’ancien slug viennent
ainsi du produit et sont vérifiés sur leurs véritables adresses publiques.

### Reprise opérateur : cadrage du vrai message (lot 27-2)

Mailpit 1.30.3 impose une date anglaise dans ses en-têtes, même avec le navigateur
et son processus en français. Le montage opérateur utilise les intervalles du
vrai écran Mailpit, détectés image par image dans la capture brute, pour cadrer
le corps reçu (x=320, y=224, 960×576), sans cet en-tête ni la liste latérale.
Aucun contenu d’email ni état produit n’est réécrit, aucune image fixe n’est
ajoutée. La capture brute et `review/mailpit-focus-proof.json` restent conservées ;
la revue vérifie aussi les transitions et la lisibilité du message complet.

### Qui est inscrit (lot 29, interface refondue)

`SHIFT_ROSTER_VISIBILITY` utilise le build main vérifié sur 43102, servi avec
`local-production.ts serve`, et sa propre organisation fictive `formation-roster`.
Le recorder navigue sur les domaines publics via la passerelle TLS locale, y compris
pour les écritures et le véritable lien reçu dans Mailpit. Avant chaque répétition
et chaque prise, réinitialiser uniquement cette formation et ses messages :

```bash
node --env-file=.env.video.e2e --import tsx videos/tools/local-production.ts run scripts/seed-video-shift-roster.ts
node --env-file=.env.video.e2e --import tsx videos/tools/local-production.ts run videos/tools/record.ts SHIFT_ROSTER_VISIBILITY --rehearse --quick-rehearse
# Refaire le seed, puis retirer les deux options pour la prise narrée.
```

Le seed conserve uniquement cette organisation fictive. Le défaut de l’organisation et
le réglage de l’événement sont activés. Claire n’a pas accepté ; Bruno et David ont
un accord V1 ; Emma est mineure connue et reste masquée malgré son choix fictif.
Gina a une invitation ouverte et aucune inscription. Aline s’inscrit et confirme
réellement depuis le message reçu. Le recorder vérifie le défaut du formulaire neuf,
la note de publication, la carte limitée aux propres créneaux, Liste et Frise,
l’accès avant inscription, l’élargissement V1 explicite et le retrait.
Le montage cadre le véritable corps Mailpit sans modifier le message.

### Pile isolée sur des ports alternatifs (lot 30)

Ne jamais reprendre ni arrêter un conteneur existant pour libérer un port. Le lot 30
utilise ses propres conteneurs PostgreSQL sur **45434**, SMTP sur **41030**, Mailpit
sur **48030**, et le serveur produit vérifié sur **43102**. `DATABASE_URL` désigne
uniquement `benevoles_video` sur ce PostgreSQL local ; `VIDEO_SMTP_PORT=41030` et
`VIDEO_MAILPIT_URL=http://localhost:48030` doivent être présents dans le serveur,
le seed et le recorder. Le proxy n'accepte que l'origine Mailpit locale configurée.
Les valeurs historiques restent les valeurs par défaut pour les autres lots.

Après le seed principal sur cette base neuve, utiliser le même build vérifié et
les mêmes commandes de seed/répétition/prise que ci-dessus. Le contrôle du PID,
du répertoire standalone et des deux BUILD_ID prouve le serveur réellement filmé.
La narration et les sources du lot 30 décrivent les interrupteurs de #1083 et
le clavier de la Frise de #1088 : un arrêt Tab par jour, flèches entre les barres.
La vidéo d'accessibilité exige toujours ses inserts natifs ; un refus TCC laisse
son statut NOT READY et l'écart #1075 ouvert.


### Reprise du lot 32 : fonctions bêta et confidentialité

Le build propre de main inclut #1206. Les conteneurs de cette reprise sont dédiés :
PostgreSQL **45436**, SMTP **41033**, Mailpit **48033**, serveur vérifié **43102**.
Ne pas reprendre les conteneurs historiques du port 45433. Transmettre
`VIDEO_SMTP_PORT=41033` et `VIDEO_MAILPIT_URL=http://localhost:48033` au serveur,
aux seeds et aux outils. Le client Prisma du snapshot est généré sur son schéma
courant ; les outils peuvent y tourner sans régénérer `src/generated` du checkout.

Les prises BETA_ACCESS, SECTORS, SHIFT_SWAPS, SECTOR_LEADERS et
PRIVACY_PERSONAL_LINKS naviguent sur les domaines publics via la passerelle locale
vérifiée, avec le même contrôle du PID et du BUILD_ID. Cela permet les vraies
écritures depuis le navigateur sans présenter une origine localhost au produit.
Les seeds bêta restent limités à leurs capacités ; la protection des pauses et de
la charge n'est jamais ouverte par ces scénarios.

Avant chaque répétition ou prise de SECTOR_LEADERS : seed démo, seed
`sector-leaders`, puis `prepare-registration-mailbox.ts sector-leaders` (le port
45436 est admis pour ce seul scénario). Le recorder nettoie séparément les emails
de la fixture bêta. Pour PRIVACY, les précontrôles `prepare-privacy.ts` et
`verify-privacy-details.ts` passent d'abord via `local-production.ts run` ; rejouer
ensuite le seed `privacy-personal-links` avant la répétition et avant la prise,
en conservant le rapport de précontrôle. Les dates de cette fixture sont à deux
semaines de la prise, sans date fixe devenue passée.

Les montages SHIFT_SWAPS, SECTOR_LEADERS et PRIVACY cadrent le corps réel Mailpit
(x=320, y=264, 960×536), comme la vidéo du planning partagé. Les intervalles sont
mesurés image par image dans la capture brute ; aucun contenu reçu n'est réécrit,
aucune image fixe n'est ajoutée. Le rapport conserve l'empreinte de la capture.
`audit-full-final-audio.ts ID` complète les audits de chapitres par une ASR sans
texte attendu de la bande-son entière, transitions et musique comprises. Son
contrôle du registre utilise les frontières Unicode : « bêta » ne contient pas
le mot « ta ». Les correspondances restent à relire en contexte.

### Lot 33 : reprises autorisées et première protection de la charge

Le lot 33 utilise PostgreSQL **45437**, SMTP **41034**, Mailpit **48034** et le
serveur vérifié **43102**. Les ports historiques et leurs conteneurs restent
intacts. Installer les dépendances du lockfile dans la copie jetable avant le
build vérifié ; les dépendances déjà présentes dans le worktree peuvent être
plus anciennes que celles de `main`. Les outils tournent avec le client Prisma
généré dans cette copie, sans régénérer `src/` du worktree.

`WORKLOAD_PROTECTION` utilise son organisation `formation-charge`. Son seed
ouvre seulement `workloadProtection` dans la liste bêta globale : filmer les
reprises bêta précédentes avant de le lancer. Faire une première répétition
`--rehearse --quick-rehearse`, puis re-semer avant chaque prise narrée. Conserver
la page d'édition ouverte entre la saisie des valeurs et l'activation : les
valeurs de la carte restent locales à cette page jusque-là.

`audit-whole-voice.ts ID` complète les audits de chapitres par une observation
audio du master continu entier, conclusion comprise. Il conserve son empreinte
et refuse plusieurs générations ou un changement de voix signalé ; il ne
remplace ni l'ASR indépendante ni la revue du MP4 final. Les contrôles
`audit-audiovisual.ts` et `audit-full-final-audio.ts` acceptent désormais la
fixture WORKLOAD explicitement vérifiée.

### Lot 34 : terminer la protection de la charge

`WORKLOAD_PROTECTION` utilise une pile dédiée : PostgreSQL **45438**, SMTP
**41035**, Mailpit **48035**, serveur vérifié **43102**. Les conteneurs des lots
précédents restent intacts. Transmettre `VIDEO_SMTP_PORT=41035` et
`VIDEO_MAILPIT_URL=http://localhost:48035` au serveur et aux outils. Le seed
`seed-video-scenario.ts workload-protection` précède chaque répétition et prise.
Le recorder exige que le titre, l'état activé et « 1 programme à revoir » soient
tous dans le cadre final, et vérifie les valeurs 6 h / 30 min / 8 h puis 20 h / 3 h.

### Lot 35 : charge et propositions d'affectations

La pile dédiée utilise PostgreSQL **45439**, SMTP **41036**, Mailpit **48036**,
avec le serveur **43102** construit depuis le main courant et vérifié par PID et
BUILD_ID. Les conteneurs historiques ne sont pas réutilisés. Le wrapper
`local-production.ts run` admet les seeds `workload-protection` et
`assignment-proposals` et leurs recorders/revues sur cette seule base.

Filmer WORKLOAD_PROTECTION en premier : le seed des propositions remplace la
liste bêta globale. Refaire le seed correspondant avant chaque répétition et
chaque prise. Dans Inscriptions, le recorder centre les deux lignes de Sarah,
attend leur stabilisation et exige que les deux lignes entières soient dans le
viewport. La narration Kore existante est conservée si son texte reste identique.

ASSIGNMENT_PROPOSALS conserve la graine saisie **2026** et mesure le délai réel
jusqu'aux affectations écrites. `verify-proposals-review-fixture.ts` vérifie
l'organisation dédiée, ses douze membres fictifs, les quatorze créneaux, les trois
lieux et l'absence d'inscription publiée avant l'envoi à la revue audiovisuelle.
Le verrouillage et la correction restent de vraies écritures en brouillon ;
la confirmation de publication est annulée.


### Lot 37 : disponibilités datées côté bénévole et propositions

Pile dédiée : PostgreSQL **45441**, SMTP **41038**, Mailpit **48038** et serveur
produit vérifié **43102**. Le wrapper charge les outils avec le client Prisma
généré dans la copie jetable vérifiée, sans régénérer `src/` du worktree.
Rejouer le seed `volunteer-event-availability` ou `assignment-proposals` avant
chaque répétition et chaque prise : chacun remplace la liste bêta globale.

La première proposition utilise maintenant sa graine interne par défaut ; aucun
numéro n'est saisi ni montré. Le bouton « Proposer une autre répartition » et
son indication sont montrés sans clic. Les deux narrations sont des générations
Kore entières. Le tutoiement est attendu pour la vidéo exclusivement bénévole.

Le message de Morgane est demandé par la vraie route organisateur après chaque
seed neuf, puis ouvert avant le premier chapitre. Son sujet sur deux lignes
exige un cadrage sous les onglets Mailpit : x=320, y=312, 960×488. Le cadrage
s'applique aux pixels réels de la capture, sans modifier le message.
Les iframes Mailpit bloquent le script d'instrumentation initial : `tap` conserve
alors l'horodatage de l'envoi du véritable `mouse.down()` sur le bouton, relayé et
dédoublonné avant l'effet sonore. Aucun clic n'est inventé.
