# Régler les emails de l’organisation

**Identifiant stable :** `ORG_EMAIL_SETTINGS`

## Utilité

Automatiser les rappels utiles, choisir si l’équipe reçoit une alerte à chaque inscription et
faire revenir les réponses vers la bonne boîte.

## Démonstration

1. Ouvrir Paramètres → Emails.
2. Examiner et modifier les rappels J-2, J-1 et jour J.
3. Régler l’alerte envoyée aux organisateurs lors d’une inscription publique.
4. Montrer l’interrupteur des rappels dans un événement et son résultat dans Messages.
5. Décocher puis recocher l’alerte de désistement, séparée de celle d’inscription.
6. Expliquer et montrer le résumé quotidien des adresses à vérifier.
7. Saisir une adresse de réponse fictive.
8. Enregistrer et attendre la confirmation visible.
9. Envoyer un email de test, puis ouvrir le véritable message reçu dans Mailpit et vérifier son adresse de réponse.
10. Montrer la ligne correspondante dans Emails envoyés.

## Résultat visible

- Les paramètres sont confirmés comme enregistrés.
- L’email de test part uniquement vers le compte organisateur courant.
- La boîte vidéo reçoit le message avec les paramètres enregistrés.

## Points d’attention

- Les rappels habituels suivent les choix de l'organisation. Des délais propres à un événement les remplacent ; sa case Rappels automatiques peut toujours tous les couper.
- L’alerte par inscription peut devenir bruyante sur un gros événement.
- Le test n’envoie rien aux bénévoles.
- Une modification non enregistrée n’est pas utilisée par l’email de test.
- Paramètres réservés aux propriétaires ; les organisateurs peuvent suivre les envois.
- Chaque rappel regroupe les créneaux d’une personne pour un événement et un jour ; les délais se calculent avant son premier créneau du jour.
- Un échec définitif peut déclencher le résumé quotidien, pas un incident temporaire seul.
- « Envoyé » prouve l’acceptation SMTP, pas la remise ni la lecture par le destinataire.


## Révision du 2026-10-16 — lot 22-6

Relecture du produit `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased], PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 (onglets), #1022 (correction #1013). Navigation par onglets, libellés et repères de phrases contrôlés.

WAITING TTS — plafond mensuel connu, aucun appel : régénérer la narration ENTIÈRE avec la même voix, une seule passe, `continuousPauseTags: false`. Phrases changées :
- Son onglet Messages indique ce qui partira vraiment.

Bilan final du lot 22-6 (2026-10-16) : WAITING TTS ; BUILD_ID `mmgd3Xkj4ODeijoElwvVr`. Répétition complète réussie, anciens WAV entiers archivés ; aucun tournage final avec une narration obsolète. Régénération continue intégrale requise avant les étapes finales.



## Lot 41 — narration de la scène event-reminders

Dans les paramètres d’un événement, la case Rappels automatiques peut couper tous ses rappels, sans changer les autres événements. Son onglet Messages indique ce qui partira vraiment. Un brouillon n’envoie pas de rappel. Pour un événement publié, les rappels habituels suivent les choix de l'organisation. Des délais propres à cet événement les remplacent. Le fuseau de l'organisation reste utilisé.

Nouvelle narration entière avec une seule voix, puis refilmage : les anciennes paroles ne suffisent pas à expliquer les délais propres à un événement.

## Révision du 19 novembre 2026 — lot 43

Envoyer le vrai message de test au compte fictif du propriétaire. Cadrer l'expéditeur, le destinataire et l'adresse de réponse avec le texte de l'email. Le contrôle vérifie le destinataire et l'absence de lien personnel de bénévole dans ce message administratif. Dans l'historique, expliquer la définition d'« Envoyé ».
