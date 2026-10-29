---
roles: [admin, benevole]
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

## Côté bénévole

Le lien **Indiquer mes disponibilités** de l'email ouvre la page **Mes disponibilités pour** suivie du nom de l'événement, sans compte à créer.

- Pour chaque date, choisis **Disponible sur des plages** et indique le début et la fin de chaque plage, ou **Pas disponible**. Une plage du soir peut finir le lendemain matin : de 20h à 3h, par exemple. Une date laissée sans choix reste « sans réponse ».
- **Pas disponible pendant tout l'événement** coche « Pas disponible » pour chaque date ; pense ensuite à enregistrer.
- **Enregistrer mes disponibilités** garde tes réponses. Tu peux les changer jusqu'à la date limite indiquée en haut de la page ; ensuite, la page les affiche sans pouvoir les modifier, et l'organisation peut encore les corriger.
- Une heure qui n'existe pas ou existe deux fois la nuit d'un changement d'heure est refusée : choisis une heure juste avant ou après.
- Ce lien est personnel : ne le transmets pas. Seule l'organisation voit tes réponses. Il cesse de fonctionner si l'organisation arrête la collecte ou change ton adresse email ; dans ce dernier cas, un nouveau lien part à ta nouvelle adresse.

## Côté organisation

### Activer la collecte

**Événements**, puis l'événement, puis l'onglet **Paramètres**, **Informations**, carte **Disponibilités datées**. La carte apparaît quand votre organisation participe à la bêta et que la fonction est ouverte à l'essai (voir [Fonctions bêta](personnaliser-l-organisation.md#fonctions-beta)).

- **Recueillir les disponibilités pour cet événement** active la collecte. Les heures sont celles du fuseau horaire de l'organisation au moment de l'activation : il reste celui de l'événement pour toutes les réponses, même si vous changez ensuite le fuseau de l'organisation.
- **Date limite des réponses** (facultatif) : après cette date, les personnes ne peuvent plus changer leurs réponses depuis leur lien ; vous pouvez toujours les corriger. Une nouvelle date limite, plus tard, rouvre la collecte. **Sans date limite** la retire.
- Désactiver la collecte demande une confirmation qui dit combien de liens cesseront de fonctionner. Les réponses déjà données sont gardées. Si vous réactivez la collecte, il faut envoyer de nouveaux liens.

### Demander les disponibilités

Onglet **Inscriptions**, page **Disponibilités** (elle apparaît une fois la collecte activée).

- **Demander leurs disponibilités** : choisissez des membres actifs de l'organisation (recherche, filtre par étiquette). Chacun reçoit par email son lien personnel **Indiquer mes disponibilités**. Une personne déjà sollicitée reçoit le même lien ; personne ne reçoit deux emails à quelques minutes d'intervalle. Un membre sans adresse email est ajouté à la liste sans email : vous saisissez ses réponses vous-même.
- **Relancer les personnes sans réponse** : le même lien, de nouveau, aux personnes qui n'ont rien répondu, sauf celles contactées il y a moins de 48 heures.
- Les emails passent par la file d'envoi, comme les invitations : chaque envoi figure dans les [envois groupés](ecrire-aux-benevoles.md#envois-groupes) de l'onglet **Messages**.

### Voir qui a répondu

Les compteurs **Sans réponse**, **Réponse partielle**, **Réponse complète** et **Aucune date disponible** filtrent la liste ; **Toutes les personnes sollicitées** la montre en entier. Pour chaque personne : son état, le nombre de dates répondues, sa dernière réponse (par la personne ou par l'organisation) et l'état de son lien.

**Voir et corriger** ouvre ses réponses date par date. Votre correction remplace la réponse des dates modifiées et reste possible après la date limite ; elle est notée « par l'organisation ». Une réponse marquée « À revoir » vient de la fusion de deux fiches qui avaient répondu différemment : la réponse de la fiche gardée est conservée, jamais un mélange des deux.

Seuls les organisateurs voient les réponses. Elles ne sont jamais copiées quand vous dupliquez l'événement.
