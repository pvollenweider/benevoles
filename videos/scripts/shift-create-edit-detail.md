# Ajouter et modifier un créneau dans le détail

Reprise du 6 octobre : les informations pratiques sont dictées et saisies
dans le même ordre, avec une saisie lisible : rendez-vous, consigne, contact,
téléphone fictif puis GPS. Après l'enregistrement, ouvrir réellement l'éditeur
détaillé pour montrer les consignes, plutôt que laisser le planning seul.
La narration continue doit être régénérée après ce changement de transcript.

**Identifiant stable :** `SHIFT_CREATE_EDIT_DETAIL`

## Démonstration

1. Ouvrir l’ajout détaillé depuis le planning.
2. Renseigner poste, libellé, date, heures et places.
3. Expliquer ouverture, fermeture et annulation.
4. Ajouter rendez-vous, consigne, carte et contact.
5. Enregistrer et vérifier le résultat.
6. Rouvrir le créneau créé et expliquer les précautions de modification pour un créneau déjà occupé.

## Résultat visible

- La Frise reflète les dates et horaires saisis.
- La fiche bénévole reçoit les informations pratiques.
- Une modification sensible indique ses conséquences.


## Révision du 2026-10-15 — lot 22-3

Relecture sur main `43c1aae776430702dd155711b25f4f0a1331fce5` : en-tête partagé et onglets, Frise agrandie, Places / Places par créneau, statut unique et Complet bleu, Cumul dans Gérer les postes. Les pages personnelles peuvent afficher Mes réponses et S’inscrire à d’autres créneaux. Les paramètres du poste sont hérités par les nouveaux créneaux.

Narration conservée : aucun libellé cité ni comportement décrit ne contredit l’écran actuel. Les WAV référencés par les anciennes métadonnées sont absents de cette copie ; ne pas prétendre avoir réutilisé un audio disponible.


## Révision du 16 octobre 2026 — lot 22-9

Relecture PR #990, #992–#1000, #1005–#1008, #1011–#1012, #1021 et #1022 (issue #1013), CHANGELOG Unreleased et parcours actuel. Les ajouts facultatifs de narration sont retirés pour conserver la prise audio restaurée quand le texte initial reste exact. Segments nécessitant une nouvelle narration : aucun. Navigation et repères adaptés aux onglets actuels. Toute correction conservée attend une narration intégrale, même voix, sans pause tags.

Lot 22-9 : READY, 135.92 s sur BUILD_ID `03j7XCWy0WJORYSQg2WPB`. Narration restaurée inchangée vérifiée ; répétition, capture narrée, ASR multilingue final, VTT, images de chapitres et actions, musique et validation contrôlés. Rien publié.


## Révision du 2026-10-16 — lot 23-1

Relecture sur main `89a884c8d58c22dda6800481e1238bdc4e219dff`, PR #1026–#1034. Suggestions de postes et rappel des paramètres hérités ; Appliquer au poste : Ce jour / Tout l’événement ; fin de nuit conservée ; limite atteinte visible en Frise et Liste. Les parcours conservent les vrais formulaires et emails.

Narration finale de référence (génération intégrale si modifiée, même voix, sans balises de pause) :

- `welcome` : Un créneau transforme un poste en besoin concret. Il dit quelle mission doit être assurée, quand, par combien de personnes et avec quelles informations pratiques. Prenons le temps de parcourir chaque champ et son résultat côté bénévole.
- `identity` : Choisissez d’abord le poste et, si nécessaire, un libellé plus précis. Quand ce poste existe déjà, le texte sous le champ rappelle que ses paramètres s’appliquent aux nouveaux créneaux. La date, l’heure de début et l’heure de fin placent la barre dans le planning. La capacité indique combien de personnes peuvent être confirmées sur cette plage.
- `availability` : Deux options complètent le fonctionnement du créneau. La liste d’attente recueille les volontaires quand toutes les places sont prises. Le mode Sur validation transforme chaque inscription en demande que l’organisateur devra accepter ou refuser.
- `practical` : Renseignons d'abord le lieu de rendez-vous : entrée artistes, portail nord. Ajoutons une consigne : venir dix minutes avant avec des chaussures fermées. Le contact opérationnel indique qui appeler sur place : ici Léa, accueil artistes, et son téléphone de démonstration. Les coordonnées GPS placent ce rendez-vous sur la carte. Si un créneau n'a pas de lieu propre, il reprend celui de l'événement. Ces détails seront visibles aux personnes inscrites.
- `save` : Enregistrons le créneau et vérifions sa place dans le planning. Le libellé complète le nom du poste sans le remplacer, la capacité apparaît dans les indicateurs et la fiche détaillée rassemble les consignes utiles au jour J.
- `change` : Dans la liste, le statut indique si les inscriptions sont ouvertes, fermées ou si le créneau est annulé. Rouvrir l’éditeur permet de corriger l’horaire et les informations pratiques. Pour un créneau déjà occupé, relisez toujours le nouveau jour, les heures et le rendez-vous avant de confirmer et de prévenir les bénévoles.
- `result` : Un bon créneau reste court à lire mais complet pour agir : mission, horaire, capacité, lieu et consigne. Plus ces informations sont fiables, moins l’équipe doit répondre aux mêmes questions par email ou par téléphone.
