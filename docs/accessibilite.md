# Vérifications d'accessibilité

Ce que recouvre la déclaration publique (`ACCESSIBILITE.md`, page `/accessibilite`) et comment le vérifier. À mettre à jour, avec la date, à chaque vérification manuelle.

## Tests automatiques (CI)

`e2e/accessibility.spec.ts` analyse avec axe-core (règles WCAG 2.0 à 2.2, niveaux A et AA) les pages publiques de contenu, la page d'un événement puis le formulaire d'inscription, la connexion à l'administration, la liste des événements, la page d'un événement et ses pages Créneaux, Inscriptions, Écrire aux bénévoles et Invitations. Le test échoue sur toute violation grave ou critique ; les violations modérées ou mineures et les points « à vérifier » sont joints au rapport sans le faire échouer. Les pages de contenu sont aussi analysées à 320 px de large et en thème sombre. Chromium seulement. Les outils automatiques ne détectent qu'une partie des problèmes, surtout ceux du code (noms, rôles, contraste) ; beaucoup de critères demandent une vérification humaine.

## Vérifications clavier (manuelles)

Dernière vérification complète : pas encore faite. À dater ici (navigateurs, système) une fois menée, puis à reporter dans la déclaration.

Pour chaque parcours : tout se fait avec Tab, Maj+Tab, Entrée, Espace, flèches et Échap ; le focus reste visible ; il ne se perd jamais (après une fermeture de fenêtre ou une suppression, il revient sur un élément proche) ; l'ordre suit la lecture.

| Parcours | Points à vérifier |
|---|---|
| Choisir ses créneaux | chaque créneau atteignable et nommé (poste, heures, places) ; sélection annoncée ; « Continuer » atteignable |
| S'inscrire | erreurs liées aux champs et annoncées ; récapitulatif lu avant « Confirmer » |
| Page personnelle | annuler un créneau avec confirmation ; lien calendrier |
| Liste d'attente | accepter une place proposée |
| Administration | lien d'évitement ; menus ; fenêtres de confirmation (focus piégé, retour du focus) ; formulaires de créneau et de poste |

## Lecteurs d'écran

À faire et à dater : NVDA + Firefox, JAWS ou NVDA + Chrome, VoiceOver + Safari (macOS et iOS), sur les parcours ci-dessus. Tant que ce n'est pas fait, la déclaration le dit.

## Revue des changements

Chaque modification d'interface passe par une revue d'accessibilité avant fusion (structure, noms accessibles, clavier, focus, annonces, contraste, libellés) ; ses remarques bloquantes sont corrigées avant publication.
