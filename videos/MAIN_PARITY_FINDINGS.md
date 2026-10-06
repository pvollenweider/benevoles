# Vidéos : écarts avec main et plan de remise en conformité

Revue du 6 octobre 2026. Référence : `09380114c1f111feed1b610c7379682924c2c627`.

## Verdict

Les vidéos existantes ne sont pas certifiées conformes au produit actuel. L'inventaire couvre les 54 entrées du catalogue, dont 52 MP4 présents. Aucun ancien enregistrement ne possède une preuve de compilation sur ce main. Deux vidéos sont encore absentes : ACCESSIBILITY_KEYBOARD_DISPLAY et EMAIL_DELIVERY_FAILURES.

Le code et les parcours ont été comparés à main, puis 28 pages ont été ouvertes et photographiées sur une compilation isolée de ce commit. Les 52 MP4 ont été analysés localement par OCR : 650 images, espacées de 15 secondes. Ce dernier contrôle est un repérage, pas une relecture intégrale image par image ou sonore. Une absence de signal ne vaut jamais validation.

## Anciennes interfaces repérées dans les MP4

Les temps sont approximatifs. Les signaux OCR doivent être confirmés visuellement avant d'être considérés comme des défauts individuels établis.

| Vidéo | Signal | Repères |
| --- | --- | --- |
| LAST_MINUTE_CHANGES | Timeline | 4:07 |
| DATA_EXPORTS_ARCHIVES | Ancienne disposition des rapports | 2:37, 4:22, 4:37 |
| EVENT_ACTIVITY_LOG | Timeline | 3:52 |
| EVENT_REPORTS | Ancienne disposition des rapports | 0:22, 4:22 |
| REMINDERS_CHANGES | Timeline | 2:52, 3:22, 3:52 |
| SHIFT_CREATE_SERIES | Timeline | 0:07, 0:22, 0:37, 0:52, 1:07 |
| SHIFT_TIMELINE_QUICK_ACTIONS | Timeline | 0:07, 0:22, 0:37, 0:52, 1:07 |
| SHIFT_NIGHT_DST | Timeline | 0:07, 0:22, 0:37, 0:52, 1:22, 1:37 |
| SHIFT_WAITLIST_OFFER | Timeline | 0:07 |
| SHIFT_APPROVAL | Timeline | 0:07 |
| SHIFT_ELIGIBILITY_RULES | Timeline | 0:07, 0:37 |
| EVENT_CREATE_PUBLISH_OVERVIEW | Timeline | 0:37, 1:07 |
| ADMIN_FEATURES_OVERVIEW | Timeline, Ancienne disposition des rapports | 1:52, 2:07, 4:07 |
| REGISTRATION_MONITOR_FOLLOWUP | Ancienne disposition des rapports | 2:37 |
| ORG_FIRST_STEPS | Timeline | 1:37, 1:52 |

Confirmation visuelle effectuée notamment sur LAST_MINUTE_CHANGES (4:07), SHIFT_CREATE_SERIES (0:07), ADMIN_FEATURES_OVERVIEW (1:52), EVENT_REPORTS (0:22) et REGISTRATION_MONITOR_FOLLOWUP (2:37). Les images montrent réellement « Timeline » ou l'ancienne disposition des rapports. Ce n'est pas seulement un ancien nom de fichier.

Les scripts disent déjà « Frise » : leur correction n'a donc pas suffi à mettre à jour les écrans filmés.

## Corrections à traiter en priorité

1. **Rapports, exports et panoramas d'administration.** Sur main : documents pour les bénévoles en premier ; Export complet dans la partie organisateurs ; Badges ; Résumé de l'événement ; Archive en dernier. Montrer aussi la Synthèse des réponses, son impression et son CSV. Ne plus expliquer un ancien emplacement ni remplacer la synthèse disponible par une manipulation manuelle de CSV.
2. **Créneaux et toutes les vidéos qui traversent le planning.** Employer Frise, filmer ses commandes actuelles, vérifier les menus, l'aide contextuelle, les champs, limites et accès, ainsi que les résultats après sauvegarde. Cela concerne aussi les relances, le journal et les changements de dernière minute.
3. **Membres.** Vérifier et compléter les heures planifiées/attestées par période, les certificats, les adresses à vérifier, la recherche de doublons, la fusion et la distinction suppression/effacement. Un simple parcours CRUD ne couvre plus tout le produit.
4. **Jour J et recherche de bénévoles.** Montrer le tableau mobile Jour J et le parcours de recherche pour les créneaux à renforcer. Le pointage historique dans les inscriptions ne suffit pas à expliquer ces nouveaux parcours.
5. **Événements et communications.** Vérifier le bilan avant publication, le partage lien/QR, l'ouverture des inscriptions, les rappels effectifs par événement, les désistements notifiés, le refus d'invitation et les résultats d'envoi. Garder les messages automatiques cohérents avec les réglages réellement activés.
6. **Parcours bénévole et organisation.** Vérifier le contact du jour J, Avant ta mission, le consentement pour cet événement et les suivants, le logo, les mentions du lendemain et la Convention. Montrer les textes réellement affichés, pas une paraphrase d'une ancienne interface.
7. **Administration interne et confidentialité.** Réexaminer la navigation et les nouveautés de main, notamment les retours vidéo et les évolutions de stockage documentées. Ces écrans ne font pas partie des 28 pages contrôlées par le parcours organisateur.

### Lacunes de couverture constatées dans les scripts

La « Synthèse des réponses » n'est pas explicitement présentée dans les 54 manifestes. Le nouveau parcours de recherche de renforts n'y est pas expliqué explicitement non plus. Les vidéos Membres et Pointage nécessitent une revue de couverture pour les fusions, certificats et le tableau Jour J. Il faut compléter les explications, pas uniquement réenregistrer les mêmes manipulations.

## Garde-fous désormais dans les outils vidéo

- Compilation de main dans une copie temporaire isolée, sans toucher au checkout de travail.
- Preuve du commit, de l'empreinte des sources et du BUILD_ID ; vérification du processus qui sert réellement la capture.
- Enregistrement de la locale française, du fuseau, de la taille d'écran et du scénario.
- Refus de capturer depuis un serveur non prouvé ou de monter une ancienne capture sans provenance actuelle. Aucun ancien fichier ne reçoit une preuve rétroactive.
- Contrôles audiovisuels séparés de la preuve produit : une bonne synchronisation n'atteste pas une interface à jour.
- Instructions générales mises à jour : libellés, emplacement des actions, états, formulaires et résultats doivent correspondre à main.

## Condition de livraison

Pour chaque vidéo : scénario et narration comparés à main, recapture des écrans obsolètes, voix et sous-titres alignés, contrôle du MP4 final sur tout le parcours, puis revue visuelle et fonctionnelle. Vérifier à nouveau le commit cible au moment de livrer. Tant que ces étapes ne sont pas terminées, garder le statut **à vérifier**, sans annoncer « 100 % iso ».

## Pièces de contrôle

- [Inventaire des 54 vidéos](MAIN_PARITY_REVIEW.md)
- Matrice machine : `output/main-parity-audit.json`
- Scan des MP4 : `output/ui-drift-scan.json` (empreinte de chaque MP4 et repères d'images)
- Pages de référence main : `output/main-ui-baseline/review.json` et captures PNG associées
- État des preuves audiovisuelles : `output/final-review-evidence.json`

La compétence understand-diff a servi à cartographier les changements ; son graphe ancien n'est pas utilisé comme preuve du produit actuel. Les sources Git de main et sa compilation sont les références.

