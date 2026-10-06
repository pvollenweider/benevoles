---
roles: [admin, benevole]
group: regles
order: 20
summary: Sur un poste sensible, chaque inscription devient une demande que l'organisation accepte ou refuse ; la place reste réservée en attendant.
related: [liste-d-attente, age-minimum]
legacy: [admin#inscriptions-sur-validation]
aliases: []
---

# Inscriptions sur validation

<!-- video: SHIFT_APPROVAL -->

Pour un poste sensible (conduite, caisse, sécurité, une qualification), l'organisation peut choisir elle-même qui le tient. Sur un créneau **sur validation**, une inscription devient une **demande**, pas encore une place confirmée. La demande **garde sa place** jusqu'à la décision : quand les demandes remplissent le créneau, les suivants vont en liste d'attente (ou le créneau est complet). Acceptée, elle devient une inscription confirmée ; refusée, elle libère la place, proposée ensuite à la liste d'attente.

## Côté organisation

Cochez **Sur validation** dans le formulaire du créneau (ou dans la série de créneaux). Ensuite :

- le bénévole voit le créneau marqué « Sur validation » sur la page publique et dans le récapitulatif, puis « Demande envoyée » après l'envoi. Il reçoit un email « Demande reçue » avec son lien personnel, où il suit sa demande et peut la retirer ;
- dans les inscriptions de l'événement, chaque demande porte les boutons **Accepter** et **Refuser**, et la case **Demandes à traiter** n'affiche qu'elles. Un récapitulatif dit ce qui va se passer avant de confirmer ;
- **Accepter** fait de la demande une inscription confirmée : le bénévole reçoit l'email de confirmation habituel, et les responsables du poste sont prévenus ;
- **Refuser** libère la place, proposée ensuite à la liste d'attente. Le bénévole reçoit un email poli, sans raison, sauf si vous écrivez un message (facultatif) ;
- chaque décision est inscrite dans le journal de l'événement (le texte du message n'y figure pas).

![Inscriptions filtrées sur « Demandes à traiter (2) » : deux demandes sur le poste Navette, chacune avec les boutons Accepter et Refuser](/doc-img/admin-registrations-requests.png)

![Fenêtre « Refuser la demande de Marc Duc ? » : ce qui va se passer, un message facultatif pour la personne, et les boutons Annuler et Refuser](/doc-img/admin-refuse-request.png)

Les demandes ne reçoivent pas les rappels, ne figurent pas sur les feuilles de présence et les exports, et ne font pas partie de « tous les inscrits » dans les messages ciblés. Une demande compte comme une inscription pour les doublons, les chevauchements et la limite de créneaux par personne. Tant qu'elle n'est pas acceptée, elle garde sa place sans compter parmi les inscrits : la page de l'événement l'affiche à côté des inscrits (« + 2 demandes à traiter ») et ne la compte pas dans les places restantes, et « Où manque-t-il du monde ? » ne compte pas sa place comme manquante, avec un lien vers les demandes à traiter. Les **Rapports** ne la montrent nulle part, coordonnées comprises. Une place proposée depuis la liste d'attente sur un créneau sur validation devient, elle aussi, une demande. Si le créneau est annulé, les demandes le sont aussi, avec le même email que les inscrits.

Une personne ajoutée à la main est inscrite directement, sans demande. Cocher **Sur validation** ne change rien aux inscriptions déjà confirmées ; le décocher laisse les demandes en cours à traiter. Les demandes en attente apparaissent dans **Ce qui demande votre attention**.

## Côté bénévole

### Le créneau indique « Sur validation »

Tu t'inscris normalement, mais ton inscription est une **demande** : le récapitulatif et la page après l'envoi le disent. La place t'est réservée le temps que l'organisation réponde. Tu reçois un email « Demande reçue » avec ton lien personnel ; sur [ta page personnelle](ma-page-personnelle.md), tu suis la demande et peux la retirer (**Retirer ma demande**). Si elle est acceptée, tu reçois l'email de confirmation habituel ; sinon, un email te le dit. Les rappels ne concernent que les créneaux confirmés.
