---
roles: [admin]
group: preparer
order: 110
summary: Désigner des bénévoles responsables d'un poste : un lien personnel, sans compte, leur montre qui est inscrit sur ce poste.
related: [suivre-les-inscriptions, ou-manque-t-il-du-monde]
legacy: [admin#responsables-de-secteur]
aliases: []
---

# Responsables de secteur

<!-- video: SECTOR_LEADERS -->

**Événements**, puis l'événement, puis l'onglet **Paramètres**, et **Responsables de secteur** dans ses pages

Désignez un ou plusieurs bénévoles responsables d'un poste (ex. « Bar »). Chacun reçoit un lien personnel, sans compte à créer, qui affiche en lecture seule la liste des bénévoles inscrits sur ce poste (nom, email, téléphone). Pour les créneaux qui ont un minimum de personnes, la page indique aussi « 2/4 · minimum atteint » ou « 1/4 · sous le minimum (2) », et liste en tête les créneaux sous leur minimum, même ceux où personne n'est encore inscrit. Un poste [attribué par l'organisation uniquement](gerer-les-postes.md) se suit de la même façon : son responsable voit les personnes que vous y avez ajoutées, et ne voit pas plus que pour un autre poste.

![Liste des responsables de secteur d'un événement, avec le poste, le nom et l'action retirer](/doc-img/admin-sector-leaders.png)

- **+ Ajouter un responsable** : poste (autocomplété depuis les postes qui ont au moins un créneau non annulé), nom, email, ou **Depuis les inscrits** pour choisir directement un bénévole déjà inscrit à l'événement, qui pré-remplit ces champs
- Depuis la page des inscriptions, sélectionner une seule ligne puis **Rendre responsable** propose directement le poste de ce créneau

  ![Fenêtre « Rendre Camille Rochat responsable » : choix du poste parmi ceux où la personne est inscrite, et email pré-rempli](/doc-img/admin-make-leader-modal.png)
- Un email est automatiquement envoyé au responsable avec son lien personnel ; il est aussi prévenu à chaque nouvelle inscription sur son poste, et à chaque désistement d'une place confirmée ou d'une demande (paramètre **Prévenir en cas de désistement**, voir [Paramètres et suivi des emails](parametres-et-suivi-des-emails.md#parametres-des-emails)). Si une question aux bénévoles est rattachée à son poste, il reçoit aussi, à la place des organisateurs, les modifications de réponse à cette question, regroupées en un email (voir [Questions aux bénévoles](questions-aux-benevoles.md#rattacher-une-question-a-un-poste))
- **Retirer** un responsable à tout moment (confirmation demandée)
- Renommer le poste dans **Gérer les postes** emporte ses responsables : leur lien reste le même et affiche le poste sous son nouveau nom. Si une personne était déjà responsable d'un poste portant ce nouveau nom, elle n'y garde qu'une désignation, celle du poste renommé. Supprimer le poste ne retire pas ses responsables : le poste reste affiché avec la mention « Créneaux tous annulés », comme un poste dont vous avez annulé chaque créneau. Leur lien reste valable mais n'affiche plus aucun créneau, et ils ne sont pas repris si vous dupliquez l'événement. Retirez-les si vous ne recréez pas ce poste ; un nouveau créneau de ce poste leur rend leur poste
- La fiche du bénévole concerné (**Membres**) reçoit automatiquement l'étiquette « responsable »
- Les bénévoles confirmés du poste voient le **nom** de son ou ses responsables (« Responsable du poste : … ») sur leur page **Mes inscriptions**, dans les rappels automatiques et sur le planning individuel imprimé. Jamais son email ni son téléphone : pour que les bénévoles puissent l'appeler, indiquez-le comme contact du créneau ou comme **Contact le jour J**. Rien n'apparaît sur la page d'inscription

## Confier tout un secteur (bêta)

Dans un événement qui [utilise des secteurs](gerer-les-postes.md), un responsable peut suivre **tout un secteur** plutôt qu'un seul poste : le responsable du secteur « Parking » voit tous ses postes, par exemple « Parking Nord », « Parking Sud » et « École ». Cette possibilité fait partie des fonctions bêta : elle apparaît quand la fonction **Responsables de secteur** est active pour votre organisation (**Paramètres**).

- Dans un tel événement, la page s'appelle **Responsables de poste et de secteur** et classe les responsables par secteur : pour chaque secteur, ses postes, la personne responsable de tout le secteur, puis les responsables de ses postes. Les postes qui ne sont dans aucun secteur viennent en dernier
- **+ Ajouter un responsable** demande d'abord **Responsable de** : **Tout un secteur** (choisissez le secteur dans la liste) ou **Un poste précis** (comme dans un événement sans secteurs)
- Le lien du responsable de secteur montre les postes qui sont **en ce moment** dans son secteur, classés par poste, avec un filtre **Jour**. Un poste que vous ajoutez au secteur dans **Gérer les secteurs et postes** y apparaît aussitôt ; un poste que vous en retirez disparaît dès la page suivante. Les nombres affichés ne comptent que les postes du secteur
- Il reçoit les emails de nouvelle inscription et de désistement de tous les postes du secteur. Une personne responsable à la fois du secteur et d'un de ses postes ne reçoit qu'un email, avec le lien du secteur
- Renommer le secteur ne change rien pour ses responsables : leur lien affiche le nouveau nom. Archiver le secteur vide son lien, qui reste valable : les responsables ne voient plus aucun poste jusqu'à ce que vous rétablissiez le secteur et y replaciez des postes
- Dupliquer l'événement avec ses responsables reprend les responsables de secteur dans la copie du secteur, sauf ceux d'un secteur archivé
- Être responsable ne prend aucune place et ne compte aucune heure. Les bénévoles ne voient pas les secteurs : sur leur page, seul le nom des responsables de leur poste apparaît
- Les modifications de réponse à une question rattachée à un poste vont aux responsables de ce poste, pas à ceux du secteur

![Page de la responsable du poste Buvette : chaque créneau avec ses bénévoles inscrits, leur email et leur téléphone, et les personnes en liste d'attente](/doc-img/leader-page.png)

## Questions fréquentes

### Les bénévoles aimeraient savoir qui est déjà inscrit sur un créneau.

La page d'inscription d'un événement n'affiche aucun nom aux visiteurs anonymes : elle montre les places libres, jamais les personnes inscrites. Avec le paramètre **Montrer aux bénévoles qui est inscrit**, activé par défaut sur un nouvel événement, les bénévoles confirmés (avec leur lien personnel) et les membres que vous invitez (avec le lien de leur invitation) voient sur la page d'inscription, avec l'interrupteur **Voir qui est inscrit**, le prénom et l'initiale du nom de celles et ceux qui l'acceptent, et le nombre des autres (voir [Créer un événement](creer-un-evenement.md#page-blanche)). Jamais par un lien par groupe ni sur votre site. Pour qu'une personne suive l'équipe d'un poste, avec les coordonnées, désignez-la responsable de secteur : son lien personnel affiche qui est inscrit sur son poste.

### Je veux qu'une personne suive « son » poste sans lui donner accès à tout l'espace organisateur.

Désignez-la responsable de secteur. Elle reçoit un lien personnel, sans compte à créer, qui affiche uniquement qui est inscrit sur son poste : parfait pour un chef d'équipe sécurité ou un responsable bar qui doit juste savoir qui arrive et quand.
