# Générer une proposition d'affectations

**Identifiant stable :** `ASSIGNMENT_PROPOSALS`

Voix Kore, une prise continue, narration au vouvoiement (organisateurs).

## Utilité

Montrer la fonction bêta « Proposition d'affectations » (#1172, PR #1219, #1220, #1223) de bout en bout : depuis « Affectations en brouillon », « Générer une proposition » ; ce qui est vérifié, le périmètre, les objectifs d'heures et leur suggestion, un poste souhaité et un poste à éviter, la graine ; le calcul et son résultat (état, couverture, places restées vides avec leur raison, charge par personne, pourquoi une affectation) ; puis, sur les brouillons, la mention « Proposé », un brouillon verrouillé, une correction à la main, et la confirmation de publication refermée sans rien publier. Message clé : la proposition n'est qu'un brouillon, rien n'est publié et aucun bénévole n'est prévenu tant que l'organisation ne publie pas.

## Démonstration

1. Page « Disponibilités » des Rencontres du Val d'Orsel, lien « Affectations en brouillon » : douze personnes listées, une colonne par date, « Aucune affectation en brouillon pour l'instant. ».
2. Lien « Générer une proposition » : page « Proposition d'affectations ».
3. « Ce qui est vérifié » et « Protection des pauses et de la charge : activée. » ; « Périmètre » : trois dates et cinq postes cochés, « 14 créneaux, 31 places à pourvoir ».
4. « Personnes et objectifs d'heures » : Jules Hansen « Sans réponse », non inclus. « Appliquer la suggestion : 6 h par date où la personne a indiqué une plage libre » ; l'objectif de Noah De Jong passe de 12 à 6.
5. « Poste souhaité » d'Emma Johansson : Bar des Tilleuls ; « Poste à éviter » de Lucas Silva : Parking.
6. « Rotation, nuit et réserve » laissé vide ; « Paramètres de calcul », « Graine » 2026 ; « Générer une proposition ».
7. « Résultat de la proposition » : « Impossible démontré », « 29 places couvertes sur 31 », « 29 affectations écrites dans les brouillons. » ; « Places restées vides (1) » : « Rangement du Kiosque, dimanche … , de 21h30 à 0h30, jusqu'au lendemain », « Aucune disponibilité ne couvre entièrement ce créneau. ».
8. « Charge par personne » : Noah « 6 h prévues pour un objectif de 6 h : objectif atteint. » ; « Affectations proposées (29) » : Emma au Bar des Tilleuls vendredi, « … Poste souhaité. ».
9. « Voir les affectations en brouillon » : « 29 affectations en brouillon pour 11 personnes. », mentions « Proposé ». Brouillon d'Emma, vendredi : « Verrouiller », « Ce brouillon est verrouillé. », « Fermer » ; mention « Verrouillé ».
10. Brouillon de Léa Müller, Billetterie vendredi : « Retirer ce brouillon ». Case de Lou Tóth, vendredi : « Ajouter », « Ajouter en brouillon » sur Billetterie, « Brouillon ajouté. », « Fermer ».
11. « Publier les affectations » : fenêtre « Publier les affectations ? » (29 affectations pour 11 personnes, un seul email par personne) ; « Annuler ». Le titre, le décompte et le bouton restent dans le cadre final.

## Résultat visible

Une proposition écrite dans les brouillons, lue et expliquée, un brouillon verrouillé, une correction faite à la main, et rien de publié : aucune place prise, aucun email envoyé.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts assignment-proposals` (`scripts/seed-video-proposals.ts`) : organisation fictive dédiée `formation-propositions` (« Association des Rencontres du Val d'Orsel »), inscrite à la bêta. La liste bêta globale n'ouvre que `workloadProtection`, `availability` et `assignmentProposals` : filmer les reprises des autres vidéos bêta avant de lancer ce seed, ou les re-semer après. Événement du vendredi au dimanche au moins deux semaines plus tard, collecte des disponibilités active (onze réponses, Jules sans réponse), protection des pauses et de la charge activée et complète, cinq postes, quatorze créneaux, aucune inscription, aucun brouillon, aucun objectif d'heures.
- Une prise par seed : la prise enregistre des objectifs d'heures, écrit 29 brouillons, en verrouille un, en retire un et en ajoute un. Le recorder s'arrête si un brouillon « Proposé » existe déjà.
- Le résultat est jugé d'avance (`videos/lib/__tests__/proposals-fixture.test.ts`) : la configuration est construite par le code de la page (`formToConfig`) avec les choix de la prise (`AP_TYPED`), puis résolue par le vrai moteur avec le budget par défaut. Le test vérifie chaque ligne lue (`AP_EXPECTED`), que la même graine donne la même proposition quel que soit le jour de la prise, changements d'heure compris, et qu'après la correction à la main chaque programme respecte les limites (la publication resterait possible).
- La graine est tapée (2026) : sans elle, la page propose une graine au hasard et le résultat changerait.
- Le calcul tourne dans le serveur après la réponse ; sur ce petit événement il finit en quelques secondes. Si la prise montre « Proposition en cours » plus longtemps que la phrase « En quelques secondes », le signaler.
- La fenêtre de publication est refermée par « Annuler » : aucune inscription n'est créée, aucun email n'est envoyé. Aucun email n'est montré.
- Noms de l'association, de l'événement et des lieux inventés ; personnes de `videos/lib/fixture-names.ts`, adresses `video.proposals.*@example.org`.
- `videos/tools/audit-audiovisual.ts` n'accepte pas encore cette vidéo : il lui faut une vérification de la fixture comme `verify-workload-review-fixture.ts`, à ajouter avec la pile du lot de rendu.
