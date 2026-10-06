---
roles: [admin]
group: organisation
order: 10
summary: Les deux rôles d'administrateur, propriétaire et organisateur, et comment inviter, changer de rôle ou retirer un admin.
related: [se-connecter, personnaliser-l-organisation]
legacy: [admin#gerer-l-equipe-admin]
aliases: []
---

# Gérer l'équipe admin

<!-- video: ORG_TEAM_PERMISSIONS -->

**`/admin/settings/admins`**

Deux rôles :

- **Propriétaire** : tous les droits, dont l'équipe d'administration, les réglages de l'organisation (nom, titre public, adresse, fuseau horaire, charte, réglages des emails, masquer les **Premiers pas**) et la suppression définitive d'un événement archivé.
- **Organisateur** : événements (création, duplication, modification, publication, archivage), postes, créneaux, questions, pages personnalisées, responsables de secteur, jalons, inscriptions, demandes et présences, membres (import et export compris) et invitations, messages aux bénévoles et modèles de messages, rappel manuel, rapports et exports, journaux, et renvoi d'un email en échec. Il voit l'équipe et un résumé des réglages de l'organisation, sans pouvoir les changer ; la page le dit.

Dans la documentation, les réglages marqués **(réservé aux propriétaires)** ne sont modifiables que par un propriétaire.

Sur cette page, un propriétaire peut :

- voir la **liste** des administrateurs de votre organisation (actifs et invitations en attente) ;
- **inviter** un nouvel admin : saisir son nom et son email, et choisir son rôle (Organisateur par défaut). Un email d'invitation avec un lien d'activation est envoyé (lien valable 7 jours) ;
- **changer le rôle** d'un admin dans sa ligne ; le changement s'applique aussitôt, y compris à ses sessions ouvertes ;
- **retirer** un admin. Il est impossible de se retirer soi-même ou de retirer le dernier admin actif, et l'organisation garde toujours au moins un propriétaire actif.

La même page porte aussi les réglages de l'organisation : voir [Personnaliser l'organisation](personnaliser-l-organisation.md) et [Charte du bénévole](charte-du-benevole.md).
