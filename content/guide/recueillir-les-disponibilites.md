---
roles: [admin]
group: membres
order: 50
summary: Demander à chaque membre les heures où il est libre, préparer des affectations en brouillon, à la main ou par une proposition, puis les publier (bêta).
related: [inviter-des-membres, gerer-les-membres, lien-personnel]
legacy: []
aliases: []
added: 2026-10-29
---

# Recueillir les disponibilités

Fonction bêta « Disponibilités datées ». Elle s'adresse aux événements où l'organisation prépare elle-même les missions : chaque membre sollicité indique, pour chaque date de l'événement, les heures où il est libre ou « Pas disponible ». Les inscriptions restent ouvertes comme d'habitude : rien ne change pour les bénévoles qui choisissent leurs créneaux eux-mêmes.

Ces réponses sont séparées des disponibilités générales de la fiche du membre (« Matin », « Soir »), qui ne disent jamais si une personne est libre une date précise.

## Activer la collecte

**Événements**, puis l'événement, puis l'onglet **Paramètres**, **Informations**, carte **Disponibilités datées**. La carte apparaît quand votre organisation participe à la bêta et que la fonction est ouverte à l'essai (voir [Fonctions bêta](personnaliser-l-organisation.md#fonctions-beta)).

- **Recueillir les disponibilités pour cet événement** active la collecte. Les heures sont celles du fuseau horaire de l'organisation au moment de l'activation : il reste celui de l'événement pour toutes les réponses, même si vous changez ensuite le fuseau de l'organisation.
- **Date limite des réponses** (facultatif), en heure de l'événement (heure suisse pour une organisation en Suisse) : après cette date, les personnes ne peuvent plus changer leurs réponses depuis leur lien ; vous pouvez toujours les corriger. Une nouvelle date limite, plus tard, rouvre la collecte. **Sans date limite** la retire. Une date limite déjà passée demande une confirmation : dès son enregistrement, les personnes ne peuvent plus répondre.
- Désactiver la collecte demande une confirmation qui dit combien de liens cesseront de fonctionner. Les réponses déjà données sont gardées. Si vous réactivez la collecte, il faut envoyer de nouveaux liens.

## Demander les disponibilités

Onglet **Inscriptions**, page **Disponibilités** (elle apparaît une fois la collecte activée).

- **Demander leurs disponibilités** : choisissez des membres actifs de l'organisation (recherche, filtre par étiquette, **Sélectionner les membres affichés**). Chacun reçoit par email son lien personnel **Indiquer mes disponibilités**. Une personne déjà sollicitée reçoit le même lien ; personne ne reçoit deux emails à quelques minutes d'intervalle. Une personne dont le lien a été désactivé (collecte arrêtée puis réactivée) reçoit tout de suite un nouveau lien. Un envoi qui n'a envoyé aucun email s'affiche comme un avertissement, avec la raison. Un membre sans adresse email est ajouté à la liste sans email : vous saisissez ses réponses vous-même.
- **Relancer les personnes sans réponse** : le même lien, de nouveau, aux personnes qui n'ont rien répondu, sauf celles contactées il y a moins de 48 heures. La relance ne renvoie que des liens encore valables : sous le bouton, la page indique combien de personnes sans réponse n'ont plus de lien valable ; demandez-leur de nouveau avec **Demander leurs disponibilités**. Quand la relance n'est pas possible, la raison est écrite sous le bouton.
- Les emails passent par la file d'envoi, comme les invitations : chaque envoi figure dans les [envois groupés](ecrire-aux-benevoles.md#envois-groupes) de l'onglet **Messages**.

## Voir qui a répondu

Les filtres **Sans réponse**, **Réponse partielle**, **Réponse complète** et **Aucune date disponible**, chacun avec son nombre, filtrent la liste ; **Toutes** la montre en entier. Pour chaque personne : son état, le nombre de dates répondues, sa dernière réponse (par la personne ou par l'organisation) et l'état de son lien. Sur un téléphone, la liste montre ces informations personne par personne.

**Voir et corriger** ouvre ses réponses date par date. Votre correction remplace la réponse des dates modifiées et reste possible après la date limite ; elle est notée « par l'organisation ». Une réponse marquée « À revoir » a changé après la publication des affectations (voir plus bas), ou vient de la fusion de deux fiches qui avaient répondu différemment : la réponse de la fiche gardée est conservée, jamais un mélange des deux. **Marquer comme vu** retire la mention quand vous avez relu la réponse ; si la personne la change encore entre-temps, la mention reste.

Seuls les organisateurs voient les réponses. Elles ne sont jamais copiées quand vous dupliquez l'événement.

## Affecter selon les disponibilités

Page **Affecter selon les disponibilités**, ouverte depuis la page **Disponibilités**, depuis la liste des inscriptions filtrée sur un créneau (**Voir qui est disponible pour ce créneau**) ou depuis un créneau à compléter de **Où manque-t-il du monde ?** (**Voir les disponibilités**). Choisissez un créneau puis **Afficher** : chaque personne apparaît sur une carte. Vous décidez qui ajouter ; personne n'est placé automatiquement.

- **Qui est listé** : les personnes sollicitées pour leurs disponibilités et celles déjà prévues sur l'événement, membres actifs de l'organisation. **Voir tous les membres actifs** élargit la liste. Les personnes déjà sur ce créneau (place confirmée, demande, liste d'attente) ne sont pas listées : leur nombre est indiqué.
- **Disponibilité pour ce créneau**, d'après les réponses, dans le fuseau de l'événement : **Disponible sur tout le créneau**, **Disponible sur une partie du créneau** (avec le temps libre et le reste), **Sans réponse pour ces heures** ou **Pas disponible à ces heures**, et les horaires indiqués. Pour un créneau de nuit, la réponse de la veille compte aussi : un horaire de 20h à 3h couvre le début de la journée suivante. Tant que la date du créneau ou la veille n'a pas de réponse, ces heures restent « sans réponse », jamais « pas disponible ».
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

## Générer une proposition d'affectations

Fonction bêta « Proposition d'affectations ». Depuis la page **Affectations en brouillon**, **Générer une proposition** ouvre la page **Proposition d'affectations** : vous choisissez un périmètre, et une répartition est proposée puis écrite dans les affectations en brouillon. Rien n'est publié et personne n'est prévenu : vous relisez, verrouillez ou corrigez les brouillons, puis vous publiez vous-même.

- **Ce qui est vérifié** : une personne n'est placée que sur un créneau entièrement couvert par les disponibilités qu'elle a indiquées (une date sans réponse ne compte jamais comme libre), et toujours en respectant les places, l'âge minimum, les postes réservés, les chevauchements, le nombre de créneaux par personne d'un poste et la protection des pauses et de la charge. La protection doit être activée et complète dans les informations de l'événement ; sinon le bouton reste indisponible. Les inscriptions existantes et les brouillons manuels ou verrouillés ne bougent jamais.
- **Périmètre** : les dates, les postes (regroupés par secteur) et les personnes. Une ligne indique combien de créneaux et de places sont à pourvoir. Les personnes qui n'ont pas répondu peuvent être incluses, mais ne sont placées nulle part : la proposition peut se faire avec les réponses déjà reçues.
- **Objectif d'heures** : pour chaque personne incluse, en heures sur l'événement (0 pour aucun objectif). Aucun objectif n'est rempli à votre place : **Appliquer la suggestion** remplit 6 h par date où la personne a indiqué une plage libre, plafonnées par le maximum de l'événement ; vous ajustez ensuite. Si vous lancez le calcul alors que des personnes incluses n'ont pas d'objectif, un seul point à corriger les compte (« 11 personnes sans objectif d'heures »), avec **Appliquer la suggestion aux 11 personnes sans objectif**, qui ne remplit que les champs vides. La charge de chacun est comparée à son propre objectif : une personne qui vise 10 h n'est pas mise au même niveau qu'une personne qui en vise 20. Vous pouvez aussi indiquer un **Poste souhaité** et un **Poste à éviter** ; ces souhaits passent après toutes les règles.
- **Rotation, nuit et réserve (facultatif)**, replié, avec le résumé de ses réglages (« Aucun réglage » sinon) : par poste, une **Catégorie de rotation** (les postes qui ont le même nom de catégorie comptent ensemble, un poste sans catégorie est la sienne), **Ajout de nuit** pour les missions courtes après une soirée, et la **Réserve à garder par créneau** pour un poste de renfort sur place. Les deux limites, **Jours d'affilée sur une même catégorie, au plus** et **Ajouts de nuit par personne, au plus**, peuvent être remplies avec **Remplir avec 2 jours d'affilée et 2 ajouts de nuit au plus**, ou laissées vides.
- **Paramètres de calcul (facultatif)**, replié : le **Numéro de tirage**. Avec le même numéro et les mêmes données, la proposition est toujours la même ; un autre numéro donne une autre répartition qui respecte les mêmes règles.

**Générer une proposition** lance le calcul, qui dure au plus 30 secondes ; **Arrêter la recherche** l'interrompt. Si la nouvelle proposition doit remplacer des brouillons proposés et non verrouillés de son périmètre, une fenêtre dit combien et demande de confirmer. Les objectifs passent avant tout dans cet ordre : couvrir les minimums des créneaux et la réserve demandée, puis les autres places, puis rapprocher la charge de chacun de son objectif, puis varier les activités, puis les souhaits.

Le résultat s'affiche en haut de la page, au-dessus de **Nouvelle proposition** (le formulaire, prérempli avec les choix de la dernière proposition ; **Préparer une nouvelle proposition** y mène). Il commence par les places couvertes, par exemple « 29 places couvertes sur 31 », puis son état : **Toutes les places couvertes**, **Couverture partielle** (des places restent sans personne, sans preuve qu'on ne pouvait pas faire mieux), **Couverture complète impossible** (certaines places ne peuvent être prises par personne, quelle que soit la répartition : c'est le meilleur résultat possible sur ce périmètre, pas une erreur), **Calcul arrêté avant la fin** ou **Échec du calcul**. Suivent le numéro de tirage, les affectations écrites, les **Places restées vides** avec leur raison, la **Charge par personne** (un tableau sur grand écran, une liste sur téléphone) et les **Affectations proposées**, chacune avec la raison de son choix. Un calcul arrêté n'écrit rien : **Utiliser ce résultat partiel** l'écrit si vous le décidez ; si les données ont changé depuis le calcul, la fenêtre propose d'abord **Relancer la proposition**, et **Écrire quand même** reste possible. Si le suivi du calcul s'interrompt (connexion perdue), la page le dit et propose de la recharger.

**Propositions précédentes** liste les dernières propositions, chacune avec sa date, son état, ses places couvertes, son numéro de tirage et ce qui a été écrit.

Au moment d'écrire, tout est vérifié de nouveau sur les données du moment : une affectation qui ne convient plus (disponibilité changée, inscription arrivée entre-temps) est écartée et signalée. Une nouvelle proposition remplace seulement les brouillons proposés et non verrouillés de son périmètre. Si les données changent ensuite, la proposition est signalée **Proposition périmée** ; la publication vérifie de toute façon chaque règle.

Sur la page **Affectations en brouillon**, un brouillon venu d'une proposition est noté **Proposé**. **Voir le brouillon** permet de le **Verrouiller** : une nouvelle proposition ne le remplace jamais, et le brouillon porte la mention **Verrouillé** avec un cadenas. Enregistrer la relecture d'un brouillon proposé le verrouille aussi.

## Publier les affectations

En haut de la page **Affectations en brouillon**, **Publier les affectations** publie tous les brouillons d'un coup, après une confirmation. Tout est publié, ou rien : la liste des points qui empêchent la publication s'affiche au-dessus du bouton, chacun avec un lien vers la case concernée. Sont vérifiés, pour tous les brouillons ensemble : les places du créneau (en comptant tous les brouillons), les chevauchements, les postes réservés à certains membres, l'âge minimum, le nombre de créneaux par personne d'un poste, la protection des pauses et de la charge sur tout le programme de chaque personne, la confirmation pour qui a indiqué ne pas être disponible, un créneau annulé ou déjà terminé et une personne qui n'est plus membre actif. Un poste « attribué par l'organisation uniquement » peut être publié.

Chaque brouillon publié devient une inscription confirmée, notée **Affectation publiée** dans la liste des inscriptions. Chaque personne avec une adresse email reçoit un seul email avec toutes ses missions, comme après un ajout manuel. Le journal de l'événement note la publication, chaque inscription créée et chaque confirmation donnée malgré les disponibilités.

## Quand les disponibilités changent après la publication

Une personne à qui des affectations ont été publiées peut corriger ses disponibilités depuis son lien, même après la date limite, jusqu'à la fin du dernier créneau de l'événement. Sa page lui dit que la correction ne modifie ni n'annule ses missions. Si la collecte est arrêtée, son lien ne fonctionne plus.

Une correction ne déplace et ne désinscrit jamais personne. Sa réponse est marquée « À revoir » sur les pages **Disponibilités** et **Affectations en brouillon**, et les propriétaires et organisateurs de l'organisation reçoivent un email, regroupé sur dix minutes par événement, qui dit qui a corrigé et quelles missions sont désormais hors de ses disponibilités. Les responsables de secteur ne le reçoivent pas.

## Ce que voit la personne sollicitée

Le lien **Indiquer mes disponibilités** de l'email ouvre la page **Mes disponibilités pour** suivie du nom de l'événement, sans compte à créer. Elle y voit ses propres réponses, jamais celles des autres. Une date sans réponse porte la mention « (sans réponse) » sous son titre.

- Pour chaque date, elle choisit **Disponible à certaines heures** et indique le début et la fin de chaque horaire (**Ajouter un autre horaire**, **Retirer cet horaire**), ou **Pas disponible**. Un horaire du soir peut finir le lendemain matin : de 20h à 3h, par exemple. Une date laissée sans choix reste « sans réponse ». **Reprendre les horaires du …** recopie la réponse de la date précédente.
- Sous les dates, **Je ne peux pas venir du tout** : **Pas disponible pendant tout l'événement** coche « Pas disponible » pour chaque date ; il faut ensuite enregistrer. Un lien en haut du formulaire y mène directement.
- Tant que des changements ne sont pas enregistrés, « Changements non enregistrés » s'affiche près du bouton. Les heures manquantes sont toutes signalées en une fois, avec une liste de liens vers les champs à compléter ; deux horaires qui se recouvrent sont décrits en clair sous l'horaire à raccourcir. Une fois enregistré, la page dit que c'est fait et jusqu'à quand les réponses peuvent encore changer.
- Elle peut changer ses réponses jusqu'à la date limite indiquée en haut de la page ; ensuite, la page les affiche sans pouvoir les modifier, avec l'adresse de l'organisation pour une correction (l'adresse de réponse des [paramètres des emails](parametres-et-suivi-des-emails.md)), sauf si des affectations lui ont été publiées : elle peut alors encore les corriger jusqu'à la fin de l'événement. Si la date limite passe pendant qu'elle remplit la page, celle-ci lui dit que ses derniers changements n'ont pas été enregistrés et montre les réponses reçues.
- Une heure qui n'existe pas ou existe deux fois la nuit d'un changement d'heure est refusée : il faut choisir une heure juste avant ou après.
- Le lien est personnel. Il cesse de fonctionner si vous arrêtez la collecte ou corrigez son adresse email ; dans ce dernier cas, un nouveau lien part à la nouvelle adresse. Un lien qui ne fonctionne plus affiche « Lien introuvable » avec le nom de l'organisation et l'invitation à répondre à son email ; trop de tentatives ou une connexion perdue ont leur propre message, avec **Réessayer**.
