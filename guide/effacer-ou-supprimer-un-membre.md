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

Une fiche se supprime définitivement quand elle est **inactive** et n'a **aucune inscription**, quel que soit son statut (confirmée, en liste d'attente, proposée, demandée, annulée, refusée) : rien, dans l'historique d'aucun événement, ne pointe plus vers elle. Une fiche avec des inscriptions ne se supprime pas : ses données personnelles s'effacent (section suivante) ; une fiche fusionnée dans une autre (voir [Doublons et fusion de fiches](doublons-et-fusion.md)) n'est jamais proposée à la suppression non plus, elle disparaît de son côté par la purge de rétention.

Le bouton **Supprimer** n'apparaît, sur la ligne de la fiche dans la liste des membres et sur sa page **Activité**, que lorsqu'elle remplit ces deux conditions ; sinon la page **Activité** explique en mots pourquoi elle ne peut pas être supprimée (fiche encore active, ou inscriptions à conserver). La confirmation nomme la personne, précise que l'action est **irréversible** et liste ce qui disparaît avec la fiche : ses invitations, ses réponses aux questions des événements, ses abonnements aux notifications du navigateur, les suivis d'envoi d'email la concernant et les doublons possibles écartés qui la citaient. Aucun email n'est envoyé. L'action est journalisée dans le journal d'activité de l'organisation ; l'activité des autres fiches n'est pas affectée.

## Effacer les données personnelles d'un membre

Quand une personne demande l'effacement de ses données, ouvrez sa page **Activité** (depuis la liste des membres) et choisissez **Effacer les données personnelles**. C'est possible pour toute fiche, active ou non, avec ou sans inscriptions, par les propriétaires comme par les organisateurs. Seule une fiche déjà fusionnée dans une autre ne le propose pas : effacez alors les données de la fiche conservée.

La fenêtre de confirmation récapitule, avec les nombres de cette fiche :

- **Effacé de la fiche** : nom, prénom, email, téléphone, date de naissance, notes, étiquettes et disponibilités. La fiche s'appelle désormais « Bénévole effacé » et est désactivée.
- **Supprimé** : ses invitations (et leur réponse « pas disponible »), ses réponses aux questions des événements, ses abonnements aux notifications, ses désignations comme responsable de secteur faites avec son adresse, les emails en attente ou déjà envoyés qui la concernent ou la nomment, les suivis d'envoi d'email, et les anciennes fiches fusionnées dans la sienne.
- **Conservé sans identité** : ses inscriptions (créneau, statut, présence), pour que les effectifs, les heures et l'historique des événements restent justes. Le commentaire et le téléphone laissés à l'inscription sont effacés, et ses liens personnels ne fonctionnent plus. Les attestations de bénévolat et les exports d'heures ne la nomment plus.

Si la personne a encore des inscriptions à venir, le récapitulatif le signale : elles restent comptées dans les effectifs, retirez-les d'abord si elle ne viendra pas. Aucun email n'est envoyé.

Pour confirmer, saisissez le mot **effacer** puis **Effacer**. L'action est **irréversible** : rien ne peut être récupéré. La page reste ouverte et indique que les données ont été effacées ; la fiche ne peut plus être modifiée, fusionnée ni effacée une seconde fois. Le journal d'activité de l'organisation indique qu'un effacement a eu lieu, sans dire qui ; les journaux des événements gardent leurs entrées, la personne y apparaît comme « Bénévole effacé ».

L'effacement vaut pour votre organisation seulement : si la même personne est aussi membre d'une autre organisation sur benevol.app, sa fiche y reste intacte. S'il lui arrive de s'inscrire à nouveau plus tard, une nouvelle fiche est créée.
