# Régler les emails de l’organisation

**Identifiant stable :** `ORG_EMAIL_SETTINGS`

## Utilité

Automatiser les rappels utiles, choisir si l’équipe reçoit une alerte à chaque inscription et
faire revenir les réponses vers la bonne boîte.

## Démonstration

1. Ouvrir Paramètres → Emails.
2. Examiner et modifier les rappels J-2, J-1 et jour J.
3. Régler l’alerte envoyée aux administrateurs lors d’une inscription publique.
4. Montrer l’interrupteur des rappels dans un événement et son résultat dans Communications.
5. Décocher puis recocher l’alerte de désistement, séparée de celle d’inscription.
6. Expliquer et montrer le résumé quotidien des adresses à vérifier.
7. Saisir une adresse de réponse fictive.
8. Enregistrer et attendre la confirmation visible.
9. Envoyer un email de test, puis ouvrir le véritable message reçu dans Mailpit et vérifier son adresse de réponse.
10. Montrer la ligne correspondante dans Emails envoyés.

## Résultat visible

- Les réglages sont confirmés comme enregistrés.
- L’email de test part uniquement vers le compte administrateur courant.
- La boîte vidéo reçoit le message avec les réglages enregistrés.

## Points d’attention

- Les rappels sont globaux, mais chaque événement peut tous les désactiver.
- L’alerte par inscription peut devenir bruyante sur un gros événement.
- Le test n’envoie rien aux bénévoles.
- Une modification non enregistrée n’est pas utilisée par l’email de test.
- Réglages réservés aux propriétaires ; les organisateurs peuvent suivre les envois.
- Chaque rappel regroupe les créneaux d’une personne pour un événement et un jour ; les délais se calculent avant son premier créneau du jour.
- Un échec définitif peut déclencher le résumé quotidien, pas un incident temporaire seul.
- « Envoyé » prouve l’acceptation SMTP, pas la remise ni la lecture par le destinataire.
