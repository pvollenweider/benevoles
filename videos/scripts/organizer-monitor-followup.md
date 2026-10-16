# Suivre les inscriptions et relancer au bon moment

Révision rédactionnelle du 13 octobre 2026 : narration adressée aux organisateurs au vouvoiement, impératifs compris. Les citations destinées aux bénévoles conservent leur ton initial. Toute modification de phrase impose une régénération intégrale en une passe, avec la même voix et sans balises de pause. Les anciennes preuves ne valident pas ce nouveau texte ; narration, sous-titres, synchronisation et MP4 final sont à recontrôler après régénération.

## Objectif

Montrer comment un organisateur pilote un événement déjà publié : vérifier les postes couverts, examiner les demandes, retrouver une personne, relancer les bénévoles concernés, préparer les documents du jour J et garder une trace des changements.

## Ton

Chaleureux, souriant et concret. La personne qui raconte connaît la réalité d’une association : elle montre comment gagner du temps sans dramatiser les places encore libres. Aucun ton commercial.

## Découpage

1. **Vue d’ensemble** — ouvrir un événement publié et lire les besoins, À traiter et Prochaines étapes.
2. **Couverture du planning** — repérer les créneaux complets, ceux qui ont encore de la place et les listes d’attente.
3. **Inscriptions** — consulter les bénévoles, leurs coordonnées, leur créneau et les réponses aux questions.
4. **Demandes à valider** — ouvrir une demande pour un poste sensible, examiner le contexte puis accepter ou refuser.
5. **Filtres et recherche** — isoler un poste ou un créneau et retrouver rapidement une personne.
6. **Actions individuelles et groupées** — renvoyer un lien personnel ou agir sur plusieurs inscriptions sans ressaisie.
7. **Relance ciblée** — écrire uniquement aux invités qui n’ont pas encore choisi de créneau, aux personnes en liste d’attente, à un poste ou à un créneau précis.
8. **Message et aperçu** — partir d’un modèle, adapter le texte, utiliser les variables, vérifier le nombre de destinataires et prévisualiser l’email avant tout envoi.
9. **Email et notification** — rappeler que l’email reste le canal principal et que la notification peut être ajoutée pour une information urgente lorsque les bénévoles l’ont activée.
10. **Rappels automatiques** — montrer les rappels programmés avant les créneaux et leurs réglages.
11. **Jour J** — générer les listes par poste, les réponses utiles, les plannings individuels et les badges.
12. **Historique** — lire le journal d’activité pour savoir qui s’est inscrit, désinscrit ou a modifié le planning, et quand.

## Garde-fous

- Utiliser uniquement la base locale E2E et les données fictives de `scripts/seed-demo.ts`.
- Ne jamais envoyer de message réel : la vidéo s’arrête à l’aperçu et à la confirmation.
- Ne prendre aucune décision définitive sur une demande : ouvrir la fenêtre puis la refermer.
- La narration conserve la voix de la prise d’origine lors du remplacement des phrases révisées.
- Chaque page doit être chargée avant que la phrase qui la décrit ne commence.


## Révision du 2026-10-16 — lot 22-4

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` et PR fusionnées (dont #1021, lot 2, et #1022 pour #1013) : en-tête partagé et onglets, Aperçu centré sur les besoins, Communication pour les messages et rappels, Documents à imprimer, vocabulaire Places / Étiquettes / Modifier / Heures prévues. La page personnelle affiche Mes réponses et S’inscrire à d’autres créneaux ; les responsables peuvent recevoir les changements de réponses liés à leur poste. Les sélecteurs et les ancres suivent les écrans actuels.

Narration textuelle conservée : aucun changement de style. Réutilisation conditionnée à la concordance exacte du texte et des WAV restaurés, contrôlée séparément.

Contrôle des WAV restaurés le 2026-10-16 : la reconnaissance indépendante retrouve encore le tutoiement de l’ancienne prise. Le texte actuel au vouvoiement reste inchangé, mais cet audio ne lui correspond pas. WAITING TTS : régénération intégrale obligatoire, aucune combinaison de phrases anciennes et nouvelles. Phrases au vouvoiement à produire dans cette prise :

- Depuis l’événement, vous retrouvez tout de suite son état, les prochaines étapes et les accès utiles pour garder une vue claire.
- Commencez par regarder la couverture du planning.
- Vous savez ainsi où concentrer vos efforts.
- Ouvrez une demande pour vérifier la personne, le créneau et ses réponses, puis acceptez-la ou refusez-la.
- Quand la liste grandit, filtrez par poste, par créneau ou par statut, puis utilisez la recherche pour retrouver un nom ou une adresse.
- En quelques secondes, vous isolez exactement le groupe qui vous intéresse.
- Vous pouvez agir sur une inscription, par exemple renvoyer son lien personnel, ou sélectionner plusieurs lignes pour appliquer une action groupée.
- Pour une relance, choisissez précisément les destinataires : tous les inscrits, un poste, un créneau, la liste d’attente, ou les invités qui n’ont encore aucun créneau confirmé.
- Vous pouvez partir d’un modèle, adapter l’objet et le texte, puis utiliser des variables comme le prénom ou les créneaux.
- Avant d’envoyer quoi que ce soit, ouvrez l’aperçu : vous contrôlez le rendu exact et le nombre de destinataires.
- Pour une information urgente, vous pouvez ajouter une notification sur téléphone ou ordinateur ; elle ne touche que les bénévoles qui l’ont activée.
- Vous choisissez lesquels sont actifs, et l’application utilise les horaires locaux de l’organisation pour envoyer les bonnes informations au bon moment.
- Vous générez seulement les documents dont votre équipe a besoin.
- Vous gardez ainsi le fil, même à plusieurs organisateurs.
- Votre planning reste lisible jusqu’au jour de l’événement.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des réglages hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `overview` : Une fois le planning publié, voici comment suivre les inscriptions et relancer au bon moment. Depuis l’événement, vous retrouvez tout de suite son état, les prochaines étapes et les accès utiles pour garder une vue claire.
- `coverage` : Commencez par regarder la couverture du planning. Les capacités et les inscriptions montrent les créneaux déjà bien remplis, ceux où il reste des places, et les personnes placées en liste d’attente. Vous savez ainsi où concentrer vos efforts.
- `registrations` : Dans les inscriptions, chaque ligne rassemble la personne, son créneau, son statut et les informations utiles. Les réponses aux questions, comme la taille du t-shirt ou le régime alimentaire, restent liées au bénévole et peuvent être consultées sans ouvrir plusieurs fichiers.
- `requests` : Les postes sur validation sont clairement signalés. Ouvrez une demande pour vérifier la personne, le créneau et ses réponses, puis acceptez-la ou refusez-la. Ici, on referme simplement la fenêtre : aucune décision n’est prise pendant la démonstration.
- `filters` : Quand la liste grandit, filtrez par poste, par créneau ou par statut, puis utilisez la recherche pour retrouver un nom ou une adresse. En quelques secondes, vous isolez exactement le groupe qui vous intéresse.
- `actions` : Vous pouvez agir sur une inscription, par exemple renvoyer son lien personnel, ou sélectionner plusieurs lignes pour appliquer une action groupée. Les liens restent individuels : le bénévole peut consulter ou modifier ses choix sans créer de compte.
- `audience` : Pour une relance, choisissez précisément les destinataires : tous les inscrits, un poste, un créneau, la liste d’attente, ou les invités qui n’ont encore aucun créneau confirmé. Le nombre de personnes est recalculé avant l’envoi.
- `message` : Vous pouvez partir d’un modèle, adapter l’objet et le texte, puis utiliser des variables comme le prénom ou les créneaux. Avant d’envoyer quoi que ce soit, ouvrez l’aperçu : vous contrôlez le rendu exact et le nombre de destinataires.
- `channels` : L’email part à toutes les personnes ciblées. Pour une information urgente, vous pouvez ajouter une notification sur téléphone ou ordinateur ; elle ne touche que les bénévoles qui l’ont activée. La confirmation finale évite les envois involontaires.
- `reminders` : Les rappels automatiques prennent ensuite le relais avant les créneaux. Vous choisissez lesquels sont actifs, et l’application utilise les horaires locaux de l’organisation pour envoyer les bonnes informations au bon moment.
- `reports` : À l’approche du jour J, les rapports préparent les listes à afficher sur les stands, les plannings individuels, les réponses aux questions et les badges. Vous générez seulement les documents dont votre équipe a besoin.
- `history` : Enfin, le journal d’activité permet de comprendre ce qui a changé : publication, nouvelle inscription, désinscription, modification d’un créneau ou ajout manuel. Chaque action est datée, avec son origine. Vous gardez ainsi le fil, même à plusieurs organisateurs.
- `done` : Le résultat, c’est un suivi simple : voir les manques, contacter les bonnes personnes, préparer le terrain et retrouver l’historique sans jongler entre plusieurs outils. Votre planning reste lisible jusqu’au jour de l’événement.
