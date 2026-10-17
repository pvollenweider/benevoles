# Capacités, listes d’attente et offre de place

**Identifiant stable :** `SHIFT_WAITLIST_OFFER`

## Démonstration

1. Ouvrir un créneau complet avec liste d’attente.
2. Distinguer confirmations, attente et positions côté admin.
3. Libérer une place depuis une inscription confirmée.
4. Montrer l’offre de vingt-quatre heures au maximum, limitée au début du créneau.
5. Ouvrir la page personnelle de la personne promue.
6. Ouvrir le lien « Prendre la place » : la page présente l’offre sans l’accepter. Montrer le bouton « Prendre la place », seul geste qui confirme, puis revenir à la page personnelle et montrer « Refuser la place ». Expliquer l’expiration et le passage au suivant.
7. Revenir réellement dans l’administration pour lire l’offre active et les positions restantes, sans simuler une expiration non exécutée.

## Résultat visible

- La places n’est jamais dépassée.
- Une seule offre est active à la fois.
- L’ordre et l’expiration restent visibles des deux côtés.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les réglages du poste sont hérités par les nouveaux créneaux.

Narration à régénérer intégralement en une passe avec la même voix, `continuousPauseTags: false`. En attente du TTS (plafond mensuel connu), sans monter l’ancienne voix. Phrases modifiées :

- `release` : Quand une personne confirmée se désinscrit, la place n’est pas attribuée silencieusement. Une offre est envoyée à la première personne en attente. Elle dispose de vingt-quatre heures au maximum, sans dépasser le début du créneau, pour accepter depuis son lien personnel. Une place libérée moins d’une heure avant le début n’est plus proposée.
- `result` : La liste d’attente est utile pour les missions demandées, mais elle doit rester compréhensible. Vérifiez la capacité, l’ordre, l’offre en cours et les délais avant de promettre une place à quelqu’un par un autre canal.

## Batch 25 — 2026-10-17

Narration `volunteer` : Sur sa page, la personne voit l’offre, son expiration et les actions Prendre la place ou Refuser la place. Le lien Prendre la place ouvre une page qui présente l’offre, sans l’accepter. Seul le bouton Prendre la place de cette page confirme le créneau. Refuser la place conserve une réponse explicite et permet de contacter la personne suivante.

Narration complète régénérée en une passe Kore, sans balises de pause. La démonstration garde volontairement l’offre active pour expliquer son expiration.
