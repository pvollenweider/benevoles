---
roles: [admin]
group: publier
order: 40
summary: Archiver un événement terminé pour le retirer du public, ou le supprimer définitivement après l'avoir sauvegardé.
related: [exporter-et-conserver-ses-donnees, rapports-badges-et-resume]
legacy: [admin#archiver-et-supprimer-un-evenement, admin#archiver, admin#supprimer-definitivement]
aliases: []
---

# Archiver ou supprimer un événement

<!-- video: EVENT_ARCHIVE_DELETE -->

## Archiver

Depuis la page de l'événement, cliquer sur **Archiver** puis **Confirmer**. L'événement n'est plus visible du public ; il reste consultable dans la liste avec le statut **Archivé**. Le bouton **Publier** permet de le remettre en ligne.

## Supprimer définitivement

Seul un événement archivé peut être supprimé, et seulement par un propriétaire. En bas de sa page, section **Suppression définitive**, cliquer sur **Supprimer l'événement…**. La fenêtre de confirmation indique ce qui sera effacé : créneaux, inscriptions (listes d'attente comprises) et invitations. Les membres du pool et l'organisation sont conservés.

- **Sauvegarder avant de supprimer** : **Rapports** → **Archive de l'événement (JSON)** télécharge toutes ses données (réglages, créneaux, inscriptions, pages, responsables, jalons, journal). Dans la fenêtre de suppression, le lien **Ouvrir l'export PDF** ouvre le planning, le récapitulatif par poste et la liste des bénévoles ; enregistrez-le depuis la fenêtre d'impression du navigateur. L'application ne conserve aucun export (voir [Exporter et conserver ses données](exporter-et-conserver-ses-donnees.md)).
- **Les bénévoles ne sont pas prévenus** : leur lien de gestion d'inscription cesse de fonctionner. Pour les prévenir, annulez d'abord les créneaux depuis la page des créneaux : chaque bénévole reçoit un email.
- **Confirmation** : saisir le titre de l'événement (les accents et les majuscules ne comptent pas) pour activer le bouton **Supprimer définitivement**. Cette action est irréversible.
