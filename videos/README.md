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

Préparation :

```bash
make video-up
make video-setup
make video-server
```

Après la capture, `make video-down` supprime cette base et cette boîte email jetables.

## 1. Relire le transcript sans appeler Gemini

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

### Contrôler les paroles avant la capture

```bash
node --env-file=.env.video.local --import tsx videos/tools/audit-narration.ts SECTOR_LEADERS
```

Ce contrôle envoie uniquement les extraits de narration fictive à Gemini pour une transcription
indépendante, sans fournir le texte attendu dans la demande. `narration-audit.json` garde la
comparaison et l'empreinte de chaque WAV. Une différence importante arrête le pipeline.
Le contrôle ne prouve pas la qualité du sourire ni la concordance phrase/manipulation : la
passe audiovisuelle reste obligatoire, y compris lorsque le taux de différence est faible.

Pour une frontière incorrecte, `locate-narration-boundary.ts VIDEO_ID segment-id` propose un
repère à partir d'une courte fenêtre sonore et d'un silence réel. Les timestamps suggérés par
un modèle ne sont jamais acceptés comme preuve. Après diagnostic, appliquer un repère avec
`recut-narration.ts VIDEO_ID segment-id=secondes`, refaire l'audit puis refaire la capture.
Si des paroles manquent réellement à la prise, régénérer la narration complète.

`video:build` contrôle les paroles après le TTS et avant le seed/capture. `video:validate`
refuse un rapport en échec ou dont les empreintes ne correspondent plus aux WAV actuels.

## 3. Enregistrer les manipulations

Avec l’application vidéo disponible sur le port 43100 :

```bash
node --env-file=.env.video.e2e node_modules/.bin/tsx scripts/seed-demo.ts
npm run video:record -- VOLUNTEER_REGISTER
```

Rejouer le seed avant **chaque** prise : le scénario crée une véritable inscription et finirait sinon par remplir son créneau de démonstration.

Variables facultatives :

- `VIDEO_BASE_URL`, par défaut `http://localhost:43100` ;
- `VIDEO_ORG`, par défaut `default` ;
- `VIDEO_EVENT_SLUG`, par défaut `fete-du-village`.

Le scénario utilise les durées réelles des WAV lorsqu’elles existent, sinon les estimations du manifeste. Playwright produit `capture.webm` et `timeline.json`. Le pointeur, les clics et le titre de chapitre font partie du screencast.

## 4. Assembler le MP4 et les sous-titres

```bash
npm run video:assemble -- VOLUNTEER_REGISTER
```

FFmpeg place chaque phrase au repère enregistré, normalise la narration et produit :

- `volunteer-register-mobile.mp4` ;
- `volunteer-register-mobile.vtt` ;
- `volunteer-register-mobile.txt`.

Une musique facultative peut être ajoutée sans la copier dans le dépôt :

```dotenv
# .env.video.local
VIDEO_MUSIC_PATH=/chemin/vers/musique.mp3
```

Elle est bouclée si nécessaire, placée à 7,5 % sous la voix, puis fondue au début et à la fin. Vérifier les droits de diffusion avant toute publication.

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
- `updatedAt` (`AAAA-MM-JJ`) et `revision` (entier ≥ 1) : préparés pour le retour « utile ? »
  lié à une révision précise (#646, PREPARE seulement — aucune UI).

`published` reste `false` sur les 28 vidéos aujourd'hui ; la galerie les affiche quand même, avec
leur état (« À venir »). `filterPublishedVideos(videos, VIDEO_LIBRARY_PUBLIC_ONLY)` filtre déjà sur
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
