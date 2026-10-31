# Publier les affectations et suivre les retours

**Identifiant stable :** `ASSIGNMENT_PUBLICATION`

Voix Kore, une prise continue, narration au vouvoiement (organisateurs) ; les scènes côté bénévole sont présentées comme « ce que voit » Noah ou Emma, à la troisième personne.

## Utilité

Suite de `ASSIGNMENT_PROPOSALS` (#1172), qui s'arrête sur la confirmation de publication refermée, et de `VOLUNTEER_EVENT_AVAILABILITY`, où la personne donne ses disponibilités. Demande du propriétaire (2026-10-31) : voir tout le parcours, de la publication à l'email reçu par quelques bénévoles, puis ce que les bénévoles peuvent changer. Message clé : les places sont prises dès la publication ; chaque bénévole reçoit un seul email ; un bénévole ne déplace pas lui-même une mission publiée, mais il peut l'annuler (l'organisation est prévenue) ou corriger ses disponibilités (la mission est signalée à revoir, personne n'est déplacé).

## Démonstration

1. Page « Affectations en brouillon » des Rencontres du Val d'Orsel : « 29 affectations en brouillon pour 11 personnes. », aucun point qui empêche la publication ; sur le planning, les brouillons d'Emma au Bar des Tilleuls.
2. « Publier les affectations » : fenêtre « Publier les affectations ? » (« 29 affectations pour 11 personnes : chaque personne avec une adresse email reçoit un seul email avec ses missions. », « Les places sont prises maintenant ; tout est publié d'un coup, ou rien si un point bloque. »), puis « Publier ».
3. « Publication faite » : « 29 affectations publiées pour 11 personnes. … », « Aucune affectation en brouillon pour l'instant. » ; sur le planning, les missions portent « Confirmée ».
4. « Voir les inscriptions » : « 29 inscriptions actives », source « Affectation publiée ».
5. Mailpit (corps seul, sous les en-têtes) : l'email d'Emma, « Hello Emma, », ses deux créneaux au Bar des Tilleuls, le bouton « Gérer mes inscriptions ».
6. Ce que voit Noah : « Noah a reçu le même email » (le sien, Accueil samedi et Parking dimanche, montré brièvement), puis « Gérer mes inscriptions » ouvre « Mes inscriptions », « Tous mes créneaux » ; pas de bouton pour changer de mission, « Écrire à l'organisation ».
7. « Annuler » sur Parking : « Confirmer l'annulation ? », « Un mot pour l'organisation ? (facultatif) » rempli de « Absent dimanche matin, désolé. », « Oui, annuler » ; il reste Accueil samedi.
8. Mailpit, boîte de l'organisatrice : « Noah De Jong se désiste de Parking … », « Il manque maintenant 1 place sur ce créneau. », son message, le bouton « Trouver un remplaçant ».
9. Ce que voit Emma : l'email de ses disponibilités, « Indiquer mes disponibilités », la page « Mes disponibilités pour Rencontres du Val d'Orsel » avec « Tu peux corriger tes disponibilités. Cela ne modifie ni n'annule tes missions. … » ; vendredi « Pas disponible », « Enregistrer mes disponibilités », « C'est enregistré. Si tes disponibilités ont changé, l'organisation est prévenue ; tes missions restent les mêmes. … ».
10. De retour sur « Affectations en brouillon » : « 1 mission à revoir après une correction des disponibilités », « Ces missions sont actuellement en dehors des disponibilités corrigées. Personne n'a été déplacé ni désinscrit. », Emma vendredi au Bar des Tilleuls ; dans sa case « À revoir : actuellement en dehors de ses disponibilités corrigées. » et « Voir l'inscription ».

## Résultat visible

Vingt-neuf inscriptions publiées, les emails réels de deux bénévoles, une annulation faite par un bénévole et l'email reçu par l'organisatrice, une correction de disponibilités et la mission signalée à revoir.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts assignment-publication` (`scripts/seed-video-publication.ts`) : organisation fictive dédiée `formation-publication`, jamais celle de `ASSIGNMENT_PROPOSALS` (la prise publie pour de vrai). Mêmes personnes, postes, créneaux et réponses que la vidéo des propositions ; les 29 brouillons sont ceux par lesquels elle se termine (`PB_PLAN`, vérifié par `videos/lib/__tests__/proposals-fixture.test.ts`), notés « Brouillon » (brouillons de l'organisation, sans proposition). La liste bêta globale n'ouvre que `availability` et `workloadProtection` : filmer les reprises des autres vidéos bêta avant ce seed, ou les re-semer après.
- Une prise par seed : la prise publie, annule une inscription et enregistre une réponse. Le recorder s'arrête si le seed a déjà servi.
- Avant la capture, hors champ, `preparePublication` envoie à Emma son lien de disponibilités par la vraie route des organisateurs (sa réponse semée ne change pas) et garde la session de l'organisatrice ; les scènes bénévoles se jouent sans session.
- Emails : jamais écrits par le recorder. Les emails de placement attendent dix minutes, celui du désistement cinq : la prise rend seulement leurs lignes `nextAttemptAt` échues, hors champ, puis appelle la vraie route `/api/cron/outbox` (`CRON_SECRET`). La narration dit « une dizaine de minutes » et « quelques minutes plus tard ».
- Mailpit : seul le corps de l'email reste à l'écran, recadré sous les en-têtes comme `VOLUNTEER_EVENT_AVAILABILITY` (`videos/tools/focus-mailpit.ts`, `assemble.ts`) ; le sujet, la date anglaise et la liste ne se voient pas. La narration ne cite donc pas le sujet « Désistement ».
- Les phrases lues sont vérifiées d'avance par `videos/lib/__tests__/publication-fixture.test.ts` : textes de la confirmation et de « Publication faite », emails rendus par le produit, annulation (libellés, délai, organisateurs prévenus), correction (permise, texte de la page, mission hors disponibilités), mots de la mission à revoir.
- Échanges de créneaux : non montrés (décision du propriétaire, 2026-10-31 : ils ont leur vidéo, `SHIFT_SWAPS`) ; le bloc « À retenir » du manifeste les mentionne comme possibilité quand l'événement les active.
- Durée visée (décision du propriétaire) : environ 3 min 20 ; l'email de Noah n'a plus de segment à lui (il répétait celui d'Emma), il apparaît brièvement au début de « Ce que voit le bénévole ».
- `videos/tools/audit-audiovisual.ts` accepte cette vidéo après `videos/lib/verify-publication-review-fixture.ts` : organisation et membres fictifs exacts, 29 inscriptions publiées dont le parking de Noah annulé, la réponse d'Emma à revoir, seuls les emails de la fixture.
- **Sources prêtes, rendu en attente** (nouvelle, `published: false`, révision 1).
