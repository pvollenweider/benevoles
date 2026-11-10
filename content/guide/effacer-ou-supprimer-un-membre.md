---
roles: [admin]
group: membres
order: 30
summary: Supprimer une fiche inactive sans inscription, ou effacer les données personnelles d'un membre qui le demande.
related: [gerer-les-membres, exporter-et-conserver-ses-donnees]
legacy: [admin#supprimer-une-fiche, admin#effacer-les-donnees-personnelles-d-un-membre]
aliases: []
---

# Effacer ou supprimer un membre

## Supprimer une fiche

Une fiche se supprime définitivement quand elle est **inactive** et n'a **aucune inscription**, quel que soit son statut (confirmée, en liste d'attente, proposée, demandée, annulée, refusée) : rien, dans l'historique d'aucun événement, ne pointe plus vers elle. Une fiche avec des inscriptions ne se supprime pas : ses données personnelles s'effacent (section suivante) ; une fiche fusionnée dans une autre (voir [Doublons et fusion de fiches](doublons-et-fusion.md)) n'est jamais proposée à la suppression non plus : elle est supprimée automatiquement 30 jours après la fusion.

Le bouton **Supprimer** n'apparaît, sur la ligne de la fiche dans la liste des membres et sur sa page **Activité**, que lorsqu'elle remplit ces deux conditions ; sinon la page **Activité** explique en mots pourquoi elle ne peut pas être supprimée (fiche encore active, ou inscriptions à conserver). La confirmation nomme la personne, précise que l'action est **irréversible** et liste ce qui disparaît avec la fiche : ses invitations, ses réponses aux questions des événements, ses abonnements aux notifications du navigateur, les suivis d'envoi d'email la concernant et les doublons possibles écartés qui la citaient. Aucun email n'est envoyé. L'action est journalisée dans le journal d'activité de l'organisation ; l'activité des autres fiches n'est pas affectée.

![Fenêtre « Supprimer Antoine Bovard ? » : la phrase « Cette action est irréversible », la liste de ce qui disparaît avec la fiche, « Aucun email n'est envoyé », puis les boutons Annuler et Supprimer](/doc-img/admin-member-delete.png)

## Supprimer plusieurs fiches en une fois

Pour retirer d'un coup des membres importés par erreur, cochez-les dans la liste des membres. La case **Tout sélectionner** prend tous les membres du filtre en cours (recherche, étiquette, statut), y compris ceux qui ne tiennent pas à l'écran. Le compteur **N membres sélectionnés** suit la sélection ; elle se vide dès que le filtre change. Les boutons **Désactiver la sélection** et **Supprimer la sélection** n'apparaissent qu'une fois au moins un membre sélectionné.

La confirmation indique combien de membres seront supprimés, rappelle que l'action est **irréversible** et que les membres qui ont des inscriptions ne seront pas supprimés. À la différence de la suppression d'une fiche seule, un membre **actif sans inscription** est supprimé directement : la confirmation explicite remplace l'étape de désactivation. Les fiches qui ont des inscriptions restent, parce que leurs inscriptions doivent rester dans l'historique des événements ; les fiches fusionnées restent aussi, puisque la fusion les supprime automatiquement après son délai. Aucun email n'est envoyé, et chaque suppression est journalisée dans le journal d'activité de l'organisation.

Quand des membres sélectionnés ont des inscriptions, la confirmation propose une case **Désactiver les membres qui ne peuvent pas être supprimés (ceux qui ont des inscriptions)**, décochée par défaut. Son libellé affiche leur nombre quand la liste le connaît, par exemple « … (3 membres) », et la case disparaît quand aucun membre sélectionné n'a d'inscription. Cochée, la même action désactive les membres laissés qui sont encore actifs ; les membres déjà inactifs restent laissés tels quels, sans être désactivés une seconde fois.

![Confirmation « Supprimer 2 membres ? » : les fiches sont supprimées définitivement, les membres qui ont des inscriptions restent, la case décochée « Désactiver les membres qui ne peuvent pas être supprimés (ceux qui ont des inscriptions) (2 membres) », aucun email n'est envoyé, puis les boutons Annuler et Supprimer](/doc-img/admin-members-bulk-delete.png)

Après l'action, la liste se rafraîchit et le résultat est annoncé : par exemple « 198 membres supprimés. 3 laissés car ils ont des inscriptions : Anne Favre, Marc Rochat, Léa Dubois. Vous pouvez les effacer depuis leur fiche. » Avec la case cochée, il dit plutôt « 198 membres supprimés. 3 désactivés car ils ont des inscriptions : Anne Favre, Marc Rochat, Léa Dubois. », et les membres déjà inactifs sont comptés comme laissés. Le focus va sur ce message, ou sur le titre de la page s'il ne reste plus aucun membre. Une sélection de plus de 500 membres part en plusieurs fois, sans que vous ayez à faire quoi que ce soit.

## Désactiver plusieurs fiches en une fois

Pour retirer plusieurs personnes de la liste sans rien supprimer, cochez-les puis choisissez **Désactiver la sélection**, à côté de **Supprimer la sélection**. La confirmation dit combien de membres seront désactivés, qu'aucun email n'est envoyé et que vous pourrez les réactiver en affichant les inactifs : l'action est réversible, rien n'est effacé.

Après l'action, la liste se rafraîchit et le résultat est annoncé : par exemple « 12 membres désactivés. 2 déjà inactifs. » Les fiches déjà inactives ne sont pas désactivées une seconde fois, et les fiches fusionnées sont ignorées. Le focus va sur ce message. Une sélection de plus de 500 membres part en plusieurs fois.

## Effacer les données personnelles d'un membre

Quand une personne demande l'effacement de ses données, ouvrez sa page **Activité** (depuis la liste des membres) et choisissez **Effacer les données personnelles**. C'est possible pour toute fiche, active ou non, avec ou sans inscriptions, par les propriétaires comme par les organisateurs. Seule une fiche déjà fusionnée dans une autre ne le propose pas : effacez alors les données de la fiche conservée.

La fenêtre de confirmation récapitule, avec les nombres de cette fiche :

- **Effacé** : nom, prénom (la fiche s'appelle désormais « Bénévole effacé » et est désactivée), email, téléphone, date de naissance, notes, étiquettes et disponibilités ; le commentaire et le téléphone laissés à ses inscriptions (ses liens personnels ne fonctionnent plus) ; ses invitations (et leur réponse « pas disponible »), ses réponses aux questions des événements (aussi celles que le journal de l'événement a notées quand elle les a modifiées depuis sa page **Mes inscriptions**), ses abonnements aux notifications, ses désignations comme responsable de secteur faites avec son adresse, les anciennes fiches fusionnées dans la sienne, les emails en attente ou déjà envoyés qui la concernent ou la nomment, et les suivis d'envoi d'email.
- **Conservé** : ses inscriptions (créneau, statut, présence), sans identité, pour que les effectifs, les heures et l'historique des événements restent justes ; les journaux d'activité, où elle apparaît comme « Bénévole effacé ». Les attestations de bénévolat et les exports d'heures ne la nomment plus.

![Fenêtre « Effacer les données personnelles de Camille Rochat ? » : l'avertissement d'irréversibilité, la liste « Effacé » (nom, email, téléphone, date de naissance, notes, étiquettes et disponibilités, commentaires et téléphones des inscriptions, invitations, réponses aux questions, emails) et la liste « Conservé » (inscriptions sans identité et journaux d'activité), le champ où saisir « effacer », puis les boutons Annuler et Effacer les données](/doc-img/admin-member-erase.png)

Si la personne a encore des inscriptions à venir, le récapitulatif le signale : elles restent comptées dans les effectifs, retirez-les d'abord si elle ne viendra pas. Aucun email n'est envoyé.

Pour confirmer, saisissez le mot **effacer** puis **Effacer les données**. L'action est **irréversible** : rien ne peut être récupéré. La page reste ouverte et indique que les données ont été effacées ; la fiche ne peut plus être modifiée, fusionnée ni effacée une seconde fois. Le journal d'activité de l'organisation indique qu'un effacement a eu lieu, sans dire qui ; les journaux des événements gardent leurs entrées, la personne y apparaît comme « Bénévole effacé ».

L'effacement vaut pour votre organisation seulement : si la même personne est aussi membre d'une autre organisation sur benevol.app, sa fiche y reste intacte. S'il lui arrive de s'inscrire à nouveau plus tard, une nouvelle fiche est créée.

### Pourquoi la fiche effacée reste dans la liste

Une fiche effacée n'est pas supprimée, parce que ses inscriptions comptent encore : sans elle, les effectifs des créneaux passés, les heures données à l'organisation et l'historique des événements seraient faussés. Elle ne contient plus rien qui permette de reconnaître la personne. Elle n'est pas comptée dans le nombre de membres, et n'apparaît dans la liste qu'en cochant **Inclure les fiches fusionnées ou effacées**, avec la mention « Données effacées · gardée pour l'historique (effectifs et heures) ». Elle reste tant que l'organisation existe.
