# MEMBERS_DUPLICATES_MERGE — Repérer les doublons et fusionner sans perdre le fil

Vidéo autonome. Voix Kore constante, souriante et bienveillante ; génération continue sans balises de pause. Musique Mixkit discrète et sons uniquement sur les interactions réellement observées. Locale navigateur et processus française. Toutes les données sont fictives dans l’organisation dédiée `video-member-merge` ; port 43110, jamais 3100 ni 3101.

## Parcours réel

La narration s’adresse aux organisateurs avec « vous », dans un ton souriant et bienveillant. Les bénévoles peuvent être tutoyés uniquement dans les exemples de messages qui leur sont destinés.

1. **Doublons possibles** : montrer les raisons, ouvrir Comparer et fusionner sans confirmer, revenir, puis Ignorer. Vérifier que la suggestion disparaît sans absorber les fiches.
2. **Choisir la fiche conservée** : activité de Robin, Fusionner avec un autre membre, recherche de l’adresse fictive erronée, choix précis de la seconde fiche. Propriétaire uniquement.
3. **Profil et aperçu** : email conservé, téléphone pris sur l’autre fiche, notes réunies, tableau des données déplacées. Les étiquettes et disponibilités sont effectivement réunies ; l’abonnement navigateur fictif est effectivement supprimé.
4. **Conflits** : même créneau, chevauchement, limite, âge et accès réservé réellement présents. Choisir explicitement la réponse et l’invitation de la fiche absorbée. Le bouton ne devient disponible qu’après résolution.
5. **Confirmation** : case d’envoi des nouveaux liens cochée puis décochée ; ne prétendre envoyer aucun email. Résumé irréversible puis vraie confirmation.
6. **Résultat** : retour à l’activité, une seule fiche active. Contrôles en lecture seule des déplacements, choix conservés, notes, disponibilités et effacement de la fiche absorbée.
7. **Liens** : ancien lien réellement invalide, nouveau lien réellement valide. Les tokens ne figurent jamais dans les métadonnées de preuve : uniquement leurs empreintes et les statuts de lookup. Le doublon de créneau annulé reste annulé, y compris avec son token régénéré.

## Préparation et reprise

La fixture originale réutilisable sert aussi aux reprises sur le produit actuel. Après migration des noms, le reset garde l’organisation et sa date de création, ainsi que le registre de migration. Il reconstruit uniquement les enfants dont le garde-fou a vérifié les identifiants, les relations et les journaux, avec les mêmes noms naturels. Les générations séparées v2 à v5 ne sont pas modifiées.

Le préparateur refuse tout écrasement implicite. Une prise complète fusionne réellement les deux fiches de formation. Pour une nouvelle prise, la commande explicite `videos/tools/local-production.ts run videos/tools/prepare-member-merge.ts --reset-owned` vérifie les identifiants exacts, les données fictives, tous les objets dépendants et le journal de fusion, puis reconstruit seulement cette organisation dans une transaction. Le registre `ownership.json` et son empreinte `ownership.sha256` lient le scénario à sa génération. Un état partiel ou inconnu est refusé ; la récupération sans registre n’accepte que l’état initial complet exact. Le hash du mot de passe propriétaire est conservé et l’organisation par défaut n’est jamais modifiée.

`record-member-merge.ts` reçoit les lecteurs de base réels de `member-merge-fixture.ts`. Ces lecteurs ne modifient rien. Toute mutation du parcours est effectuée par l’interface du produit compilé depuis `main`.

La transcription prononcée est la source du manifest. Après capture : transcription multilingue, synchronisation voix/actions, mixage et revue audiovisuelle du MP4, puis revalidation de l’évolution de `main`. La présence du module ou d’un manifest n’est pas une preuve de livraison.


## Révision du 2026-10-16 — lot 22-5

Relecture du produit main `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased] et PR fusionnées #990 à #1012, #1021 (onglets lot 2), #1022 (#1013). Étiquettes, Modifier, Heures prévues, navigation Inscriptions / Invitations et Documents à imprimer vérifiées dans les scénarios.

Narration conservée sans changement de style ; la réutilisation des WAV exige une vérification indépendante du texte et des empreintes.


Revue de la première prise du 2026-10-16 : à 168,68 s, `review/sentence-frames/21-result.png`, la recherche `?q=` avait coché « Inclure inactifs » alors que la phrase annonçait la liste active. Correction du cue « Dans la liste des membres » : décocher réellement ce filtre et vérifier son état. Une seule reprise finale autorisée utilisée, sans modification de narration ni de produit. La première prise est conservée dans `previous-take1-*`.


## Révision du 2026-10-16 — lot 23-2

Référence produit : main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Relire les nouveaux filtres de fiches fusionnées, Nombre et questions conditionnelles, la programmation des messages, la fin nocturne conservée et les limites visibles en Frise. Nouvelle prise sur ce build ; les anciennes restrictions de production ci-dessus restent des constats historiques.

Narration complète finale, même voix en une seule génération :

- `duplicates` : Deux fiches pour une seule personne ? Dans Membres, ouvrez Doublons possibles. Les raisons du rapprochement sont expliquées, mais un nom identique ne suffit pas à décider : deux personnes peuvent être homonymes. Comparer et fusionner ouvre un aperçu, sans encore modifier les fiches. Revenons aux suggestions. Ignorer retire simplement la paire de cette liste. Les deux fiches existent toujours, et une nouvelle raison de rapprochement pourrait faire revenir la suggestion plus tard.
- `compare` : Si vous savez que ces deux fiches désignent bien la même personne, ouvrez l’activité de la fiche que vous voulez conserver. Fusionner avec un autre membre est réservé au propriétaire de l’organisation. Recherchez précisément l’adresse de la seconde fiche, puis choisissez Fusionner avec cette fiche. Celle-ci sera absorbée. L’aperçu permet maintenant de comparer les informations, sans lancer la fusion. Vérifiez bien quelle fiche vous gardez avant de continuer.
- `fields` : Pour chaque information différente, vous choisissez la valeur à garder. Ici, on conserve la bonne adresse email et on prend le téléphone de l’autre fiche. Les notes internes peuvent aussi être mises à la suite : pratique pour ne rien oublier. Les étiquettes et les disponibilités sont réunies automatiquement. Le tableau récapitule les inscriptions, les invitations et les réponses concernées. Attention : les abonnements aux notifications du navigateur ne sont jamais déplacés. La personne devra les réactiver elle-même.
- `conflicts` : Les points à vérifier évitent les surprises. Sur un même créneau, l’inscription la plus avancée est conservée ; l’autre sera annulée avec une trace dans le journal. Les chevauchements, limites, âges minimums et postes réservés sont signalés, mais ne bloquent pas la fusion. En revanche, deux réponses différentes à la même question demandent un choix. Ici, on garde la réponse de la fiche absorbée. On choisit aussi son invitation. Une fois ces choix résolus, la confirmation devient disponible.
- `confirm` : Cette case permet d’envoyer les nouveaux liens personnels à l’adresse conservée. Dans cette démonstration, on la décoche : aucun email ne sera envoyé. Lisez le résumé avant de confirmer. La fusion est irréversible : la fiche absorbée sera désactivée et vidée de ses informations personnelles. Ses liens déplacés seront régénérés, et les anciens ne fonctionneront plus. Fusionner les deux fiches ouvre une dernière confirmation. Quand vous êtes vraiment sûr de votre choix, confirmez la fusion.
- `result` : Fusion effectuée : le résultat indique ce qui a été déplacé. Retournez à la fiche conservée pour retrouver son activité et les inscriptions réunies. Dans la liste des membres actifs, il ne reste qu’une fiche pour cette personne. La fiche absorbée se retrouve avec Inclure les fiches fusionnées ou effacées, un filtre distinct d’Inclure inactifs. L’historique n’est pas réécrit : les faits enregistrés sous l’ancienne fiche restent consultables depuis la fiche conservée. Si un responsable de secteur utilisait l’adresse abandonnée, son adresse doit être vérifiée séparément.
- `links` : Vérifions enfin les liens. L’ancien lien personnel de la fiche absorbée ne fonctionne plus : c’est normal, il a été remplacé pour protéger la personne. Le nouveau lien ouvre bien ses inscriptions sous la fiche conservée. Une inscription annulée parce qu’elle faisait doublon ne redevient pas active. Si vous cochez l’envoi des liens lors d’une vraie fusion, la personne reçoit ses nouveaux accès à l’adresse choisie. Vous avez ainsi une seule fiche, des informations cohérentes, et des accès renouvelés.
