## Résumé
<!-- Décrivez les changements en 1-3 phrases -->

## Type de changement
- [ ] Correction de bug
- [ ] Nouvelle fonctionnalité
- [ ] Refactoring (sans changement de comportement)
- [ ] Documentation
- [ ] CI / ops

## Tests
- [ ] Les types TypeScript sont valides (`npm run tsc`)
- [ ] Le lint passe (`npm run lint`)
- [ ] Testé manuellement en local

## Migration
<!-- Seulement si la PR ajoute un dossier dans prisma/migrations. Supprimer sinon. -->
- [ ] Compatible avec le code de la version précédente, qui tourne sur le nouveau schéma pendant le déploiement (CONTRIBUTING, *expand/contract*) : pas de suppression ni de renommage d'une colonne ou table encore lue, pas de `NOT NULL` sans défaut, contrainte élargie avant d'utiliser une nouvelle valeur
- [ ] Grosse table : index en `CONCURRENTLY` (migration à part), contrainte en `NOT VALID` puis `VALIDATE` plus tard
- [ ] Migration qui transforme des données existantes : scénario dans `src/__integration__/migration-upgrade.int.test.ts`
- [ ] Aucune migration déjà appliquée modifiée (vérifié par la CI)

## Issues liées
Closes #
