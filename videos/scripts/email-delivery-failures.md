# Comprendre un email en attente ou en échec

Vidéo autonome 43. Préparation uniquement, durée visée six minutes. Une seule voix chaleureuse et souriante. Aucun écran d'échec inventé ne sera présenté comme une panne réellement constatée.

## Utilité

Trouver pourquoi une information n'a pas été remise, choisir entre réessayer le même email et préparer un nouvel envoi, sans relancer inutilement toute l'équipe.

## Démonstration

1. **Trouver le suivi.** Ouvrir Paramètres puis Emails. Montrer les lignes récentes : date, type, destinataire, état et détail. Distinguer le propriétaire, qui peut changer les réglages d'emails, et l'organisateur, qui peut consulter les livraisons et renvoyer un échec sans changer ces réglages.
2. **Lire les quatre états.** En attente d'envoi signifie mis en file ; Nouvel essai prévu signifie qu'une tentative a échoué et qu'une autre est prévue ; Envoyé signifie remis au serveur, pas lu ; Échec définitif signifie que la limite des six tentatives a été atteinte. Montrer l'heure d'envoi ou de prochain essai et le compteur de tentatives sur de vraies lignes.
3. **Comprendre la raison.** Lire un rejet contrôlé du serveur SMTP local, par exemple un destinataire de test refusé. Expliquer la différence entre une panne temporaire et une adresse à vérifier. Une acceptation SMTP ne prouve pas que l'adresse finale existe : certains rejets arrivent après cette acceptation et ne sont pas forcément visibles dans ce tableau. Ne pas prétendre afficher tous les bounces possibles.
4. **Renvoyer après une panne résolue.** Sur un échec définitif issu d'une panne locale réellement provoquée, rétablir le service de test. Cliquer sur Renvoyer, constater le retour en file puis l'email réellement reçu et l'état Envoyé. Ce bouton réessaie le même email ; ce n'est pas un nouvel envoi à tous les bénévoles.
5. **Une adresse erronée.** Ouvrir la fiche du membre fictif et corriger son adresse. Montrer que l'ancienne ligne en échec garde son ancien destinataire : le contenu de cet email avait été préparé auparavant. Ne pas cliquer Renvoyer en promettant qu'il utilisera la nouvelle adresse. Déclencher ensuite une nouvelle action appropriée qui prépare un email à partir de la fiche corrigée, puis vérifier son vrai destinataire dans Mailpit. Le parcours exact doit être testé avant narration finale.
6. **Le suivi d'un message ciblé.** Revenir dans l'événement, sous la page de message. Montrer Messages envoyés : objet, public, auteur, date, nombre et état de remise. Voir le texte envoyé, puis renvoyer seulement les emails en échec si la campagne de démonstration en contient. Vérifier qu'un second clic ne réenvoie pas les emails déjà remis en file ou déjà réussis. Les confirmations et rappels automatiques ne constituent pas des campagnes de cette liste.
7. **Conservation.** Montrer l'information de la page : les lignes envoyées de la file sont supprimées par le nettoyage nocturne, les échecs restent trente jours ; la page affiche les deux cents plus récents. L'historique des messages ciblés a une conservation différente, douze mois. Ne pas présenter le tableau comme une archive exhaustive et permanente.
8. **Conclusion.** Lire l'état et le détail, vérifier la cause, corriger ce qui doit l'être et confirmer la remise du bon message. Pour une urgence, contacter directement la personne ; un compteur vert n'est pas une preuve de lecture.

## Résultat visible

La ligne passe de l'échec à la file puis à l'envoi ; le bon email est effectivement reçu localement ; une campagne ne renvoie que ses échecs. L'ancien destinataire reste identifiable après correction de la fiche et le nouvel envoi utilise réellement l'adresse corrigée.

## Points d’attention

- Réussite réelle dans Mailpit ; email effectivement en attente ; tentative réellement rejetée par le SMTP local, puis réessayée ; échec définitif après six tentatives réelles.
- Les pannes sont limitées au service de messagerie vidéo isolé et à des adresses fictives. Pas de modification du SMTP de production, pas d'adresse externe réelle, pas de secret dans les images.
- Ne pas modifier directement les colonnes `status` ou `attempts` pour raconter que six essais ont eu lieu. Si le rythme réel est trop long pour la prise, un intertitre explique l'ellipse ; les traces conservées prouvent les essais.
- Avant/après renvoi : même notification, remise en file, destinataire vérifié, email effectif reçu. Les exemples de correction d'adresse devront produire un nouvel email, pas falsifier le payload ancien.
- Campagne avec plusieurs destinataires et un seul échec réel ; une réussite ne doit pas être renvoyée. Comparer les compteurs, les lignes de file et les nouveaux emails.

## Point de vigilance confirmé par le code

Le 5 octobre 2026, la route de renvoi et `retryOutboxRow` ont été examinés : seul l'état, le nombre d'essais, la prochaine échéance et le verrou sont réinitialisés. Le payload et son destinataire ne sont pas reconstruits depuis la fiche du membre. La même règle vaut pour le renvoi des échecs d'une campagne. Le plan « corriger l'adresse puis cliquer Renvoyer » serait donc trompeur sans cette explication. Aucun correctif du produit ni ticket externe n'est créé dans le cadre des vidéos.

## État

Formulaire de suivi, libellés d'états, route de renvoi individuel et renvoi des échecs de campagne examinés. Le manifeste prépare huit chapitres avec une narration continue Puck ; il reste hors du catalogue exécutable tant que le scénario SMTP et le recorder ne sont pas prêts. Le scénario de panne SMTP contrôlée, le recorder et les médias restent à construire. La disponibilité des crédits Gemini reste nécessaire aux nouvelles voix et à leur contrôle indépendant. Aucune réception ni démonstration audiovisuelle de cette vidéo n'est encore validée ; les phrases décrivant les exemples ne doivent pas être utilisées dans une vidéo avant que leurs preuves existent.
