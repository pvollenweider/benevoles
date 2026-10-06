# Écrire aux bonnes personnes, avec un message qui leur parle

Vidéo autonome 41. Douze chapitres avec une narration continue Puck, souriante et bienveillante. Les manipulations restent lentes et lisibles ; leur durée détermine celle des explications.

État actuel au 5 octobre 2026 : prévisualisation narrée générée, avec ses sous-titres et son transcript. La première capture narrée a révélé que la saisie du modèle dépassait son chapitre de dix secondes. L'explication a été enrichie (nom interne, objet, consignes), plutôt que d'accélérer la frappe. La nouvelle prise vocale unique Puck, ses onze frontières recalées et les douze transcriptions passent ; la capture complète et les contrôles de durée du montage aussi. L'inspection des images et la revue audiovisuelle restent à faire. La réception push et le visionnage humain intégral ne sont pas validés. Les crédits Gemini fonctionnent. Les étapes anciennes ci-dessous sont un historique, pas l'état courant. Rien n'est publié.

## Utilité

Expliquer comment sélectionner les bonnes personnes, préparer un message personnalisé, le vérifier sans l'envoyer puis constater le résultat d'un véritable envoi local. Ne pas confondre acceptation de l'envoi, réception dans Mailpit et lecture par une personne.

## Démonstration

1. **Choisir à qui écrire.** Ouvrir la page de message de l'événement. Expliquer les cinq audiences et cliquer successivement sur chacune : tous les inscrits, un poste, un créneau, la liste d'attente et les invités sans créneau confirmé. Laisser le compteur se mettre à jour avant chaque explication. Les demandes ne sont pas des inscriptions confirmées. Les personnes sans email ne sont pas destinataires de ces emails.
2. **Comprendre le compteur.** Choisir un poste avec une personne inscrite sur deux horaires. Montrer qu'elle compte comme une personne et reçoit un seul message. Comparer avec un créneau précis. Les personnes en attente ou avec une offre se trouvent dans l'audience liste d'attente, pas parmi les confirmations.
3. **Créer un modèle réutilisable.** Aller dans les modèles de l'organisation. Cliquer sur Nouveau modèle ; saisir lentement un nom interne, un objet et le texte. Expliquer que le nom du modèle n'est pas envoyé aux bénévoles. Enregistrer et montrer la nouvelle ligne.
4. **Expliquer les quatre variables.** Utiliser `{prénom}` et `{événement}` pour tous les publics ; `{poste}` seulement pour un poste ou un créneau ; `{créneau}` seulement pour un créneau. Ces variables remplacent du texte, elles ne sont pas un éditeur HTML. Montrer une erreur `{lieu}`, puis sa correction, sans aucun envoi. Montrer également une variable valide mais incompatible avec l'audience choisie.
5. **Appliquer, puis revenir en arrière.** Retourner au message ciblé, écrire une courte version initiale. Sélectionner le modèle : la sélection seule ne remplace rien. Cliquer sur Utiliser ce modèle, constater le remplacement de l'objet et du texte, puis Rétablir le texte précédent. Appliquer à nouveau le modèle voulu.
6. **Prévisualiser pour une vraie personne.** Choisir un créneau non vide. Ouvrir l'aperçu et lire le prénom, l'événement, le poste et l'horaire réellement remplacés dans l'email. Expliquer que l'aperçu montre le premier destinataire, pas un écran permettant de parcourir tous les destinataires. Retourner au message pour une petite correction visible.
7. **Email et notification.** Expliquer la case Envoyer aussi une notification : l'email concerne les destinataires avec une adresse ; la notification concerne leurs appareils effectivement abonnés. Son titre reprend l'objet, son texte la première ligne non vide, avec un format court. Les notifications n'atteignent pas les appareils non abonnés. Aucun abonnement ni réception de push ne sera simulé pour donner l'impression d'une démonstration réelle.
8. **Confirmer sans se précipiter.** Ouvrir l'aperçu, puis la seconde confirmation ; annuler une première fois et vérifier qu'aucun envoi n'a été créé. Reprendre le parcours, laisser le récapitulatif lisible puis confirmer réellement l'envoi local.
9. **Voir le résultat.** Attendre le résultat de l'application. Ouvrir deux vrais emails Mailpit de destinataires différents : prénoms distincts, mêmes consignes et bon créneau. Vérifier une seule copie pour la personne ayant plusieurs inscriptions. Retourner à l'historique pour montrer l'audience, le texte et le résultat conservés. Un résultat positif ne prouve ni lecture ni présence future.
10. **Entretenir ses modèles.** Modifier le nom ou le texte du modèle et constater le changement ; ouvrir sa suppression et annuler. Si la suppression est ensuite montrée réellement, vérifier que le message déjà envoyé reste dans l'historique. Conclure : choisir le public, vérifier le contenu, confirmer, consulter le résultat.

## Texte de démonstration

Nom interne : `Briefing avant le créneau`.

Objet : `Ton briefing pour {poste}`.

Message :

```text
Bonjour {prénom},

Pour {événement}, retrouve-nous quinze minutes avant {créneau}.
Le responsable te montrera le matériel et répondra à tes questions.

Merci pour ton aide et à très vite !
```

Ce modèle vise exclusivement une audience créneau. Pour une audience générale, remplacer les deux variables contextuelles par du texte adapté, pas par une valeur factice.

## Résultat visible

Le public et le nombre évoluent réellement ; le modèle enregistré est réutilisable ; l'aperçu remplace les variables ; les emails reçus portent les bons prénoms et créneaux. L'historique conserve la campagne même si le modèle est supprimé. Chacun de ces résultats doit être filmé et vérifié, pas seulement annoncé.

## Points d’attention

Les données et preuves nécessaires sont les suivantes ; la réception push reste une exigence ouverte, pas une simulation.

- Organisation et événement locaux fictifs, cinq audiences toutes non vides ; au moins une personne confirmée sur plusieurs horaires, une sans email, une demande, des attentes et des invitations sans confirmation.
- Compteurs comparés aux personnes réellement sélectionnées par le service, pas à un nombre arbitraire affiché par le recorder.
- Avant/après annulation : aucun nouveau message, aucune nouvelle entrée d'envoi.
- Envoi effectif : réponse de l'API, historique et messages Mailpit correspondant à cette campagne ; personnalisation comparée sur deux destinataires ; déduplication constatée.
- Push : appareils réellement abonnés et réception réelle à vérifier. La dépendance au scénario d'activation des notifications reste ouverte. Ne pas annoncer une validation push avec zéro appareil ou des abonnements inventés.
- Variables invalides : message d'erreur visible et absence d'envoi ; restauration du texte constatée après utilisation du modèle.

## Synchronisation et historique des contrôles

Chaque action a son ancre dans la narration. Faire apparaître le champ avant de le nommer, laisser les saisies se dérouler pendant leur explication et garder le résultat suffisamment longtemps pour le lire. Intertitres entre les sujets. Contrôle indépendant de chaque chapitre audio, puis inspection du MP4 final avec son audio : une planche de captures ne suffit pas à valider la synchronisation.

Préparation fondée sur le formulaire, le gestionnaire de modèles, les règles des variables et la route d'envoi actuels. Le manifeste est raccordé au catalogue avec `published: false`. Le seed `targeted-messages` est implémenté et vérifié le 5 octobre 2026 après le seed de base, puis exécuté une seconde fois sans doublon : 22 destinataires pour l'événement, 14 pour Buvette, 5 pour son premier créneau, 3 en attente et 2 invités sans confirmation. Les deux inscriptions de Léa forment un seul destinataire ; René sans email est exclu des emails. Ces chiffres décrivent les données à cette date, pas des constantes à reproduire artificiellement. Aucun appareil push fictif n'a été ajouté.

Le parcours de capture des douze chapitres est écrit et raccordé au catalogue et au seed. Il reste à l'exécuter et à corriger les éventuels écarts observés : sa présence dans le code n'est pas une validation. Ses contrôles portent sur l'application du modèle, la restauration du texte, les variables, l'annulation sans envoi, les emails personnalisés dédupliqués et l'historique conservé après suppression du modèle. La case push est expliquée mais la réception push reste explicitement non validée ; la démonstration avec des appareils partiellement abonnés doit être complétée avec de vrais abonnements.

Vérification explicite des types des outils vidéo le 5 octobre 2026 : un chemin de sortie erroné dans le nouveau recorder a été détecté et corrigé avant capture. Le nouveau contrôle `node --import tsx videos/tools/check-types.ts` couvre les quinze sources des outils et bibliothèques vidéo, ainsi que leurs imports transitifs ; il passe et précède désormais les appels de génération dans le build. Cela ne remplace pas l'exécution du scénario.

La narration et le MP4 final restent à créer. Les nouvelles voix et leur contrôle restent dépendants des crédits Gemini ; aucune couverture audiovisuelle complète n'est revendiquée ici.

Première répétition sans voix le 5 octobre 2026 : arrêt au chapitre `variables`, qui dépassait sa durée provisoire d'environ quatre secondes. Le parcours a été corrigé avant une nouvelle prise : erreur et correction dans l'objet court, remplacement explicite du contenu des champs, et ajout de la seule phrase nouvelle lors de la correction de l'aperçu. La vitesse de frappe reste à 95 ms par caractère. Cette répétition partielle n'a pas produit de timeline complet ni de preuve d'envoi ; elle ne constitue pas une vidéo prête. L'option `--rehearse` marque les prises complètes comme répétitions et interdit leur montage/validation comme vidéos finales.

Seconde répétition : les audiences, le compteur, la création du modèle, les variables, l'application/restauration et l'erreur de contexte ont été parcourus. Arrêt dans `preview` : le raccourci de fin de document ne plaçait pas le curseur à la fin du textarea. Remplacé par sélection du texte puis flèche droite, qui réduit la sélection à son extrémité. Ce geste a été vérifié séparément dans le vrai formulaire local, sans envoyer de message. Les chapitres de confirmation, réception et suppression du modèle attendent une répétition complète ; aucun contrôle final n'est revendiqué.

Contrôle préalable local exécuté le 5 octobre 2026 : les cinq réponses de l'API d'aperçu correspondent aux compteurs calculés sur la base réelle, et les objets sont personnalisés. Une variable inconnue et une variable incompatible avec l'audience bloquent également une demande d'envoi réel avant création d'un message. Le nombre d'entrées d'historique reste à 1 et celui de la file d'envoi à 71 avant/après. Rapport : `videos/output/targeted-messages/preflight.json`. Ce contrôle ne prouve ni les interactions filmées, ni la réception des emails, ni la synchronisation audiovisuelle. Aucun appareil push n'est abonné dans ce jeu de données.

Commande de contrôle : `node --env-file=.env.video.e2e --import tsx videos/tools/verify-targeted-messages.ts`. Elle refuse un hôte non local ou une base autre que la base vidéo isolée.

Troisième répétition complète réussie le 5 octobre 2026 à 15:30 UTC : douze chapitres, prise brute de 501,16 secondes, marquée `rehearsal`. Les cinq audiences, la déduplication, les deux erreurs de variables, l'application/restauration du modèle, l'aperçu personnalisé, l'annulation sans envoi et la suppression du modèle avec conservation de l'historique sont vérifiés. Cinq vrais emails sont reçus dans Mailpit, dont une seule copie pour Léa ; deux destinataires ont été comparés pour la personnalisation. Rapport : `videos/output/targeted-messages/targeted-message-checks.json`. La réception push n'est pas validée.

Inspection visuelle de 36 images de cette prise : les formulaires, erreurs, aperçu, confirmations, emails reçus et gestion du modèle apparaissent dans leurs chapitres. Planche et index séparés dans `videos/output/targeted-messages/rehearsal-review-frames`. Cette inspection par échantillons ne valide ni toutes les manipulations ni une synchronisation avec une voix absente. Les intertitres ajoutés au manifeste après le début de cette prise restent à vérifier lors de la prochaine capture. Le montage et la validation finale refusent explicitement cette répétition sans narration.
