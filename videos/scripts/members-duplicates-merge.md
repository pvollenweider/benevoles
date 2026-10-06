# MEMBERS_DUPLICATES_MERGE — Repérer les doublons et fusionner sans perdre le fil

Vidéo autonome. Voix Kore constante, souriante et bienveillante ; génération continue sans balises de pause. Musique Mixkit discrète et sons uniquement sur les interactions réellement observées. Locale navigateur et processus française. Toutes les données sont fictives dans l’organisation dédiée `video-member-merge` ; port 43110, jamais 3100 ni 3101.

## Parcours réel

La narration s’adresse aux organisateurs avec « vous », dans un ton souriant et bienveillant. Les bénévoles peuvent être tutoyés uniquement dans les exemples de messages qui leur sont destinés.

1. **Doublons possibles** : montrer les raisons, ouvrir Comparer et fusionner sans confirmer, revenir, puis Ignorer. Vérifier que la suggestion disparaît sans absorber les fiches.
2. **Choisir la fiche conservée** : activité de Robin, Fusionner avec un autre membre, recherche de l’adresse fictive erronée, choix précis de la seconde fiche. Propriétaire uniquement.
3. **Profil et aperçu** : email conservé, téléphone pris sur l’autre fiche, notes réunies, tableau des données déplacées. Les étiquettes et disponibilités sont effectivement réunies ; l’abonnement navigateur fictif est effectivement supprimé.
4. **Conflits** : même créneau, chevauchement, limite, âge et accès réservé réellement présents. Choisir explicitement la réponse et l’invitation de la fiche absorbée. Le bouton ne devient disponible qu’après résolution.
5. **Confirmation** : case d’envoi des nouveaux liens cochée puis décochée ; ne prétendre envoyer aucun email. Résumé irréversible puis vraie confirmation.
6. **Résultat** : retour à l’activité, une seule fiche active. Contrôles en lecture seule des déplacements, choix conservés, notes, disponibilités et effacement de la fiche absorbée.
7. **Liens** : ancien lien réellement invalide, nouveau lien réellement valide. Les tokens ne figurent jamais dans les métadonnées de preuve : uniquement leurs empreintes et les statuts de lookup. Le doublon de créneau annulé reste annulé, y compris avec son token régénéré.

## Préparation et reprise

Le préparateur refuse tout écrasement implicite. Une prise complète fusionne réellement les deux fiches de formation. Pour une nouvelle prise, la commande explicite `videos/tools/local-production.ts run videos/tools/prepare-member-merge.ts --reset-owned` vérifie les identifiants exacts, les données fictives, tous les objets dépendants et le journal de fusion, puis reconstruit seulement cette organisation dans une transaction. Le registre `ownership.json` et son empreinte `ownership.sha256` lient le scénario à sa génération. Un état partiel ou inconnu est refusé ; la récupération sans registre n’accepte que l’état initial complet exact. Le hash du mot de passe propriétaire est conservé et l’organisation par défaut n’est jamais modifiée.

`record-member-merge.ts` reçoit les lecteurs de base réels de `member-merge-fixture.ts`. Ces lecteurs ne modifient rien. Toute mutation du parcours est effectuée par l’interface du produit compilé depuis `main`.

La transcription prononcée est la source du manifest. Après capture : transcription multilingue, synchronisation voix/actions, mixage et revue audiovisuelle du MP4, puis revalidation de l’évolution de `main`. La présence du module ou d’un manifest n’est pas une preuve de livraison.
