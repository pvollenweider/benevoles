# Vidéos du produit

Ce dossier contient les sources reproductibles des tutoriels vidéo : scripts éditoriaux, transcripts, manifestes de narration et scénarios Playwright. Les fichiers lourds générés restent dans `videos/output/`, ignoré par Git.

Le catalogue central `catalog.json` donne à chaque vidéo un identifiant sémantique stable,
indépendant de son titre, de sa langue, de son fichier et de sa future position dans la galerie.
Les commandes, les logs, la documentation et les futures traductions doivent référencer cet
identifiant, jamais un numéro d'ordre. Les slugs ci-dessous ne sont que les noms actuels des
manifestes et des fichiers de sortie.

Cinq vidéos sont disponibles ou en prévisualisation :

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
- une clé Gemini uniquement pour générer la narration.

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

Par défaut, chaque phrase est générée séparément. Un manifeste peut activer `continuousNarration` : Gemini produit alors toute la narration en une seule prise afin de conserver exactement la même interprétation. Le pipeline repère les pauses demandées et découpe ensuite cette prise en segments pour conserver une synchronisation précise avec les manipulations. La durée réelle de chaque segment est mesurée par FFprobe et enregistrée dans `audio-metadata.json`.

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
