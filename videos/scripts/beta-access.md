# Fonctions bêta : ouvrir et essayer une fonction avancée

**Identifiant stable :** `BETA_ACCESS`

Vidéo courte, voix Kore, une prise continue. Narration au vouvoiement pour l'opérateur et les organisateurs.

## Utilité

Expliquer les trois accords d'une fonction en bêta (#1168) : l'opérateur ouvre la fonction, un propriétaire inscrit son organisation, puis chaque événement choisit son option. Montrer que s'inscrire ne change aucun événement et que fermer ou quitter la bêta ne retire rien de ce qui est déjà utilisé.

## Démonstration

1. Session de l'opérateur (compte super admin fictif de la formation) : menu Super Admin, Fonctions bêta. Rien n'est coché, aucune organisation ne participe.
2. Cocher Échanges de créneaux, et Enregistrer : « Fonctions ouvertes enregistrées. ». Organisations participantes : « Aucune organisation ne participe à la bêta. ».
3. Session de la propriétaire de l'Association du Festival de Montvert : Paramètres, carte Fonctions bêta, avec la liste de la fonction ouverte. Activer Essayer les fonctions avancées en bêta : la phrase indique la date et « activée par Élodie Nováková ».
4. Informations du Festival de Montvert : la carte Échanges de créneaux propose son option, désactivée.
5. Retour chez l'opérateur : l'association figure dans Organisations participantes, avec sa date.

## Résultat visible

Une fonction ouverte, une organisation inscrite, un événement inchangé dont l'option est proposée.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts beta-access` (organisation dédiée `formation-beta`, rien d'ouvert, organisation non inscrite, un compte opérateur `video.beta.operator@example.org`). Une prise par seed : la prise ouvre les fonctions et inscrit l'organisation.
- Les deux sessions sont ouvertes avant la capture (cookies réels) : aucun formulaire de connexion n'est filmé.
- La liste ouverte est commune à toute la plateforme locale ; `scripts/seed-demo.ts` la retire pour les vidéos de démonstration.
- Ne pas montrer le journal de l'opérateur en détail : la narration dit seulement que chaque changement y est inscrit.
- Lot 39 : READY et publié le 2026-11-10, révision 2 ; 120,600 s, une prise narrée, BUILD_ID `rLDQoLz1bzvkYVRMNsVYi`. Preuves : `videos/evidence/beta-access/batch39/`.


## Relecture du 2026-11-10 — lot 39

Référence produit : main `058f35c463cf3b1e6b47596201d0ab6f78ab3015` (#1312). Les quatre fonctions encore en bêta sont Échanges de créneaux, Protection des pauses et de la charge, Disponibilités datées et Proposition d'affectations. Seule Échanges de créneaux est cochée ; les secteurs et leurs responsables ne figurent plus dans ces listes. La session fictive de l'opérateur passe son vrai second facteur avant la capture. Nouvelle narration continue complète, sans balises de pause ; les frontières de chapitres sont recoupées sur les silences du même master et vérifiées par ASR indépendante.
