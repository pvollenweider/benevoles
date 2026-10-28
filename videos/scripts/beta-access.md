# Fonctions bêta : ouvrir et essayer une fonction avancée

**Identifiant stable :** `BETA_ACCESS`

Vidéo courte, voix Kore, une prise continue. Narration au vouvoiement pour l'opérateur et les organisateurs.

## Utilité

Expliquer les trois accords d'une fonction en bêta (#1168) : l'opérateur ouvre la fonction, un propriétaire inscrit son organisation, puis chaque événement choisit son option. Montrer que s'inscrire ne change aucun événement et que fermer ou quitter la bêta ne retire rien de ce qui est déjà utilisé.

## Démonstration

1. Session de l'opérateur (compte super admin fictif de la formation) : menu Super Admin, Fonctions bêta. Rien n'est coché, aucune organisation ne participe.
2. Cocher Secteurs, puis Échanges de créneaux, et Enregistrer : « Fonctions ouvertes enregistrées. ». Organisations participantes : « Aucune organisation ne participe à la bêta. ».
3. Session de la propriétaire de l'Association du Festival de Montvert : Paramètres, carte Fonctions bêta, avec la liste des deux fonctions ouvertes. Activer Essayer les fonctions avancées en bêta : la phrase indique la date et « activée par Élodie Nováková ».
4. Informations du Festival de Montvert : les cartes Échanges de créneaux et Secteurs proposent leur option, toutes deux désactivées.
5. Retour chez l'opérateur : l'association figure dans Organisations participantes, avec sa date.

## Résultat visible

Deux fonctions ouvertes, une organisation inscrite, un événement inchangé dont les options sont proposées.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts beta-access` (organisation dédiée `formation-beta`, rien d'ouvert, organisation non inscrite, un compte opérateur `video.beta.operator@example.org`). Une prise par seed : la prise ouvre les fonctions et inscrit l'organisation.
- Les deux sessions sont ouvertes avant la capture (cookies réels) : aucun formulaire de connexion n'est filmé.
- La liste ouverte est commune à toute la plateforme locale ; `scripts/seed-demo.ts` la retire pour les vidéos de démonstration.
- Ne pas montrer le journal de l'opérateur en détail : la narration dit seulement que chaque changement y est inscrit.
- Rendu en attente (sources seulement, 2026-10-28).
