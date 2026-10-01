# Vérifications d'accessibilité

Ce que recouvre la déclaration publique (`ACCESSIBILITE.md`, page `/accessibilite`) et comment le vérifier. À mettre à jour, avec la date, à chaque vérification manuelle.

## Tests automatiques (CI)

`e2e/accessibility.spec.ts` analyse avec axe-core (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) :

- les pages de contenu `/fonctionnalites`, `/doc`, `/doc/benevole`, `/accessibilite` et `/legal/privacy` ;
- la page d'un événement (`/spectacle-cirque-2026?org=default`), puis son formulaire d'inscription après la sélection d'un créneau ;
- dans l'administration : `/admin/login`, `/admin/events`, la page d'un événement et ses sous-pages `/shifts`, `/registrations`, `/message` et `/invitations`.

`/accessibilite` et `/doc` sont aussi analysées à 320 px de large en thème sombre. Un seul projet Playwright : Chromium en affichage ordinateur (`Desktop Chrome`).

Seuil dans `e2e/helpers/axe.ts` (`seriousViolations`) : le test échoue sur les impacts `serious` et `critical` ; le reste, y compris les résultats `incomplete` (« à vérifier »), est ajouté en annotation au rapport Playwright sans le faire échouer. Les outils automatiques ne détectent qu'une partie des problèmes, surtout ceux du code (noms, rôles, contraste) ; beaucoup de critères demandent une vérification humaine.

En local : `make e2e` sur la stack E2E (voir [CONTRIBUTING.md](../CONTRIBUTING.md#workflow)), ou ce seul fichier :

```bash
node --env-file=.env.e2e node_modules/.bin/playwright test e2e/accessibility.spec.ts
```

## Vérifications clavier (manuelles)

Dernière vérification complète : pas encore faite. À dater ici (navigateurs, système) une fois menée, puis à reporter dans la déclaration.

Pour chaque parcours : tout se fait avec Tab, Maj+Tab, Entrée, Espace, flèches et Échap ; le focus reste visible ; il ne se perd jamais (après une fermeture de fenêtre ou une suppression, il revient sur un élément proche) ; l'ordre suit la lecture.

| Parcours | Points à vérifier |
|---|---|
| Choisir ses créneaux | chaque créneau atteignable et nommé (poste, heures, places) ; sélection annoncée ; un créneau déjà pris est signalé visuellement et dans son nom ; « Continuer » atteignable |
| S'inscrire | erreurs liées aux champs et annoncées ; récapitulatif lu avant « Confirmer » |
| Page personnelle | annuler un créneau, quitter la liste d'attente, retirer une demande : le focus va dans la confirmation, Échap la ferme, le focus revient au déclencheur ou à la carte suivante, le résultat est annoncé ; lien calendrier |
| Liste d'attente | accepter une place proposée |
| Administration | lien d'évitement ; menus ; fenêtres de confirmation (focus piégé, retour du focus) ; formulaires de créneau et de poste |
| Choisir un créneau au clavier (page Inscriptions de l'administration) | « Créneau * » (ajout manuel) et « Filtrer par créneau » : Tab atteint le champ, annoncé avec son nom ; flèches haut et bas, Début et Fin déplacent l'option active (contour bleu) sans faire quitter le champ ; une lettre va à l'option dont le poste commence par elle ; Entrée ou Espace choisit, Échap ferme sans changer le choix, Tab choisit et passe au champ suivant ; chaque option est lue en entier (date, heures, poste, remplissage, « déjà inscrit », « conflit d'horaire ») avec son état sélectionné ; après « Annuler » ou un ajout, le focus revient sur « + Ajouter manuellement » et l'ajout est annoncé |

## Écarts connus

Suivis dans l'issue #534 et repris dans les « Limites connues » de la déclaration, qui se mettent à jour ensemble :

- page personnelle : confirmation d'annulation sans focus ni Échap, focus perdu à la fermeture et après l'annulation, erreur qui remplace toute la page, contraste des boutons d'annulation (`red-500`) ;
- planning public : créneau déjà pris non distingué (style par défaut, nom accessible « Sélectionner — … »).

Hors #534, aussi dans la déclaration : contraste des dates et compteurs du journal d'un événement (`text-gray-400`) et du message d'enregistrement d'un événement (blanc sur `green-500` ou `red-500`). Voir « Écarts connus du code » dans [DESIGN.md](../DESIGN.md#7-écarts-connus-du-code).

Choix d'un créneau sur la page Inscriptions de l'administration (#555) : couvert par des tests unitaires (rôles, noms, clavier), pas encore vérifié à la main. Aucun essai avec un lecteur d'écran n'a été mené : VoiceOver (macOS + Safari) et NVDA (Windows + Firefox) restent des vérifications manuelles. Le zoom à 200 % et la largeur d'un téléphone ne sont pas vérifiés par les tests automatiques.

Sélecteur de créneau, petits écrans : la liste peut dépasser à droite de l'écran, et à 320 px de large l'étiquette de remplissage et les avertissements « Déjà inscrit » / « ⚠ conflit » peuvent être coupés (1.4.10). Suivi dans une issue dédiée.

## Lecteurs d'écran

À faire et à dater : NVDA + Firefox, JAWS ou NVDA + Chrome, VoiceOver + Safari (macOS et iOS), sur les parcours ci-dessus. Tant que ce n'est pas fait, la déclaration le dit.

## Revue des changements

Chaque modification d'interface passe par une revue d'accessibilité avant fusion (structure, noms accessibles, clavier, focus, annonces, contraste, libellés) ; ses remarques bloquantes sont corrigées avant publication.
