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
au serveur de développement ni déployer. `local-production.ts serve <copie>`
sert le build standalone avec ses assets copiés. La copie doit être construite
depuis le même code que le tournage. `local-production.ts build <copie>` compile
cette copie avec le domaine réservé `http://video.invalid` ; les assets doivent
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

`PRIVACY_PERSONAL_LINKS` utilise aussi cette copie. Le domaine réservé évite le
double `?` de l'email d'invitation sous localhost (`?org=…?token=…`). Ne pas réparer
le lien reçu dans le recorder : générer le vrai message avec la configuration de
formation. Aucun accès réseau à `video.invalid` n'est nécessaire : seuls les
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
narration. L'entrée opérateur du catalogue est interne et reste non publiée.

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

L'envoi visuel est pour l'instant limité à `EVENT_REPORTS`, `VOLUNTEER_BADGES`,
`ATTENDANCE_CHECK_IN`, `REMINDERS_CHANGES`, `DATA_EXPORTS_ARCHIVES` et
`LAST_MINUTE_CHANGES`, dans la base locale `benevoles_video`.
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

Elle est bouclée si nécessaire, placée à 7,5 % sous la voix, puis fondue au début et à la fin. Vérifier les droits de diffusion avant toute publication.

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
(`<slug>/<slug>.mp4`, `.vtt`, `.txt`, comparés par SHA-256 avec ceux du serveur) ; rien n'est jamais
supprimé sur le serveur, et une vidéo pas encore rendue en local est simplement signalée.
`KUBE_CONTEXT` est obligatoire : la commande écrit sur le cluster de production. Si `kubectl` ne
joint pas le serveur de médias (mauvais contexte, `k8s/media.yaml` pas encore appliqué), elle
s'arrête sans rien envoyer.

Le serveur n'autorise que `benevol.app` et ses sous-domaines en CORS (nécessaire aux sous-titres
chargés depuis un autre domaine), sert les types `video/mp4` et `text/vtt`, accepte les requêtes
partielles (avancer dans la vidéo) et ne liste pas les dossiers. Son volume n'est pas sauvegardé :
tout se régénère depuis les sources de ce dossier ; gardez votre copie de `videos/output`.

## Bibliothèque vidéo interne (`/videos`, #644)

`src/lib/video-catalog.ts` lit `catalog.json`, les manifestes et les scripts (server-only, au
build et à la requête) pour alimenter `/videos` (galerie) et `/videos/[id]` (détail, l'identifiant
stable ; le slug du manifeste redirige vers l'identifiant). Cette page n'est référencée nulle part
(pas de navigation, pas de sitemap, `robots: noindex,nofollow`, et `robots.ts` l'exclut aussi) :
c'est un outil interne pour revoir le catalogue, pas encore la bibliothèque publique.

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
  un lien vérifié vers une ancre de `FEATURES.md` ou `GUIDE_ADMIN.md`).
- `updatedAt` (`AAAA-MM-JJ`) et `revision` (entier ≥ 1) : `revision` identifie le rendu sur
  lequel portent les réponses « utile ? » (#646, voir plus bas). L'augmenter quand une vidéo est
  entièrement régénérée : ses réponses repartent de zéro.

`published` vaut `true` pour une vidéo dont le film est en ligne sur `medias.benevol.app` : 55 des
58 vidéos aujourd'hui. La galerie affiche aussi les trois autres, avec leur état (« À venir »). Elle
n'est pas dans la navigation du site, mais les guides publics renvoient aux vidéos publiées par leur
identifiant (`<!-- video: ID -->`, #645, `src/lib/doc-video-references.ts`). `filterPublishedVideos(videos, VIDEO_LIBRARY_PUBLIC_ONLY)` filtre déjà sur
`published` : passer la constante `VIDEO_LIBRARY_PUBLIC_ONLY` (dans `video-catalog.ts`) à `true`
est le seul changement nécessaire pour ne montrer que les vidéos publiées, le jour venu.

La durée affichée vient de la somme des `fallbackDurationMs` des segments du manifeste, sauf si
`videos/output/<slug>/audio-metadata.json` existe déjà (rendu réel) : dans ce cas la durée mesurée
par FFprobe est utilisée.

### Lecture des médias (`VIDEO_MEDIA_BASE_URL`)

Les fichiers rendus ne sont jamais dans Git ni dans l'image : la page construit leurs URLs à partir
de `VIDEO_MEDIA_BASE_URL` (`src/lib/env.ts`, voir `docs/configuration.md`) —
`<base>/<slug>/<slug>.mp4`, `.vtt`, `.txt`. Sans la variable, ou si le rendu d'une vidéo précise
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
`?from=doc`, à ajouter aux liens des guides vers une vidéo (#645), par exemple
`/videos/EVENT_CREATE_BLANK?from=doc` (`FROM_DOC_PARAM`, `FROM_DOC_VALUE` dans
`src/lib/video-feedback.ts` ; le paramètre est gardé lors de la redirection d'un slug). Le lecteur
ouvert sur place dans une fiche de documentation (`/doc/<fiche>`) répond directement en
`documentation`.

Les super admins voient Oui, Non et total par vidéo et par révision dans **Super Admin → Avis sur
les vidéos** (`/super-admin/video-feedback`) ; aucun score n'est montré au public.

## Ajouter une vidéo

1. Choisir un identifiant sémantique stable, par exemple `EVENT_CREATE`, sans langue ni numéro.
2. Déclarer cet identifiant, son manifeste, sa catégorie et ses tags dans `videos/catalog.json`.
3. Écrire le script humain dans `videos/scripts/`.
4. Ajouter son manifeste dans `videos/manifests/`, avec le même `id` que le catalogue.
5. Ajouter un scénario de capture et le déclarer dans `videos/tools/record.ts`. Extraire les scénarios dans `videos/scenarios/` si leur nombre ou leur complexité continue d’augmenter.
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
