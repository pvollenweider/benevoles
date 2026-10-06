# EVENT_QUESTIONS — Poser les bonnes questions à ses bénévoles

Identifiant stable : `EVENT_QUESTIONS` ; slug : `event-questions`.
Voix unique Kore, souriante et bienveillante, génération continue, `continuousPauseTags: false`.
Public organisateur : vouvoiement partout dans la narration ; le tutoiement reste limité aux citations éventuelles de l'interface bénévole.

16 chapitres suivent `videos/manifests/event-questions.json` et les scènes de `record-event-questions.ts`.
Le manifeste est le transcript canonique : ne pas en créer une copie divergente ici.

## Prise locale isolée

Produit : copie propre de main vérifiée, port dédié **43112**, locale française.
Fixture : organisation `video-questions` / `formation-questions`, événement `video-questions-event` / `atelier-questions`, Aline Exemple `video.questions.aline@example.org`, quatre créneaux libres non chevauchants le 28 novembre 2026. Aucun destinataire extérieur.

1. Lancer `local-production.ts serve-questions SNAPSHOT_APPROUVE` avec le wrapper et l'environnement local habituels.
2. Préparer : `local-production.ts run videos/tools/prepare-event-questions.ts`.
3. Faire la répétition : `local-production.ts run videos/tools/record.ts EVENT_QUESTIONS --rehearse --quick-rehearse`.
4. Après toute répétition ou prise interrompue : `local-production.ts run videos/tools/prepare-event-questions.ts --reset-owned`. Le reset vérifie l'identité, le ledger de propriété, tous les enfants et les relations inter-organisations avant de supprimer uniquement les IDs possédés. Il refuse les données inconnues.
5. Générer/auditer la narration continue actuelle, puis capturer `EVENT_QUESTIONS` sans flags de répétition ; assembler, contrôler les frames, l'audio final, la validation et la revue audiovisuelle.

La preuve d'email sélectionne un nouvel ID Mailpit apparu après le début de la prise, pour le destinataire exact et le bon événement. Elle montre le message réel, pas une ancienne boîte ou un email reconstruit. Les liens `video.invalid` du build sont transposés uniquement au serveur local pour la formation. Réception locale ne signifie ni lecture ni livraison extérieure ; aucun push n'est montré ou annoncé.

## Résultats exigés

- Quatre types réellement enregistrés ; obligatoire/facultatif ; ordre conservé après rechargement.
- Validation obligatoire sans inscription créée ; quatre réponses exactes puis confirmation réelle.
- Email réellement reçu, réponses dans l'administration, synthèse CSV réellement téléchargée sans coordonnées.
- Invitation : remplacement de M par L et effacement des facultatifs ; sans preuve : S ne remplace pas L.
- Type verrouillé, suppression de L refusée par 409, ajout de XXL enregistré sans perdre L.
- Retrait archivé : L reste lisible dans les inscriptions, la question disparaît du nouveau formulaire.

Ce parcours ne revendique pas la couverture des impressions, de l'archive complète, de la duplication des questions, du plafond de cinq questions ou de tous les cas d'attente. Ces sujets sont à illustrer dans les vidéos correspondantes.
