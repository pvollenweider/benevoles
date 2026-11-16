# Indiquer ses disponibilités date par date

**Identifiant stable :** `VOLUNTEER_EVENT_AVAILABILITY`

Voix Kore, une prise continue, narration au tutoiement (vidéo pour les bénévoles uniquement).

## Utilité

Montrer à un bénévole, même peu à l'aise avec l'informatique, comment répondre à une demande de disponibilités datées (#1146, capacité bêta `availability`, écrans repris par la PR #1228) : l'email de l'organisation, le lien « Indiquer mes disponibilités », la page « Mes disponibilités pour » suivie du nom de l'événement, des horaires par date (dont un horaire de nuit), « Ajouter un autre horaire », « Reprendre les horaires du … », « Pas disponible », l'enregistrement et le même lien pour changer ses réponses jusqu'à la date limite. Ce n'est pas la vidéo `VOLUNTEER_SESSION_AVAILABILITY`, qui montre les disponibilités habituelles de la page « Mes inscriptions » : le titre, la description et les notes du lecteur font la différence, et la narration situe la demande dès l'ouverture (« pour cet événement précis, date par date »), sans nommer un écran que la vidéo ne montre pas.

## Démonstration

1. Mailpit local, recherche des messages de Morgane : un seul email, celui de la prise. Carte de titre.
2. L'email « [Association des Lanternes de Combe-Aurel] Tes disponibilités pour Fête des Lanternes de Combe-Aurel » : « Bonjour Morgane, », « Merci de répondre avant le vendredi … à 20h. », le bouton « Indiquer mes disponibilités » (touché), puis le même lien ouvert dans l'onglet filmé.
3. Page « Mes disponibilités pour Fête des Lanternes de Combe-Aurel » : « Pas besoin de compte. Seule l'organisation voit tes réponses. », « Tu peux répondre ou changer tes réponses jusqu'au vendredi … à 20h. », « Tu n'as pas encore répondu. », trois dates « (sans réponse) ».
4. Vendredi : « Disponible à certaines heures », « Début » 09:00, « Fin » 12:00.
5. « Ajouter un autre horaire » : « Horaire 2 », 20:00 → 03:00, et sous la fin « Fin : se termine le lendemain, samedi … ».
6. Samedi : « Reprendre les horaires du vendredi … » : les deux horaires recopiés, avec « Fin : se termine le lendemain, dimanche … ».
7. Dimanche : « Pas disponible ». Puis la rubrique « Je ne peux pas venir du tout » et son bouton « Pas disponible pendant tout l'événement », montrés sans être touchés.
8. « Changements non enregistrés », puis « Enregistrer mes disponibilités » : « C'est enregistré. Tu peux fermer cette page ; tu pourras changer tes réponses avec ce même lien jusqu'au vendredi … à 20h. »
9. La page rechargée (le même lien) : « Tu as répondu pour toutes les dates. », les horaires du vendredi et « Pas disponible » le dimanche toujours là, la date limite en haut.

## Résultat visible

Une réponse enregistrée pour les trois dates (vendredi et samedi de 9h à 12h et de 20h à 3h le lendemain, dimanche pas disponible), modifiable avec le même lien jusqu'à la date limite.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts volunteer-event-availability` (`scripts/seed-video-volunteer-availability.ts`) : organisation fictive dédiée `formation-disponibilites` (« Association des Lanternes de Combe-Aurel »), inscrite à la bêta. La liste bêta globale n'ouvre que `availability` : filmer les reprises des autres vidéos bêta avant de lancer ce seed, ou les re-semer après. Événement du vendredi au dimanche au moins deux semaines plus tard, en brouillon, collecte des disponibilités active, date limite le vendredi une semaine avant, à 20h (heure suisse). Morgane Korhonen, membre active, n'a encore reçu aucune demande.
- La demande est faite hors champ, avant la capture, par la vraie route des organisateurs (celle de « Demander leurs disponibilités »), connecté comme propriétaire : le lien, son secret et l'email sont ceux du produit, remis au Mailpit local. Le recorder lit le lien dans l'email sans jamais l'afficher, puis se déconnecte : la bénévole n'a pas de session.
- Une prise par seed : la prise crée la demande et enregistre une réponse. Le recorder s'arrête si Morgane a déjà été sollicitée ou si Mailpit garde un ancien email pour elle (le nettoyage des messages du scénario se fait avant chaque prise).
- Mailpit ouvre les liens d'un message dans un nouvel onglet : le bouton est touché dans l'email, puis le même lien est ouvert dans l'onglet filmé. L'email est à recadrer sous les en-têtes de Mailpit à l'assemblage, comme pour `SHIFT_SWAPS` (date anglaise, boutons et boîte de réception exclus) ; le sujet tient sur deux lignes, la zone de `SHIFT_SWAPS` (à partir de y = 264) laisserait voir les onglets « HTML », « Text »… : ce recadrage reste à ajouter avec le lot de rendu.
- Les heures sont tapées dans les champs d'heure du navigateur (heures, puis minutes) ; navigateur en français, fuseau `Europe/Zurich`.
- Les phrases lues sont vérifiées d'avance par `videos/lib/__tests__/volunteer-availability-fixture.test.ts` (date limite, dates, confirmation, état enregistré) avec les fonctions du produit.
- Noms de l'association, de l'événement et du lieu inventés ; Morgane Korhonen vient de `videos/lib/fixture-names.ts`, adresses `video.disponibilites.*@example.org`.
- `videos/tools/audit-audiovisual.ts` n'accepte pas encore cette vidéo : un contrôle de fixture comme `verify-proposals-review-fixture.ts` reste à ajouter avec la pile du lot de rendu.
