---
roles: [admin]
group: preparer
order: 60
summary: Changer les places, les horaires ou l'état d'un créneau, le dupliquer ou le supprimer sans quitter le planning.
related: [configurer-les-creneaux, suivre-les-inscriptions]
legacy: [admin#modifier-vite-depuis-le-planning]
aliases: []
---

# Modifier vite depuis le planning

<!-- video: SHIFT_TIMELINE_QUICK_ACTIONS -->

Un clic sur une barre du planning des créneaux ouvre une petite fenêtre pour agir sans quitter la vue :

- **Libellé**, **Places** et **Minimum** (facultatif, voir [Minimum de personnes](configurer-les-creneaux.md#minimum-de-personnes)) : enregistrés à la fermeture ; un minimum plus grand que les places n'est pas enregistré, et les places non plus ;
- **Appliquer au poste** : copie les places, le minimum et le libellé de ce créneau sur les autres créneaux du poste. **Ce jour** les applique aux créneaux du poste de ce jour ; **Tout l'événement** à ceux de tous les jours, après une confirmation qui donne le nombre de créneaux et de jours (« Appliquer à 12 créneaux sur 3 jours ? »). Une phrase sous les boutons dit ce qui sera appliqué. Le libellé n'est copié que si vous l'avez changé dans cette fenêtre et qu'il n'est pas vide : sinon chaque créneau garde le sien. Un minimum laissé vide retire celui de ce créneau aux autres, ou ne change rien si ce créneau n'en avait pas. Un créneau qui a déjà plus d'inscrits confirmés que les places demandées garde assez de places pour eux, et le message de résultat le compte. Les créneaux annulés ne changent pas. Si le poste n'a de créneaux que ce jour-là, un seul bouton, **Appliquer à tout le poste** ;
- **Horaires** : changez le début ou la fin puis **Décaler** ; les bénévoles inscrits reçoivent un email si les horaires changent ;
- **Inscriptions** : **Ouvertes**, **Complet**, **Fermées** (le créneau reste visible, personne ne peut plus s'y inscrire) ou **Créneau annulé** (voir plus bas) ;
- **Dupliquer** : crée une copie juste après, de même durée, avec tous les paramètres du créneau (places, minimum de personnes, liste d'attente, âge minimum, infos pratiques) et sans inscriptions ; déplacez-la ensuite si besoin ;
- **Voir les inscriptions** (lien vers les inscriptions du créneau) et **Supprimer le créneau**.

Choisir **Créneau annulé** sur un créneau qui a des inscrits ouvre d'abord une confirmation : combien de personnes sont inscrites et si elles reçoivent un email, par exemple « 3 personnes sont inscrites. Elles recevront un email d'annulation. ». **Annuler le créneau** annule leurs inscriptions et les demandes en attente, et chacune reçoit un email d'annulation (voir [Rappels et changements de créneau](rappels.md#notifications-de-modification)). Cochez **Ne pas prévenir les inscrits** pour un créneau de test ou des personnes déjà prévenues, par exemple par téléphone : le bouton devient **Annuler sans prévenir** et aucun email ne part. Le choix est noté dans le journal de l'événement. **Garder le créneau** ne change rien. Le créneau disparaît ensuite du planning, comme avec **Supprimer le créneau** ; si c'était le dernier créneau d'un événement publié, l'événement repasse en brouillon. Sans inscrit, le créneau est annulé tout de suite.
