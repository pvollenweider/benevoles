# Horaires de nuit et changements d’heure

**Identifiant stable :** `SHIFT_NIGHT_DST`

## Démonstration

1. Ouvrir un événement vidéo dédié à trois nuits.
2. Montrer une nuit ordinaire de 22 h à 2 h et ouvrir son éditeur rapide. Les heures affichées permettent de comprendre que la fin est le lendemain ; cet éditeur n'affiche pas de récapitulatif « lendemain ».
3. Montrer le passage à l’heure d’été : 1 h–5 h, trois heures réelles.
4. Montrer le passage à l’heure d’hiver : 1 h–5 h, cinq heures réelles.
5. Vérifier le fuseau Europe/Zurich.
6. Télécharger tout le planning depuis la page Mes inscriptions du bénévole.

## Résultat visible

- La Frise peut prolonger l’axe au-delà de minuit.
- Les heures locales restent lisibles.
- Les durées réelles tiennent compte du changement d’heure.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration à régénérer intégralement en une passe avec la même voix, `continuousPauseTags: false`. En attente du TTS (plafond mensuel connu), sans monter l’ancienne voix. Phrases modifiées :

- `autumn` : Le dernier dimanche d’octobre, l’heure entre deux et trois se répète. Le même créneau de une heure à cinq heures dure alors cinq heures réelles. Cette différence compte pour les heures prévues et évite de sous-estimer l’engagement d’une personne présente toute la nuit.
- `result` : Pour une permanence de nuit, indiquez clairement le jour de départ, l’heure du lendemain et les consignes d’arrivée. L’affichage reste humain, tandis que les rappels, calendriers et totaux restent justes autour de minuit et des changements d’heure.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des réglages hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `welcome` : Les événements du soir posent deux questions différentes : comment afficher une fin après minuit, et combien d’heures se sont réellement écoulées quand l’horloge change. Benevol conserve l’horaire local de l’événement et calcule les instants dans le fuseau de l’organisation.
- `ordinary` : Une nuit ordinaire de vingt-deux heures à deux heures appartient au jour où le créneau commence. La Frise continue après minuit, mais les heures affichées repartent bien de zéro : minuit, une heure, deux heures. Ouvrons maintenant le créneau. Les heures affichées vont de vingt-deux heures à deux heures : la fin se situe donc le lendemain. Vérifions bien cet horaire.
- `spring` : Le dernier dimanche de mars, la Suisse passe directement de deux heures à trois heures. Un créneau affiché de une heure à cinq heures ne dure donc que trois heures réelles. Les emails et calendriers gardent les heures locales, tandis que les totaux utilisent la durée réellement écoulée.
- `autumn` : Le dernier dimanche d’octobre, l’heure entre deux et trois se répète. Le même créneau de une heure à cinq heures dure alors cinq heures réelles. Cette différence compte pour les heures prévues et évite de sous-estimer l’engagement d’une personne présente toute la nuit.
- `timezone` : Ces calculs dépendent du fuseau horaire de l’organisation, ici Europe Zurich. Le serveur peut fonctionner en UTC sans décaler les rappels : une heure saisie reste l’heure locale comprise par l’organisateur et le bénévole.
- `calendar` : Depuis la page Mes inscriptions de notre bénévole fictif, téléchargeons son planning au format calendrier. Le fichier contient des instants précis avec le bon décalage d’été ou d’hiver. Après une modification, téléchargez-le à nouveau pour que les informations de votre agenda correspondent au planning actuel.
- `result` : Pour une permanence de nuit, indiquez clairement le jour de départ, l’heure du lendemain et les consignes d’arrivée. L’affichage reste humain, tandis que les rappels, calendriers et totaux restent justes autour de minuit et des changements d’heure.
