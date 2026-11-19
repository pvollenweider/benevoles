---
roles: [admin, benevole]
group: apres-inscription
order: 40
summary: Les rappels envoyés avant chaque journée de créneaux, par email ou notification sur le téléphone, et les messages quand un créneau change ou est annulé.
related: [ma-page-personnelle, inscriptions-sur-validation]
legacy: [admin#rappels-automatiques, admin#notifications-de-modification, benevole#recevoir-les-rappels-sur-votre-telephone]
aliases: []
---

# Rappels et changements de créneau

<!-- video: REMINDERS_CHANGES -->

Chaque bénévole confirmé d'un événement publié reçoit des rappels par email avant chaque journée de créneaux, et un email quand un de ses créneaux change d'horaire ou est annulé. Les demandes sur validation et les places en liste d'attente ne reçoivent aucun rappel tant qu'elles ne sont pas confirmées.

## Côté bénévole

Les rappels arrivent dans ta boîte email, avec tes créneaux du jour, leurs infos pratiques et la personne à contacter : environ 2 jours avant, la veille, puis 2 à 4 heures avant ton premier créneau du jour. Avec plusieurs créneaux le même jour pour le même événement, un seul email les regroupe pour chaque rappel, si leurs places existaient avant l'envoi de ce rappel. Chaque rappel porte le bouton **Mes inscriptions** vers ton lien pour toutes tes inscriptions auprès de l'organisation, avec la phrase qui en rappelle la portée ; les liens propres à un événement déjà reçus continuent de fonctionner. Quand l'organisation a fixé un délai d'annulation plus tôt que le début du créneau, le rappel donne la date limite, ou dit qu'elle est passée et qu'il faut prévenir l'organisation directement. Si un horaire change ou si un créneau est annulé, un email te prévient ; pense alors à mettre à jour ton calendrier (voir [Mes inscriptions](ma-page-personnelle.md#ajouter-mes-creneaux-a-mon-calendrier)).

### Recevoir les rappels sur ton téléphone

Sur ta page **Mes inscriptions**, le bouton **Recevoir des rappels push** active les **notifications du navigateur** (il figure aussi sur la page de confirmation si ton inscription vient d'un lien d'invitation). Tu reçois alors, en plus de l'email, un rappel 2 jours avant, la veille et le jour de ton créneau, et les messages urgents de l'organisation quand elle choisit de te prévenir aussi par notification (le message complet arrive toujours par email). Avec plusieurs créneaux le même jour pour le même événement, un seul rappel (email et notification) les regroupe ; un créneau sur un autre événement le même jour garde son propre rappel.

Ton navigateur te demande d'abord ton autorisation ; tu peux la retirer à tout moment dans ses réglages. Le bouton n'apparaît pas si ton navigateur ne gère pas les notifications ou si le site ne les propose pas. Si l'activation échoue, un message sous le bouton le dit : tu peux réessayer un peu plus tard.

### Sur iPhone ou iPad

Sur iPhone et iPad, les notifications ne fonctionnent que pour une page ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent). Ouverte dans le navigateur, ta page **Mes inscriptions** affiche donc, à la place du bouton, les étapes pour l'y ajouter :

1. Touche le bouton Partager : un carré avec une flèche vers le haut. Si tu ne le vois pas, touche d'abord le bouton « … » (trois points).
2. Choisis « Sur l'écran d'accueil » (ou « Ajouter à l'écran d'accueil »), puis « Ajouter ».
3. Ouvre la page avec la nouvelle icône **Mes inscriptions**, puis touche **Recevoir des rappels push**.

L'icône ouvre ta propre page **Mes inscriptions** : comme un favori, elle garde ton lien personnel sur l'appareil. Ne l'ajoute pas sur un téléphone ou une tablette que tu partages. Sur une version d'iOS plus ancienne, ni le bouton ni les étapes n'apparaissent : les notifications n'y sont pas possibles, les rappels arrivent par email.

### Installer ta page sur Android ou sur un ordinateur

Chrome et Edge peuvent aussi installer ta page **Mes inscriptions** comme une application : dans le menu du navigateur, cherche « Installer la page en tant qu'application » ou « Ajouter à l'écran d'accueil », selon le navigateur. Elle s'ouvre alors dans sa propre fenêtre, avec son icône, toujours sur ta page. Ce n'est pas nécessaire pour les notifications, qui fonctionnent aussi dans le navigateur.

### Je ne veux pas oublier mon créneau le jour J

Active les notifications du navigateur sur ta page **Mes inscriptions** (voir ci-dessus) : en plus de l'email, tu reçois un rappel 2 jours avant, la veille et le jour même.

## Côté organisation

### Rappels automatiques

Pour un événement publié, chaque bénévole confirmé reçoit des rappels par email :
- **J-2** (environ 48 h avant son premier créneau du jour) : rappel avec le détail des créneaux ;
- **J-1** (environ 24 h avant) : rappel court ;
- **Jour J** (2 à 4 h avant) : rappel de dernière minute.

Les rappels sont regroupés par bénévole, par événement et par jour : une personne inscrite sur plusieurs créneaux le même jour pour un même événement reçoit un seul email par rappel (un seul J-2, un seul J-1, un seul rappel du jour), listant tous ses créneaux de ce jour-là dans l'ordre des horaires. Inscrite le même jour sur un autre événement, elle reçoit un email séparé pour celui-ci. Un créneau de nuit (qui se termine après minuit) compte sur son jour de début. Une inscription faite après l'envoi d'un rappel ne reçoit pas ce rappel-là : elle reçoit les suivants, tant que leur heure n'est pas passée. Un rappel déjà marqué comme envoyé n'est pas renvoyé au passage suivant ; dans le cas rare où deux traitements se chevauchent, un même rappel peut exceptionnellement partir deux fois.

### Notifications de modification

- **Annulation d'un créneau** : les bénévoles inscrits sont avertis automatiquement par email et leur inscription est annulée. En annulant un créneau depuis le planning (**Créneau annulé**), vous pouvez cocher **Ne pas prévenir les inscrits** : leurs inscriptions sont annulées sans email, et le choix est noté dans le journal (voir [Modifier vite depuis le planning](modifier-vite-depuis-le-planning.md)).
- **Modification des horaires** : un email est envoyé aux bénévoles inscrits.

### Régler les rappels

Les rappels partent sans intervention de votre part pour les événements publiés, sauf ceux décochés pour toute l'organisation dans **Paramètres**, puis **Emails** (voir [Paramètres des emails](parametres-et-suivi-des-emails.md#parametres-des-emails)). Pour couper tous les rappels d'un seul événement, décochez **Rappels automatiques** dans son formulaire de modification ; cochée, la case laisse s'appliquer les paramètres de l'organisation, sauf si l'événement a ses propres délais : ils remplacent alors ces paramètres.

L'encadré des rappels automatiques, dans l'onglet **Messages** de l'événement (section **Rappels**), indique ce qui partira vraiment pour cet événement : les rappels envoyés avec leur délai, ceux désactivés pour l'organisation, ou l'absence de rappel (désactivés pour l'organisation, coupés pour cet événement, ou plus aucun créneau à venir). Pour un événement qui a ses propres délais, il les liste à la place des trois rappels habituels. Pour un brouillon, il précise que les rappels ne partent qu'une fois l'événement publié. Ses liens mènent à la case **Rappels automatiques** de l'événement et aux paramètres des emails de l'organisation. La section **Messages** de l'aperçu de l'événement en donne le résumé : le prochain rappel automatique et sa date.

![Encadré « Rappels automatiques activés » de l'onglet Messages : Rappel J-2 environ 48 h avant le premier créneau du jour, Rappel J-1 environ 24 h avant, Rappel du jour 2 à 4 h avant, une phrase sur le regroupement en un seul email par jour, et les liens « Rappels automatiques de l'événement » et « Paramètres des emails de l'organisation »](/doc-img/admin-reminders.png)

Pour envoyer vous-même un rappel à tous les inscrits, voir [Rappel manuel](ecrire-aux-benevoles.md#rappel-manuel). Pour un rappel à une date et une heure que vous choisissez, en plus des rappels automatiques, voir [Programmer l'envoi](ecrire-aux-benevoles.md#programmer-l-envoi).

### Donner des délais propres à un événement

Dans l'onglet **Messages** de l'événement, section **Rappels**, sous l'encadré des rappels automatiques, laissez **Délais habituels** coché pour garder les trois rappels J-2, J-1 et jour J, ou choisissez **Délais propres à cet événement**. Vous pouvez définir jusqu'à trois rappels, chacun en heures (2 à 336) ou en jours (1 à 14). Un jour compte 24 heures écoulées : un rappel de 2 jours part 48 heures avant le premier créneau de la journée du bénévole, pas à la même heure deux jours calendaires avant.

![Formulaire « Délais des rappels automatiques » de l'onglet Messages : le choix « Délais propres à cet événement » est coché, avec deux rappels actifs, « 3 jours » et « 2 heures », les boutons « Ajouter un rappel » et « Enregistrer les rappels », puis la ligne « Prochain envoi » qui donne le jour, l'heure et le nombre de personnes du prochain rappel.](/doc-img/admin-reminder-rules.png)

Chaque délai se compte à rebours du premier créneau de la journée du bénévole, pour cet événement. Un créneau de nuit garde son jour de début. Une fois ce premier créneau commencé, aucun rappel de cette journée ne part plus. Une règle décochée ne part pas ; si toutes les règles sont décochées, aucun rappel automatique ne part pour cet événement. Revenir aux délais habituels rétablit les trois rappels J-2, J-1 et jour J. Les délais propres remplacent ces trois rappels et les interrupteurs J-2, J-1 et jour J de l'organisation pour cet événement ; la case **Rappels automatiques** de l'événement continue de tout couper. Pour un événement publié, la ligne **Prochain envoi** sous le formulaire indique le prochain rappel, son jour et son heure dans le fuseau de l'organisation, et le nombre de personnes et de créneaux concernés.

Une personne qui s'inscrit après l'heure d'un rappel ne reçoit pas ce rappel-là ; elle reçoit les suivants dont l'heure n'est pas passée. De même, un rappel ajouté ou réactivé après son heure ne part pas pour cette journée. Changer un délai crée un nouveau rappel : les personnes qui ont déjà reçu l'ancien peuvent recevoir le nouveau si son heure n'est pas encore passée, et un délai que vous remettez, même après l'avoir retiré, n'est jamais renvoyé deux fois à la même personne pour le même jour.

### Un bénévole inscrit sur plusieurs créneaux le même jour reçoit-il beaucoup de rappels ?

Non, tant que ses places existent avant chaque envoi : une personne inscrite sur trois créneaux d'une même journée reçoit un seul email à J-2, un seul à J-1 et un seul le jour même, listant les créneaux déjà confirmés à ce moment-là. Un créneau ajouté après un rappel n'entre pas dans cet email déjà parti ; il est inclus dans les rappels suivants, s'il en reste. Si elle est aussi inscrite le même jour sur un autre événement, elle reçoit un email séparé pour celui-ci. Pour envoyer moins de rappels encore, décochez ceux qui ne vous servent pas dans **Paramètres**, puis **Emails** : le paramètre vaut pour toute l'organisation, sauf pour un événement qui a ses propres délais.
