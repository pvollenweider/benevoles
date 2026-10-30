---
roles: [admin]
group: membres
order: 50
summary: Demander les plages libres de chaque membre par un lien personnel, préparer des affectations en brouillon puis les publier en une fois (bêta).
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

**Voir et corriger** ouvre ses réponses date par date. Votre correction remplace la réponse des dates modifiées et reste possible après la date limite ; elle est notée « par l'organisation ». Une réponse marquée « À revoir » a changé après la publication des affectations (voir plus bas), ou vient de la fusion de deux fiches qui avaient répondu différemment : la réponse de la fiche gardée est conservée, jamais un mélange des deux. **Marquer comme vu** retire la mention quand vous avez relu la réponse ; si la personne la change encore entre-temps, la mention reste.

Seuls les organisateurs voient les réponses. Elles ne sont jamais copiées quand vous dupliquez l'événement.

## Affecter selon les disponibilités

Page **Affecter selon les disponibilités**, ouverte depuis la page **Disponibilités**, depuis la liste des inscriptions filtrée sur un créneau (**Voir qui est disponible pour ce créneau**) ou depuis un créneau à compléter de **Où manque-t-il du monde ?** (**Voir les disponibilités**). Choisissez un créneau puis **Afficher** : chaque personne apparaît sur une carte. Vous décidez qui ajouter ; personne n'est placé automatiquement.

- **Qui est listé** : les personnes sollicitées pour leurs disponibilités et celles déjà prévues sur l'événement, membres actifs de l'organisation. **Voir tous les membres actifs** élargit la liste. Les personnes déjà sur ce créneau (place confirmée, demande, liste d'attente) ne sont pas listées : leur nombre est indiqué.
- **Disponibilité pour ce créneau**, d'après les réponses, dans le fuseau de l'événement : **Disponible sur tout le créneau**, **Disponible sur une partie du créneau** (avec le temps libre et le reste), **Sans réponse pour ces heures** ou **Pas disponible à ces heures**, et les plages indiquées. Pour un créneau de nuit, la réponse de la veille compte aussi : une plage de 20h à 3h couvre le début de la journée suivante. Tant que la date du créneau ou la veille n'a pas de réponse, ces heures restent « sans réponse », jamais « pas disponible ».
- **Heures déjà prévues** sur l'événement (places confirmées et demandes en attente de validation), dont celles du même jour (de la même journée de service quand l'événement protège les pauses et la charge), les missions qui s'enchaînent **sans pause** avec ce créneau et celles qui le **chevauchent**.
- **Pauses et charge** : si l'événement les protège, une personne que ses limites empêchent d'ajouter n'a pas de bouton, et la carte dit pourquoi ; sinon, les alertes habituelles s'affichent et l'ajout reste possible.
- **Trier** : **Par nom**, ou **Pour répartir la charge** : d'abord les personnes qui peuvent être ajoutées, puis selon leur disponibilité, puis celles qui ont le moins d'heures déjà prévues sur l'événement, puis par nom. **Disponibles sur tout le créneau seulement** masque les autres.
- **Ajouter à ce créneau** inscrit la personne comme l'ajout manuel des inscriptions (même email de confirmation, mêmes contrôles).
- Deux personnes du même nom sont distinguées par leur adresse email (ou « sans email ») sous leur nom.

Une personne qui a indiqué ne pas être disponible pendant une partie du créneau peut tout de même être ajoutée : cochez d'abord **Ajouter quand même : je sais que … n'a pas indiqué être disponible à ces heures**. La même case apparaît dans **+ Ajouter manuellement** des inscriptions, sous le créneau choisi, quand vous choisissez un membre.

La même confirmation est demandée, dans la fenêtre de confirmation, quand vous placez quelqu'un autrement sur des heures où il a indiqué ne pas être disponible :

- **Accepter** une demande d'inscription sur un créneau « sur validation » : case **Accepter quand même : je sais que …** ;
- **Rétablir** une inscription annulée (place ou demande) : case **Rétablir quand même : je sais que …** ;
- **Valider l'échange** de deux bénévoles : pour chacune des deux personnes, sa disponibilité pour le créneau qu'elle recevrait et, si besoin, sa case **Valider quand même : je sais que …**. Sans confirmation, l'échange reste à valider. Un échange que les bénévoles font entre eux sans validation de l'organisation ne demande rien.

Si la réponse de la personne change entre-temps, rien n'est enregistré : la fenêtre reste ouverte, indique que ses disponibilités ont changé et la case est à cocher de nouveau. La confirmation ne passe jamais outre la protection des pauses et de la charge. Le journal de l'événement garde, pour chaque inscription placée ainsi, l'action, le créneau et le temps hors des disponibilités indiquées (**a confirmé l'affectation malgré les disponibilités indiquées**). Une réponse « sans réponse » ne demande aucune confirmation.

## Préparer des affectations en brouillon

Page **Affectations en brouillon**, ouverte depuis la page **Disponibilités** ou depuis **Affecter selon les disponibilités**. Elle sert à préparer tout le planning avant que les bénévoles ne voient quoi que ce soit, comme dans un tableur : une ligne par personne, une colonne par date de l'événement.

- **Qui est listé** : les personnes sollicitées pour leurs disponibilités, celles déjà prévues sur l'événement et celles qui ont un brouillon. **Voir tous les membres actifs** élargit la liste.
- **Chaque case** dit la réponse de la personne cette date (**Libre de 9h à 12h**, **Pas disponible** ou **Sans réponse**), ses missions (**Confirmée**, **En attente**) et ses brouillons (**Brouillon**), avec **Pas disponible à ces heures** ou **Disponible sur une partie du créneau** quand une mission sort de ses disponibilités. Une mission de nuit apparaît à la date où elle commence, « jusqu'au lendemain ».
- **Résumé** de chaque personne : ses heures confirmées ou en attente, ses heures en brouillon, les mentions « À revoir » et ce qui empêcherait la publication de ses brouillons, par exemple les pauses et limites de charge de l'événement une fois tous ses brouillons publiés.
- **Ajouter** dans une case ouvre les créneaux de cette date pour cette personne, avec sa disponibilité, les places prises et ce que diraient les limites de charge. **Ajouter en brouillon** prépare l'affectation ; la fenêtre reste ouverte pour ajouter, par exemple, une mission de nuit en plus. Pour une personne qui a indiqué ne pas être disponible à ces heures, cochez d'abord **Ajouter quand même : je sais que …**.
- **Voir le brouillon** montre ce qui bloque, permet de **Retirer ce brouillon** et, pour un brouillon « À revoir » ou qui attend une confirmation, d'**Enregistrer la relecture** (avec, si besoin, la case **Publier quand même : je sais que …**).
- **Affichage** : **Tout l'événement** (le tableau) ou **Par jour** (la liste des personnes pour le jour choisi). Sur un téléphone, la page montre toujours la liste par jour.
- Sur la page **Affecter selon les disponibilités**, **Ajouter en brouillon** prépare la même affectation pour un créneau précis.

Un brouillon ne prend aucune place, n'envoie aucun email et n'apparaît ni sur la page publique, ni dans les inscriptions, les exports, les rappels ou les statistiques. Un brouillon devient « À revoir » quand le créneau change (horaires, lieu, conditions) ou quand la personne change ses disponibilités : il faut le relire avant de le publier, même si la nouvelle réponse convient.

## Publier les affectations

En haut de la page **Affectations en brouillon**, **Publier les affectations** publie tous les brouillons d'un coup, après une confirmation. Tout est publié, ou rien : la liste des points qui empêchent la publication s'affiche au-dessus du bouton, chacun avec un lien vers la case concernée. Sont vérifiés, pour tous les brouillons ensemble : les places du créneau (en comptant tous les brouillons), les chevauchements, les postes réservés à certains membres, l'âge minimum, le nombre de créneaux par personne d'un poste, la protection des pauses et de la charge sur tout le programme de chaque personne, la confirmation pour qui a indiqué ne pas être disponible, un créneau annulé ou déjà terminé et une personne qui n'est plus membre actif. Un poste « attribué par l'organisation uniquement » peut être publié.

Chaque brouillon publié devient une inscription confirmée, notée **Affectation publiée** dans la liste des inscriptions. Chaque personne avec une adresse email reçoit un seul email avec toutes ses missions, comme après un ajout manuel. Le journal de l'événement note la publication, chaque inscription créée et chaque confirmation donnée malgré les disponibilités.

## Quand les disponibilités changent après la publication

Une personne à qui des affectations ont été publiées peut corriger ses disponibilités depuis son lien, même après la date limite, jusqu'à la fin du dernier créneau de l'événement. Sa page lui dit que la correction ne modifie ni n'annule ses missions. Si la collecte est arrêtée, son lien ne fonctionne plus.

Une correction ne déplace et ne désinscrit jamais personne. Sa réponse est marquée « À revoir » sur les pages **Disponibilités** et **Affectations en brouillon**, et les propriétaires et organisateurs de l'organisation reçoivent un email, regroupé sur dix minutes par événement, qui dit qui a corrigé et quelles missions sont désormais hors de ses disponibilités. Les responsables de secteur ne le reçoivent pas.

## Ce que voit la personne sollicitée

Le lien **Indiquer mes disponibilités** de l'email ouvre la page **Mes disponibilités pour** suivie du nom de l'événement, sans compte à créer. Elle y voit ses propres réponses, jamais celles des autres.

- Pour chaque date, elle choisit **Disponible sur des plages** et indique le début et la fin de chaque plage, ou **Pas disponible**. Une plage du soir peut finir le lendemain matin : de 20h à 3h, par exemple. Une date laissée sans choix reste « sans réponse ».
- **Pas disponible pendant tout l'événement** coche « Pas disponible » pour chaque date ; il faut ensuite enregistrer.
- Elle peut changer ses réponses jusqu'à la date limite indiquée en haut de la page ; ensuite, la page les affiche sans pouvoir les modifier, sauf si des affectations lui ont été publiées : elle peut alors encore les corriger jusqu'à la fin de l'événement.
- Une heure qui n'existe pas ou existe deux fois la nuit d'un changement d'heure est refusée : il faut choisir une heure juste avant ou après.
- Le lien est personnel. Il cesse de fonctionner si vous arrêtez la collecte ou corrigez son adresse email ; dans ce dernier cas, un nouveau lien part à la nouvelle adresse.
