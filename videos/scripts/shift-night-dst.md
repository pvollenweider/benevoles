# Horaires de nuit et changements d’heure

**Identifiant stable :** `SHIFT_NIGHT_DST`

## Démonstration

1. Ouvrir un événement vidéo dédié à trois nuits.
2. Montrer une nuit ordinaire de 22 h à 2 h et ouvrir son éditeur rapide. Les heures affichées permettent de comprendre que la fin est le lendemain ; cet éditeur n'affiche pas de récapitulatif « lendemain ».
3. Montrer le passage à l’heure d’été : 1 h–5 h, trois heures réelles.
4. Montrer le passage à l’heure d’hiver : 1 h–5 h, cinq heures réelles.
5. Vérifier le fuseau Europe/Zurich.
6. Télécharger tout le planning depuis la page personnelle du bénévole.

## Résultat visible

- La Frise peut prolonger l’axe au-delà de minuit.
- Les heures locales restent lisibles.
- Les durées réelles tiennent compte du changement d’heure.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration à régénérer intégralement en une passe avec la même voix, `continuousPauseTags: false`. En attente du TTS (plafond mensuel connu), sans monter l’ancienne voix. Phrases modifiées :

- `autumn` : Le dernier dimanche d’octobre, l’heure entre deux et trois se répète. Le même créneau de une heure à cinq heures dure alors cinq heures réelles. Cette différence compte pour les heures prévues et évite de sous-estimer l’engagement d’une personne présente toute la nuit.
- `result` : Pour une permanence de nuit, indiquez clairement le jour de départ, l’heure du lendemain et les consignes d’arrivée. L’affichage reste humain, tandis que les rappels, calendriers et totaux restent justes autour de minuit et des changements d’heure.
