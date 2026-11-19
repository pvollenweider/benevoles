# Retrouver toutes mes inscriptions

Public bénévole. Deux événements fictifs dans l’Association du Parc.

## Demander son lien

Tu as perdu ton lien personnel ? Sur la page d’inscription de l’un des événements, descends sous le planning. Ouvre J’ai perdu mon lien personnel. Saisis l’adresse email que tu as utilisée pour t’inscrire. Choisis Recevoir mon lien par email. La page confirme que ta demande est enregistrée.

## Lire le courriel

Tu reçois un seul email. Sous le bouton Voir mes inscriptions, le message précise que ton lien ouvre toutes tes inscriptions auprès de cette association. Garde ce lien pour toi. Ouvre la page avec le bouton Voir mes inscriptions.

## Voir les deux événements

Dans Mes inscriptions, tu vois ton prochain créneau confirmé, puis tous tes créneaux à venir. Ici, l’Accueil de la Fête du parc et la Buvette du Marché des voisins sont sur la même page.

## Annuler un créneau

Si tu as un empêchement, utilise Annuler sur le créneau concerné. Le délai dépend de l’événement. Vérifie le nom du créneau, puis confirme l’annulation. Ton inscription à l’autre événement reste visible.

## Copier l’adresse du calendrier

La carte Mon calendrier permet de t’abonner une seule fois à tous tes créneaux confirmés auprès de l’association. Pour un agenda en ligne, ouvre la rubrique correspondante. Copie l’adresse de l’abonnement pour la coller dans ton agenda.

## Renouveler le lien

Si tu penses avoir partagé ton lien personnel, choisis Renouveler mon lien. La confirmation indique que l’ancien lien ne fonctionne plus. Ouvre le nouvel email et garde le nouveau lien pour toi. Si tu avais abonné ton agenda, abonne-toi de nouveau depuis ce lien.

## Préparation du tournage

- Utiliser la pile vidéo jetable et le build de production vérifié, servi en mode `serve-public` avec `VIDEO_PRODUCT_PORT=43100`.
- Avant chaque répétition et chaque prise, exécuter le seed `volunteer-org-registrations` avec `local-production.ts run scripts/seed-video-scenario.ts`.
- Lancer le recorder avec `VIDEO_PRODUCT_PORT=43100 VIDEO_PUBLIC_CAPTURE=1 VIDEO_ORG=formation-parc`. Les deux emails doivent venir de Mailpit, pour Léa Rochat, à l’adresse fictive utilisée dans le formulaire.
- Cadrer les corps des deux vrais emails. Vérifier la portée du lien, les deux événements, le retrait du seul créneau Accueil, le retour de copie du calendrier et la réception d’un lien différent après renouvellement.
