---
title: benevol.app passe en 2.8 : un jour J mieux tenu, des rappels à votre rythme
date: 2026-11-17
summary: Absences et départs le jour J, un accès accueil pour un seul événement, des rappels à votre rythme, une page par poste.
version: 2.8.0
---

La 2.8 s'occupe surtout du jour J et de ce qui le précède : savoir qui est venu et qui est reparti, confier l'accueil sans ouvrir tout l'espace, et prévenir chaque poste au bon moment.

## Qui est venu, qui est reparti

Sur la page Jour J et dans les inscriptions, **Marquer absent** note qu'une personne attendue n'est pas venue, et **Parti avant la fin** qu'une personne venue a dû repartir plus tôt. Chaque note s'annule d'un geste. Les compteurs le disent (« 2 présents sur 4 attendus, 1 absent »), et l'export des présences a une colonne pour chaque cas.

Une absence est toujours notée par vous, jamais déduite. Et une participation terminée avant la fin n'a pas de durée connue : elle n'est jamais comptée dans les heures attestées, mais le bilan et l'attestation la mentionnent à part.

→ [Les présences le jour J](/doc/presences-le-jour-j)
▶ Vidéo : [Accueillir les bénévoles et corriger une présence](/videos/ATTENDANCE_CHECK_IN)

## Un accès accueil, pour un seul événement

À l'entrée, c'est souvent quelqu'un d'extérieur à l'équipe qui accueille les bénévoles. Depuis la page Jour J, invitez cette personne par email : elle marque les présences de cet événement, voit le nom et le téléphone des bénévoles attendus, et rien d'autre de votre espace. Son accès se termine après l'événement, vous pouvez le révoquer à tout moment, et son compte est effacé 90 jours plus tard.

→ [Donner un accès accueil pour le jour J](/doc/acces-accueil-jour-j)
▶ Vidéo : [Donner un accès accueil pour le jour J](/videos/FRONT_DESK_ACCESS)

## Des rappels à votre rythme

Par défaut, les bénévoles reçoivent un rappel deux jours avant, la veille et le jour même. Pour un événement qui demande autre chose, l'onglet Messages permet maintenant de fixer jusqu'à trois rappels, en heures ou en jours, et montre à qui partira le prochain. Un même rappel ne part jamais deux fois.

→ [Donner des délais propres à un événement](/doc/rappels#donner-des-delais-propres-a-un-evenement)

## Une page pour les bénévoles d'un poste

Le parking a son plan, la buvette ses consignes d'hygiène. Rattachez une page d'information à un ou plusieurs postes : les personnes qui ont une place confirmée reçoivent son lien avant leur créneau, dans la confirmation, les rappels et leur page Mes inscriptions.

→ [Les pages personnalisées](/doc/pages-personnalisees)

## Un poste réservé selon une réponse

Le poste de chauffeur demande un permis. Dans l'éditeur « Accès » de « Gérer les postes », réservez un poste aux bénévoles qui ont donné une réponse précise à une de vos questions à choix. Le créneau affiche « Réponse requise », et l'inscription vérifie la réponse.

→ [Gérer les postes](/doc/gerer-les-postes)
▶ Vidéo : [Réserver un poste selon une réponse](/videos/SHIFT_ELIGIBILITY_RULES)

## Et aussi

- **Les vieux iPhone et Mac** (Safari 15.4 à 16.3) peuvent de nouveau s'inscrire ; la page [Navigateurs compatibles](/doc/navigateurs-compatibles) dit quoi faire avec un appareil trop ancien.
- **La recherche dans la documentation** lit tout le texte des fiches et comprend les mots proches.
- **De nouvelles pages publiques** : [Logiciel libre](/logiciel-libre-benevoles), [Continuité du service](/continuite-du-service), [Citer benevol.app](/citer) et [une page pour les mairies et collectivités](/benevoles-mairie-commune).

## Pour les installations auto-hébergées

Avec Docker Compose, les tâches planifiées (emails, rappels, nettoyage) tournent maintenant dans un service `cron` du fichier, et `CRON_SECRET` devient obligatoire dans `.env`. Avant la mise à jour, écrivez-y la valeur que votre cron utilise déjà, et retirez de l'hôte ses appels à `/api/cron/*`. Pour essayer benevol.app sans le code, `docker-compose.essai.yml` le lance en deux commandes.

→ [Mise à jour depuis 2.7.x](https://github.com/pvollenweider/benevoles/blob/main/docs/deploiement.md#mise-à-jour-depuis-27x)

## Et maintenant ?

Essayez l'accès accueil et les absences sur votre prochain événement, et dites-nous ce qui vous manque : [contact@benevol.app](mailto:contact@benevol.app). Tout le détail est dans les [Nouveautés](/nouveautes).

À très vite,
L'équipe benevol.app
