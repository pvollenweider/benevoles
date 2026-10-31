# Générer une proposition d'affectations

**Identifiant stable :** `ASSIGNMENT_PROPOSALS`

Voix Kore, une prise continue, narration au vouvoiement (organisateurs).

## Utilité

Montrer la fonction bêta « Proposition d'affectations » (#1172, PR #1219, #1220, #1223) de bout en bout : depuis « Affectations en brouillon », « Générer une proposition » ; ce qui est vérifié, le périmètre, les objectifs d'heures et leur suggestion, un poste souhaité et un poste à éviter, le numéro de tirage ; le calcul et son résultat (état, couverture, places restées vides avec leur raison, charge par personne, pourquoi une affectation) ; puis, sur les brouillons, la mention « Proposé », un brouillon verrouillé, une correction à la main, et la confirmation de publication refermée sans rien publier. Message clé : la proposition n'est qu'un brouillon, rien n'est publié et aucun bénévole n'est prévenu tant que l'organisation ne publie pas.

## Démonstration

1. Page « Disponibilités » des Rencontres du Val d'Orsel, lien « Affectations en brouillon » : douze personnes listées, une colonne par date, la ligne « À pourvoir » sous les dates (« 7 places à pourvoir », « 11 places à pourvoir », « 13 places à pourvoir »), « Aucune affectation en brouillon pour l'instant. ».
2. Lien « Générer une proposition » : page « Proposition d'affectations ».
3. Sous « Nouvelle proposition », « Ce qui est vérifié » et « Protection des pauses et de la charge : activée. » ; « Périmètre » : trois dates et cinq postes cochés, « 14 créneaux, 31 places à pourvoir ».
4. « Personnes et objectifs d'heures » : Jules Hansen « Sans réponse », non inclus ; les objectifs d'heures sont vides (jamais remplis à la place de l'organisation). « Appliquer la suggestion : 6 h par date où la personne a indiqué une plage libre » ; l'objectif de Noah De Jong passe de 12 à 6.
5. « Poste souhaité » d'Emma Johansson : Bar des Tilleuls ; « Poste à éviter » de Lucas Silva : Parking.
6. « Rotation, nuit et réserve (facultatif) » reste replié, « Aucun réglage » ; « Paramètres de calcul (facultatif) », « Numéro de tirage » 2026 ; « Générer une proposition ».
7. « Résultat de la proposition », en haut de la page, au-dessus de « Nouvelle proposition » : « 29 places couvertes sur 31 » en tête, la pastille neutre « Couverture complète impossible », « tirage n° 2026 », « 29 affectations écrites dans les brouillons. » ; « Places restées vides (1) » : « Rangement du Kiosque, dimanche … , de 21h30 à 0h30, jusqu'au lendemain », « Aucune disponibilité ne couvre entièrement ce créneau. ».
8. « Charge par personne » : Noah « 6 h prévues pour un objectif de 6 h : objectif atteint. » ; « Affectations proposées (29) », « Afficher chaque affectation et sa raison » : Emma au Bar des Tilleuls vendredi, « … Poste souhaité. ».
9. « Voir les affectations en brouillon » : « 29 affectations en brouillon pour 11 personnes. », une seule pastille « Proposé » par brouillon généré (jamais « Brouillon » à côté). Fenêtre « Brouillon d'Emma Johansson : Bar des Tilleuls, vendredi… » : « Verrouiller », « Ce brouillon est verrouillé. », « Fermer » ; mention « Verrouillé » avec un cadenas, bordée de gris foncé (distincte de la pastille grise « Proposé »).
10. Fenêtre « Brouillon de Léa Müller : Billetterie, vendredi… » : « Retirer ce brouillon », puis la confirmation « Retirer ce brouillon ? » et « Retirer le brouillon ». Case de Lou Tóth, vendredi : « Ajouter », « Ajouter en brouillon » sur Billetterie, « Brouillon ajouté », « Fermer ».
11. « Publier les affectations » : fenêtre « Publier les affectations ? » (29 affectations pour 11 personnes, un seul email par personne) ; « Annuler ». Le titre, le décompte et le bouton restent dans le cadre final.

## Résultat visible

Une proposition écrite dans les brouillons, lue et expliquée, un brouillon verrouillé, une correction faite à la main, et rien de publié : aucune place prise, aucun email envoyé.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts assignment-proposals` (`scripts/seed-video-proposals.ts`) : organisation fictive dédiée `formation-propositions` (« Association des Rencontres du Val d'Orsel »), inscrite à la bêta. La liste bêta globale n'ouvre que `workloadProtection`, `availability` et `assignmentProposals` : filmer les reprises des autres vidéos bêta avant de lancer ce seed, ou les re-semer après. Événement du vendredi au dimanche au moins deux semaines plus tard, collecte des disponibilités active (onze réponses, Jules sans réponse), protection des pauses et de la charge activée et complète, cinq postes, quatorze créneaux, aucune inscription, aucun brouillon, aucun objectif d'heures.
- Une prise par seed : la prise enregistre des objectifs d'heures, écrit 29 brouillons, en verrouille un, en retire un et en ajoute un. Le recorder s'arrête si un brouillon « Proposé » existe déjà.
- Le résultat est jugé d'avance (`videos/lib/__tests__/proposals-fixture.test.ts`) : la configuration est construite par le code de la page (`formToConfig`) avec les choix de la prise (`AP_TYPED`), puis résolue par le vrai moteur avec le budget par défaut. Le test vérifie chaque ligne lue (`AP_EXPECTED`), que le même numéro de tirage donne la même proposition quel que soit le jour de la prise, changements d'heure compris, et qu'après la correction à la main chaque programme respecte les limites (la publication resterait possible).
- Le numéro de tirage est tapé (2026) : sans lui, la page propose un numéro au hasard et le résultat changerait.
- Le calcul tourne dans le serveur après la réponse ; sur ce petit événement il finit en quelques secondes. Si la prise montre « Proposition en cours » plus longtemps que la phrase « En quelques secondes », le signaler.
- La fenêtre de publication est refermée par « Annuler » : aucune inscription n'est créée, aucun email n'est envoyé. Aucun email n'est montré.
- Noms de l'association, de l'événement et des lieux inventés ; personnes de `videos/lib/fixture-names.ts`, adresses `video.proposals.*@example.org`.
- `videos/tools/audit-audiovisual.ts` accepte cette vidéo après le contrôle de `videos/lib/verify-proposals-review-fixture.ts` : organisation et membres fictifs exacts, quatorze créneaux, trois lieux et aucune inscription publiée sur la base dédiée 45439.

- **READY, lot 35 (2026-10-30), publiée** : main `aed410c8`, build `5Oaosk5GvwNjq85Z4bYwR`, 160,20 s. Deux prises autorisées, chacune sur seed neuf et après répétition rapide. La première retire Léa trop tôt ; la dernière attend « ouvrons son brouillon de billetterie » et maintient le dialogue 600 ms. Ouverture à +2,862 s et retrait à +4,245 s, après la phrase à +2,391 s. `ap-lock` ne dépasse pas ; résultat en 4,163 s, graine 2026. Onze revues audiovisuelles sans signalement, onze ASR de chapitres réussies, aucun tutoiement dans l’ASR intégrale ni le VTT, aucun trou musical. Une seule génération Kore entière, recoupée puis auditée, sans texte changé. Preuve en base : 29 brouillons, Emma verrouillée, Lou manuelle, aucune inscription ni notification. Preuves : `videos/evidence/batch35/assignment-proposals/`.

- **READY, lot 36 (2026-10-31), republiée, révision 2** : refilmée après les PR #1227, #1228 et #1229, sur main `eed7abaa`, BUILD_ID `XkyJ_3vtHOL38BaQPtehJ`, 167,64 s. Deux prises après seed neuf et répétition rapide ; la seconde maintient le six de Noah 650 ms et centre l'explication d'Emma. Une nouvelle piste Kore entière, recoupée puis auditée. Résultat en tête, réglages facultatifs repliés, objectifs vides puis suggestion, « Numéro de tirage » 2026 saisi, « 29 places couvertes sur 31 », « Couverture complète impossible », ligne « À pourvoir », cadenas et confirmation de retrait. Calcul affiché en 4,035 s. Verrouillage et correction après leurs annonces, sans dépassement. Onze revues audiovisuelles sans signalement, ASR finales vérifiées, aucun tutoiement ni trou musical. 29 brouillons, aucune inscription ni notification ; publication annulée dans le film. Preuves : `videos/evidence/batch36/assignment-proposals/`.
