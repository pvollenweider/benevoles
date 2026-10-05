# Recevoir les notifications sur son téléphone

Vidéo autonome 33. Une seule voix continue, souriante et bienveillante.

## À quoi cela sert

Recevoir un rappel sur son appareil, en complément des emails activés par l'organisation. Les notifications push ne changent ni les inscriptions ni les réglages d'envoi de l'organisation.

## Démonstrations requises

1. Montrer le bouton « Recevoir des rappels push » sur la confirmation et sur une page personnelle réellement accessible.
2. Cliquer, puis montrer la vraie demande d'autorisation du navigateur et la réponse choisie. Une permission préaccordée par Playwright n'illustre pas cette étape : ne pas la présenter comme une validation manuelle.
3. Après acceptation, montrer « Rappels push activés » et vérifier l'abonnement enregistré dans la base vidéo.
4. Déclencher les rappels J-2, J-1 et jour J dans un scénario dédié. Montrer la notification réellement reçue et son lien vers les inscriptions. Ne pas remplacer une réception système par une carte HTML présentée comme une notification du téléphone.
5. Envoyer un message urgent de démonstration et vérifier le résultat côté destinataire, ainsi que son email dans Mailpit.
6. Montrer où retirer l'autorisation dans les réglages du navigateur ; revenir au site pour constater le comportement réel.
7. Dans un profil distinct, refuser l'autorisation et montrer « Notifications bloquées dans les paramètres du navigateur. »
8. Expliquer les environnements sans support ou sans configuration push : le bouton peut être absent ; les emails restent indépendants, selon les réglages de l'organisation.

## Conditions de capture

- Ne jamais utiliser une inscription, une clé VAPID ou un endpoint push de production.
- Utiliser un appareil/profil de démonstration et des coordonnées fictives.
- Le recorder navigateur ne capture pas les fenêtres de permission ou notifications système : prévoir une capture native pour ces séquences.
- Vérifier le navigateur et le système effectivement filmés avant de décrire leurs réglages. Ne pas promettre que tous les téléphones affichent la même interface.
- Respecter les choix de notification de l'organisation ; « email toujours envoyé » n'est pas une promesse valable si le rappel concerné est désactivé.
- Contrôler les paragraphes audio, puis chaque correspondance entre paroles, action et résultat.

État : scénario préparé à partir du composant actuel ; configuration isolée, réception réelle, capture native et narration restent à produire.
