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

**Événements**, puis l'événement, puis **Responsables de secteur**

Désignez un ou plusieurs bénévoles responsables d'un poste (ex. « Bar »). Chacun reçoit un lien personnel, sans compte à créer, qui affiche en lecture seule la liste des bénévoles inscrits sur ce poste (nom, email, téléphone).

![Liste des responsables de secteur d'un événement, avec le poste, le nom et l'action retirer](/doc-img/admin-sector-leaders.png)

- **+ Ajouter un responsable** : poste (autocomplété depuis les postes existants), nom, email, ou **Depuis les inscrits** pour choisir directement un bénévole déjà inscrit à l'événement, qui pré-remplit ces champs
- Depuis la page des inscriptions, sélectionner une seule ligne puis **Rendre responsable** propose directement le poste de ce créneau

  ![Fenêtre « Rendre Camille Rochat responsable » : choix du poste parmi ceux où la personne est inscrite, et email pré-rempli](/doc-img/admin-make-leader-modal.png)
- Un email est automatiquement envoyé au responsable avec son lien personnel ; il est aussi prévenu à chaque nouvelle inscription sur son poste, et à chaque désistement d'une place confirmée ou d'une demande (réglage **Prévenir en cas de désistement**, voir [Réglages et suivi des emails](reglages-et-suivi-des-emails.md#reglages-des-emails))
- **Retirer** un responsable à tout moment (confirmation demandée)
- La fiche du bénévole concerné (**Membres**) reçoit automatiquement le tag « responsable »
- Les bénévoles confirmés du poste voient le **nom** de son ou ses responsables (« Responsable du poste : … ») sur leur page personnelle, dans les rappels automatiques et sur le planning individuel imprimé. Jamais son email ni son téléphone : pour que les bénévoles puissent l'appeler, indiquez-le comme contact du créneau ou comme **Contact le jour J**. Rien n'apparaît sur la page publique

![Page personnelle de la responsable du poste Buvette : chaque créneau avec ses bénévoles inscrits, leur email et leur téléphone, et les personnes en liste d'attente](/doc-img/leader-page.png)

## Questions fréquentes

### Les bénévoles aimeraient savoir qui est déjà inscrit sur un créneau.

La page publique d'un événement n'affiche aucun nom : elle montre les places libres, jamais les personnes inscrites. Pour qu'une personne suive l'équipe d'un poste, désignez-la responsable de secteur : son lien personnel affiche qui est inscrit sur son poste.

### Je veux qu'une personne suive « son » poste sans lui donner accès à tout l'admin.

Désignez-la responsable de secteur. Elle reçoit un lien personnel, sans compte à créer, qui affiche uniquement qui est inscrit sur son poste : parfait pour un chef d'équipe sécurité ou un responsable bar qui doit juste savoir qui arrive et quand.
