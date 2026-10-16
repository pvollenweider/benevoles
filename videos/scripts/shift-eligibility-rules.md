# Âge, quotas et postes réservés

**Identifiant stable :** `SHIFT_ELIGIBILITY_RULES`

## Utilité

Appliquer quelques contraintes opérationnelles sans masquer les missions ni créer de gestion parallèle.

## Démonstration

1. Montrer l’âge minimum d’un créneau et la limite du poste Buvette.
2. Montrer le poste Sécurité réservé au étiquette `sécurité`.
3. Vérifier le résultat public anonyme.
4. Ouvrir l’invitation de Camille, déjà à la limite de Buvette.
5. Comparer Sécurité sans invitation puis avec l’invitation de Julien.
6. Montrer le réglage de téléphone obligatoire de l’événement.

## Résultat visible

- Les critères apparaissent avant le formulaire.
- La limite tient compte des engagements existants.
- Le poste réservé devient sélectionnable uniquement avec l’invitation appropriée.

## Points d’attention

- Les étiquettes exigées ne sont pas divulgués publiquement.
- Les contrôles importants sont refaits par le serveur.
- Une règle trop restrictive doit pouvoir être corrigée par l’organisateur.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration à régénérer intégralement en une passe avec la même voix, `continuousPauseTags: false`. En attente du TTS (plafond mensuel connu), sans monter l’ancienne voix. Phrases modifiées :

- `settings` : Les règles se configurent au bon niveau. L’âge minimum appartient au créneau. La limite et les étiquettes réservées appartiennent au poste entier, pour rester cohérents sur toutes ses plages horaires. Ici, Buvette est limitée à deux créneaux et Sécurité exige l’étiquette sécurité.
- `reserved` : Sans invitation, le poste Sécurité reste visible mais marqué réservé à certains membres. Le message ne révèle pas les étiquettes internes : il demande simplement d’utiliser le lien personnel reçu par email. Une invitation sans la bonne étiquette ne donne pas davantage accès.
- `eligible` : Julien possède l’étiquette sécurité. En ouvrant son invitation, la même mission devient sélectionnable : le lien prouve quel membre a été invité et le serveur contrôle ses étiquettes au moment de l’inscription. Il n’y a donc ni compte à créer, ni code à recopier.
- `result` : Ces règles doivent rester compréhensibles. Dans les paramètres de l’événement, la description permet d’expliquer les critères. Vérifions aussi le téléphone obligatoire si l’équipe doit appeler le jour J. Pour corriger un profil, retrouvons Julien dans les membres, puis ouvrons Modifier : son étiquette sécurité est une information interne. Ici, nous vérifions la fiche sans la modifier, puis nous annulons.

Blocage constaté sur ce build : dans la session de Camille ayant atteint sa limite, la Frise ne montre pas le motif du quota (seul son nom accessible le contient). La répétition s’arrête sur ce défaut ; elle ne passe plus en Liste pour le masquer. Aucun correctif produit sous src/. Les chapitres suivants restent à répéter après correction du produit.
