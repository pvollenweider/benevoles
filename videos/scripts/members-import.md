# Importer ses membres sans repartir de zéro

Vidéo autonome 35, destinée aux organisateurs. Voix unique, souriante et rassurante. Montrer les actions lentement, puis leur résultat réel.

## Parcours à filmer

1. Ouvrir Membres, expliquer l'utilité d'un import lors de la première utilisation ou pour compléter une liste existante. Rappeler que la création manuelle reste possible.
2. Présenter le fichier de 40 personnes fictives : prénom, nom, email, téléphone et tags. Le prénom et le nom sont nécessaires ; un membre sans email reste possible. Les disponibilités ne sont pas importées : elles se renseignent ensuite dans la fiche.
3. Ouvrir « Importer des membres », choisir le CSV à vérifier, laisser « Ignorer » pour les emails existants, puis analyser. Montrer les colonnes reconnues, les tags et le récapitulatif. Vérifier que le nombre de membres en base n'a pas changé : l'analyse n'enregistre rien.
4. Montrer les erreurs réelles des lignes 6 et 7 : prénom manquant, adresse email invalide. Montrer également le doublon d'email du fichier et son action dans l'aperçu, sans annoncer une fusion de personnes.
5. Revenir aux options, sélectionner « Mettre à jour », analyser à nouveau et montrer précisément ce qui change pour Camille et Julien. Expliquer uniquement la politique de mise à jour confirmée par le plan réel.
6. Revenir, choisir le fichier Excel corrigé, analyser. Vérifier les 40 lignes et l'absence des deux erreurs. Montrer le membre sans email et les tags séparés par des virgules.
7. Confirmer l'import une seule fois. Lire les nombres réels de créations, mises à jour et lignes ignorées. Fermer et retrouver une nouvelle personne par la recherche, puis vérifier sa fiche et ses tags.
8. Recharger le fichier corrigé avec « Ignorer » et analyser : montrer que les adresses déjà présentes sont reconnues. Ne pas promettre une déduplication des personnes sans email ni par homonymie.
9. Conclure sur le résultat : une liste réutilisable pour préparer les invitations, sans inscrire automatiquement les membres à des créneaux.

## Fichiers d'exemple

`videos/fixtures/member-import/` contient deux CSV et deux XLSX, chacun avec 40 lignes fictives. Les variantes à vérifier et corrigées sont destinées à deux étapes distinctes, pas à deux imports successifs.

Le texte `=1+1` de l'exemple à vérifier est une valeur littérale, pas une formule exécutée. Ne pas confondre cette démonstration avec la protection des exports CSV, qui relève d'un autre parcours.

## Vérifications effectuées

- Les deux formats sont relus par les fonctions de parsing réelles de l'application.
- Fichier à vérifier : 38 lignes parsées et deux erreurs aux lignes 6 et 7 ; le doublon d'email est laissé au plan d'import.
- Fichier corrigé : 40 lignes parsées, aucune erreur de parsing.
- Les cinq colonnes sont reconnues dans les deux formats ; accents, téléphone international et tags sont conservés.
- Prévisualisations des deux feuilles examinées : colonnes et valeurs lisibles.
- Une normalisation équivalente des noms XML de l'export XLSX est appliquée dans l'outil de préparation vidéo pour compatibilité avec le lecteur ExcelJS, sans modifier les données ni l'application.

## État

Prévisualisation MP4 générée. Neuf paragraphes contrôlés indépendamment, capture et assemblage terminés, durées validées et planche examinée. Analyse CSV/Excel, erreurs, 38 créations et deux mises à jour vérifiées par les réponses réelles ; réanalyse montrant 39 fiches ignorées et une création sans email, annulée sans confirmation. Visionnage audiovisuel intégral encore à effectuer.
