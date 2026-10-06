# Se coordonner avec le journal de l'organisation

Vidéo autonome 49. Une seule prise Kore, souriante et patiente. Script fondé sur la page réelle `/admin/settings/activity`, `ActivityLog`, la route d'export et le format CSV. Aucun filtre de date, de prénom ou d'action n'est inventé dans l'écran : il propose un filtre par type et une pagination, pas Rejouer ou Récit.

## Utilité et parcours

1. Ouvrir le journal depuis les paramètres ; distinguer actions transversales et historique d'un événement.
2. Lire auteur, action et date sur deux actions de comptes fictifs différents. Expliquer le nom résolu depuis le compte et l'étiquette générique après suppression.
3. Retrouver création, modification et désactivation d'une fiche membre ; ouvrir sa fiche et son activité, puis revenir. Ne pas assimiler modification de fiche et désinscription.
4. Montrer invitation et changement de rôle d'un admin, puis modification des réglages de notification. Les permissions demeurent celles du compte connecté ; ne pas présenter ce journal comme réservé exclusivement au propriétaire alors que la page et son API utilisent le contexte d'organisation courant.
5. Utiliser Membres, Comptes admin, Emails, Organisation et Tous les types. Vérifier les entrées réellement renvoyées et au moins une sélection vide explicable, sans vider l'organisation pour la filmer.
6. Montrer une pagination réelle avec plus de cinquante entrées, sans bouton artificiel. Lire une ligne nouvellement chargée.
7. Depuis une liste filtrée, télécharger le vrai CSV : prouver qu'il contient **tout** le journal et pas uniquement le filtre. Montrer ses sept colonnes, une entrée ancienne, une récente et les changements JSON. Lecture seule, clairement distinguée de l'application ; aucune conversion silencieuse en classeur.
8. Expliquer les limites : copie figée, auteurs visibles, pas de sauvegarde complète ni de restauration, pas de preuve de lecture d'un email. Revenir à une fiche ou aux paramètres pour montrer où agir réellement.

## Données et contrôles requis

- Organisation locale dédiée, au moins deux admins fictifs ; ne pas modifier les noms ou permissions de comptes utilisés par une autre capture.
- Actions issues des vraies routes, pas entrées de journal fabriquées pour simuler une collaboration. Plus de cinquante entrées au total ; création/modification/désactivation de membres, invitation et rôle, réglage de notification.
- Comparer liste filtrée et réponses API ; après pagination, davantage de lignes et aucune entrée perdue.
- Télécharger depuis le vrai lien et comparer chaque ligne du CSV au journal complet, y compris les entrées non visibles avec le filtre choisi. Vérifier ordre chronologique, sept colonnes, accents et protection des valeurs commençant par un caractère de formule.
- Ne pas envoyer de fausse campagne uniquement pour peupler la catégorie Emails. Si cette catégorie est montrée avec des renvois, produire et vérifier un vrai envoi local contrôlé, jamais assimiler SMTP accepté et lecture.
- Filmer l'utilité, la manipulation et son résultat pour chaque sujet. Une planche ne remplace pas la revue du MP4 avec sa voix.

## État

Script et manifeste préparés le 5 octobre 2026. Une narration Kore unique est générée ; ses neuf chapitres passent la transcription indépendante après recalage des frontières. L'organisation de formation séparée contient 61 entrées créées par les vraies sessions de Colette et Samira : 56 créations de membres, une modification, une désactivation, une invitation admin, un changement de rôle et un réglage de notification. Aucun journal n'est inséré artificiellement.

`check-org-activity-export.ts` télécharge le vrai CSV depuis une liste filtrée et compare ses 61 lignes et sept colonnes à l'historique complet retourné par l'API, dans l'ordre inverse de la liste affichée. Le fichier reste inchangé. Ce précontrôle crée aussi, via les routes locales, un événement, un créneau et une inscription d'Aline ; son activité contient donc un fait réel à montrer. Il ne prouve pas encore le cas d'une valeur commençant par un caractère de formule, ni une revue audiovisuelle complète.

Le recorder dédié a terminé ses neuf chapitres et le MP4 est assemblé. Le validateur des durées et de la narration source passe ; une reconnaissance indépendante de l'audio du MP4 passe aussi sur les neuf chapitres. La planche de 36 images a été inspectée : auteurs distincts, activité d'Aline avec inscription, filtres, pagination et vrai CSV sont présents. Le visualiseur du CSV est explicitement distingué de l'application. Revue audiovisuelle intégrale et contrôle natif dans un tableur non revendiqués. Rien n'est publié.
