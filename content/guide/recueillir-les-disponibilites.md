---
roles: [admin]
group: membres
order: 50
summary: Demander à des membres leurs plages libres, date par date, par un lien personnel, voir qui a répondu et corriger une réponse (fonction bêta).
related: [inviter-des-membres, gerer-les-membres, lien-personnel]
legacy: []
aliases: []
added: 2026-10-29
---

# Recueillir les disponibilités

Fonction bêta « Disponibilités datées ». Elle s'adresse aux événements où l'organisation prépare elle-même les missions : chaque membre sollicité indique, pour chaque date de l'événement, ses plages libres ou « Pas disponible ». Les inscriptions restent ouvertes comme d'habitude : rien ne change pour les bénévoles qui choisissent leurs créneaux eux-mêmes.

Ces réponses sont séparées des disponibilités générales de la fiche du membre (« Matin », « Soir »), qui ne disent jamais si une personne est libre une date précise.

## Activer la collecte

**Événements**, puis l'événement, puis l'onglet **Paramètres**, **Informations**, carte **Disponibilités datées**. La carte apparaît quand votre organisation participe à la bêta et que la fonction est ouverte à l'essai (voir [Fonctions bêta](personnaliser-l-organisation.md#fonctions-beta)).

- **Recueillir les disponibilités pour cet événement** active la collecte. Les heures sont celles du fuseau horaire de l'organisation au moment de l'activation : il reste celui de l'événement pour toutes les réponses, même si vous changez ensuite le fuseau de l'organisation.
- **Date limite des réponses** (facultatif) : après cette date, les personnes ne peuvent plus changer leurs réponses depuis leur lien ; vous pouvez toujours les corriger. Une nouvelle date limite, plus tard, rouvre la collecte. **Sans date limite** la retire.
- Désactiver la collecte demande une confirmation qui dit combien de liens cesseront de fonctionner. Les réponses déjà données sont gardées. Si vous réactivez la collecte, il faut envoyer de nouveaux liens.

## Demander les disponibilités

Onglet **Inscriptions**, page **Disponibilités** (elle apparaît une fois la collecte activée).

- **Demander leurs disponibilités** : choisissez des membres actifs de l'organisation (recherche, filtre par étiquette). Chacun reçoit par email son lien personnel **Indiquer mes disponibilités**. Une personne déjà sollicitée reçoit le même lien ; personne ne reçoit deux emails à quelques minutes d'intervalle. Un membre sans adresse email est ajouté à la liste sans email : vous saisissez ses réponses vous-même.
- **Relancer les personnes sans réponse** : le même lien, de nouveau, aux personnes qui n'ont rien répondu, sauf celles contactées il y a moins de 48 heures.
- Les emails passent par la file d'envoi, comme les invitations : chaque envoi figure dans les [envois groupés](ecrire-aux-benevoles.md#envois-groupes) de l'onglet **Messages**.

## Voir qui a répondu

Les compteurs **Sans réponse**, **Réponse partielle**, **Réponse complète** et **Aucune date disponible** filtrent la liste ; **Toutes les personnes sollicitées** la montre en entier. Pour chaque personne : son état, le nombre de dates répondues, sa dernière réponse (par la personne ou par l'organisation) et l'état de son lien.

**Voir et corriger** ouvre ses réponses date par date. Votre correction remplace la réponse des dates modifiées et reste possible après la date limite ; elle est notée « par l'organisation ». Une réponse marquée « À revoir » vient de la fusion de deux fiches qui avaient répondu différemment : la réponse de la fiche gardée est conservée, jamais un mélange des deux.

Seuls les organisateurs voient les réponses. Elles ne sont jamais copiées quand vous dupliquez l'événement.

## Affecter selon les disponibilités

Page **Affecter selon les disponibilités**, ouverte depuis la page **Disponibilités**, depuis la liste des inscriptions filtrée sur un créneau (**Voir qui est disponible pour ce créneau**) ou depuis un créneau à compléter de **Où manque-t-il du monde ?** (**Voir les disponibilités**). Choisissez un créneau puis **Afficher** : chaque personne apparaît sur une carte. Vous décidez qui ajouter ; personne n'est placé automatiquement.

- **Qui est listé** : les personnes sollicitées pour leurs disponibilités et celles déjà prévues sur l'événement, membres actifs de l'organisation. **Voir tous les membres actifs** élargit la liste. Les personnes déjà sur ce créneau (place confirmée, demande, liste d'attente) ne sont pas listées : leur nombre est indiqué.
- **Disponibilité pour ce créneau**, d'après les réponses, dans le fuseau de l'événement : **Disponible sur tout le créneau**, **Disponible sur une partie du créneau** (avec le temps libre et le reste), **Sans réponse pour ces heures** ou **Pas disponible à ces heures**, et les plages indiquées. Pour un créneau de nuit, la réponse de la veille compte aussi : une plage de 20h à 3h couvre le début de la journée suivante. Tant que la date du créneau ou la veille n'a pas de réponse, ces heures restent « sans réponse », jamais « pas disponible ».
- **Heures déjà prévues** sur l'événement (places confirmées et demandes en attente de validation), dont celles du même jour (de la même journée de service quand l'événement protège les pauses et la charge), les missions qui s'enchaînent **sans pause** avec ce créneau et celles qui le **chevauchent**.
- **Pauses et charge** : si l'événement les protège, une personne que ses limites empêchent d'ajouter n'a pas de bouton, et la carte dit pourquoi ; sinon, les alertes habituelles s'affichent et l'ajout reste possible.
- **Trier** : **Par nom**, ou **Pour répartir la charge** : d'abord les personnes qui peuvent être ajoutées, puis selon leur disponibilité, puis celles qui ont le moins d'heures déjà prévues sur l'événement, puis par nom. **Disponibles sur tout le créneau seulement** masque les autres.
- **Ajouter à ce créneau** inscrit la personne comme l'ajout manuel des inscriptions (même email de confirmation, mêmes contrôles).

Une personne qui a indiqué ne pas être disponible pendant une partie du créneau peut tout de même être ajoutée : cochez d'abord **Ajouter quand même : je sais que … n'a pas indiqué être disponible à ces heures**. La même case apparaît dans **+ Ajouter manuellement** des inscriptions, sous le créneau choisi, quand vous choisissez un membre. Si sa réponse change entre-temps, l'ajout est refusé sans rien enregistrer et la case est à cocher de nouveau. Le journal de l'événement garde la trace de l'ajout confirmé hors des disponibilités indiquées. Une réponse « sans réponse » ne demande aucune confirmation.

## Ce que voit la personne sollicitée

Le lien **Indiquer mes disponibilités** de l'email ouvre la page **Mes disponibilités pour** suivie du nom de l'événement, sans compte à créer. Elle y voit ses propres réponses, jamais celles des autres.

- Pour chaque date, elle choisit **Disponible sur des plages** et indique le début et la fin de chaque plage, ou **Pas disponible**. Une plage du soir peut finir le lendemain matin : de 20h à 3h, par exemple. Une date laissée sans choix reste « sans réponse ».
- **Pas disponible pendant tout l'événement** coche « Pas disponible » pour chaque date ; il faut ensuite enregistrer.
- Elle peut changer ses réponses jusqu'à la date limite indiquée en haut de la page ; ensuite, la page les affiche sans pouvoir les modifier.
- Une heure qui n'existe pas ou existe deux fois la nuit d'un changement d'heure est refusée : il faut choisir une heure juste avant ou après.
- Le lien est personnel. Il cesse de fonctionner si vous arrêtez la collecte ou corrigez son adresse email ; dans ce dernier cas, un nouveau lien part à la nouvelle adresse.
