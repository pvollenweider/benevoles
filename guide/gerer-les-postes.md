---
roles: [admin]
group: preparer
order: 70
summary: Réordonner, renommer, supprimer ou colorer les postes, limiter les créneaux par personne et réserver un poste à certains membres.
related: [configurer-les-creneaux, inviter-des-membres]
legacy: [admin#gerer-les-postes]
aliases: []
---

# Gérer les postes

Dans la page des créneaux, le bouton **Gérer les postes** ouvre un panneau qui regroupe ces actions, poste par poste :

- **Réordonner** : glissez-déposez une ligne, ou utilisez ses flèches Monter et Descendre (aussi au clavier), puis **Enregistrer l'ordre**. L'ordre défini ici s'applique à la timeline admin **et** à la page publique.
- **Renommer** : cliquez sur « Renommer », tapez le nouveau nom, validez. Tous les créneaux de ce poste sont renommés d'un coup. Impossible de renommer vers un nom déjà utilisé par un autre poste (pour ne pas fusionner deux postes par erreur).
- **Supprimer** : annule tous les créneaux de ce poste (comme une suppression de créneau individuelle). Une confirmation indique le nombre de créneaux et de bénévoles concernés ; ces derniers sont prévenus par email.
- **Couleur** : le point coloré à gauche du nom ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique » pour revenir à la couleur assignée par défaut) ; la couleur choisie est cochée. S'applique à la timeline admin et à la page publique.
- **Limite par personne** : le bouton « Limite » fixe le nombre maximum de créneaux de ce poste qu'une même personne peut prendre (par exemple 2 pour la loge des artistes, pour que plus de monde y participe). Laissez vide pour ne pas limiter. Comptent toutes les inscriptions de la personne sur ce poste, confirmées ou en liste d'attente ; les annulées ne comptent pas. La page publique empêche de sélectionner un créneau de trop et dit pourquoi ; le serveur refuse aussi toute inscription au-delà, même envoyée en même temps qu'une autre. Les inscriptions déjà au-delà d'une nouvelle limite restent. En ajoutant quelqu'un à la main, l'administration prévient et propose **Ajouter quand même**. La limite est copiée avec l'événement.
- **Accès réservé** : le bouton « Accès » réserve le poste aux membres portant l'une des étiquettes indiquées (par exemple `sécurité` pour la sécurité). Ces membres s'y inscrivent avec le lien personnel de leur invitation (dans **Invitations**, filtrez les membres par étiquette pour les inviter, voir [Inviter des membres à un événement](inviter-des-membres.md)). Sans ce lien, la page publique affiche le poste comme « Réservé » et le serveur refuse toute inscription ; les étiquettes ne sont jamais montrées aux bénévoles. L'étiquette est lue au moment de l'inscription : si vous la retirez à un membre, son invitation ne lui ouvre plus le poste. Les inscriptions déjà faites restent. Vous pouvez toujours ajouter quelqu'un à la main. Le réglage est copié avec l'événement.
