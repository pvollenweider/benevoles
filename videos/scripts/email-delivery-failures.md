# Comprendre un email en attente ou en échec

La narration vouvoie les organisateurs et reste souriante et bienveillante. Les citations destinées aux bénévoles peuvent employer « tu » ; ce n’est pas l’adresse au spectateur de cette formation.

Vidéo autonome 43. Préparation uniquement, durée visée six minutes. Une seule voix chaleureuse et souriante. Aucun écran d'échec inventé ne sera présenté comme une panne réellement constatée.

## Reprise avec le worker actuel de main — 6 octobre 2026

Les comptes rendus historiques plus bas décrivent des prises anciennes et ne valident pas le produit actuel. Le worker chargé depuis le snapshot propre vérifié (avec son `tsconfig`, ses alias et son client Prisma généré) remplace désormais les imports du vieux checkout. Sa preuve commit/source/BUILD_ID accompagne la préparation.

La préparation attend exactement sept refus temporaires 451 (Sarah une fois, Emma six fois), un refus permanent 550 (Léa une fois), et une remise réussie. La campagne filmée refuse définitivement Emma une fois seulement ; avancer l'horloge ne doit pas créer d'autre tentative. Après correction, le renvoi produit une nouvelle remise SMTP réelle.

Les chapitres `states`, `reason` et `campaign` ont changé : narration continue à régénérer avant la nouvelle capture. Aucun ancien MP4 ni ancienne preuve de worker ne doit être réattribué à cette version. Nouvelle préparation, capture puis contrôles audio et audiovisuels requis ; ces modifications n'ont pas encore été exécutées contre la DB.

## Utilité

Trouver pourquoi une information n'a pas été remise, choisir entre réessayer le même email et préparer un nouvel envoi, sans relancer inutilement toute l'équipe.

## Démonstration

1. **Trouver le suivi.** Ouvrir Paramètres puis Emails. Montrer les lignes récentes : date, type, destinataire, état et détail. Distinguer le propriétaire, qui peut changer les réglages d'emails, et l'organisateur, qui peut consulter les livraisons et renvoyer un échec sans changer ces réglages.
2. **Lire les quatre états.** En attente d'envoi signifie mis en file ; Nouvel essai prévu signifie un échec temporaire ; Envoyé signifie remis au serveur, pas lu. Échec définitif arrive après six tentatives temporaires échouées, ou immédiatement après un refus SMTP permanent. Montrer Emma à six essais temporaires 451 et Léa arrêtée après un seul refus permanent 550, sans confondre ces causes.
3. **Comprendre la raison.** Lire les phrases françaises réellement affichées, pas le rejet SMTP brut : refus définitif avec boîte aux lettres introuvable et adresse à vérifier, ou échec temporaire avec nouvel essai. Une acceptation SMTP ne prouve pas que l'adresse finale existe : certains rejets arrivent après cette acceptation et ne sont pas forcément visibles dans ce tableau. Ne pas prétendre afficher tous les bounces possibles.
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

Préparation locale du 6 octobre : serveur SMTP de démonstration sur 127.0.0.1:41028,
limité aux adresses `video.delivery.*@example.org`, sans TLS ni authentification
car réservé au loopback. Il ne remplace aucun SMTP existant. Six vrais refus 550
à l'étape RCPT TO ont été provoqués ; après retrait du refus, le message suivant
a réellement été transmis au Mailpit local 41026 et retrouvé dans sa boîte.
Preuve dans `smtp-preparation.json`. Le serveur s'arrête à la fin du contrôle.
Le vrai worker a ensuite effectué treize refus SMTP : un essai sur la ligne en
attente de relance, six sur chacun des deux échecs définitifs. Un autre email a
été réellement remis à Mailpit. `outbox-preparation.json` garde les transitions
et échanges SMTP. Son paramètre `now` avance jusqu'à chaque échéance réelle :
les colonnes d'état et de compteur ne sont pas modifiées artificiellement.
Ce temps accéléré devra être annoncé dans la vidéo.

`ui-details.json` vérifie les quatre états dans l'interface, le bouton Renvoyer,
la réception effective, le refus d'un deuxième renvoi après réussite et la
correction de la fiche de Léa. Le payload ancien demeure inchangé.
`correction-details.json` vérifie ensuite un nouveau message : aperçu et
confirmation dans la vraie interface, historique de campagne créé, destinataire
corrigé et réception effective dans Mailpit. Ces contrôles locaux ne sont pas
encore une capture ni une validation audiovisuelle.

La remise à zéro reconnaît explicitement les deux sujets de campagne de ce
préflight, leur événement, leur auteur et leur texte original, puis les lignes
de file associées et leurs textes personnalisés pour Léa ou Emma. Un autre
contenu fait refuser la suppression. Seules les lignes identifiées et les
campagnes identifiées sont retirées en transaction, pour recréer les cinq
exemples. Les preuves historiques restent des preuves du préflight précédent,
pas une description de la file réinitialisée. Le 6 octobre, cette préparation
complète a réussi après les tests de correction d'adresse et de renvoi partiel.

`partial-details.json` vérifie une campagne réelle de deux destinataires via les
routes de l'application sur le serveur dédié 43106. Le SMTP contrôlé refuse Emma
six fois ; Léa reçoit son email. Les échéances suivantes utilisent l'horloge
accélérée documentée du worker. Après levée du refus, le renvoi des échecs renvoie
une seule ligne ; un second appel renvoie zéro. L'horodatage de remise de Léa ne
change pas. Les échanges SMTP prouvent six refus et deux acceptations au total.
Le contrôle suivant utilise aussi l'interface : historique « 1 envoyé, 1 en
échec », ouverture du texte original avec sa variable, puis clic sur « Renvoyer
l'email en échec ». Le bouton devient « Remis en file », avec `aria-disabled`.
Un deuxième clic physique ne produit aucune requête et la route refuse également
un nouvel envoi en retournant zéro. L'image `partial-history-before.png` a été
inspectée. Cela prépare le tournage mais ne constitue pas une capture narrée.

Le manifeste prépare huit chapitres avec une narration continue Puck ; il reste
hors du catalogue exécutable tant que le recorder n'est pas prêt. Les médias
restent à produire. Les réceptions et parcours locaux ci-dessus sont vérifiés,
mais aucune synchronisation audiovisuelle de cette vidéo ne l'est encore.
Le plafond mensuel Gemini bloque encore les nouvelles voix et leurs contrôles.

## Construction du recorder

`record-delivery.ts` prépare les quatre premiers chapitres : introduction,
lecture des cinq vraies lignes, rejet SMTP et renvoi réellement reçu. Il exige
les états exacts de la préparation, conserve le payload lors du renvoi et
cherche un nouvel email par rapport à la boîte avant le clic. Une annotation
précise que les délais entre essais ont été accélérés, sans modifier les états.
Les quatre chapitres suivants sont désormais écrits et le parcours est branché
dans le catalogue, sans publication : correction par le formulaire membre,
nouvelle campagne et réception à l'adresse corrigée, campagne partiellement
rejetée puis renvoi par son bouton, conservation et résultat. Le wrapper
`run-delivery` utilise exclusivement le port 43106 et le SMTP 41028. Le recorder
possède et ferme son fixture SMTP ; il ne touche pas aux serveurs 43102/43104.
La prise normale exige les WAV et l'audit à jour d'une seule génération Puck
avant de remplacer la capture. La répétition sans voix est lancée ; sa première
passe s'est arrêtée sur deux correspondances du texte dans Mailpit après un
renvoi réellement reçu. Le sélecteur visible exact a été corrigé et la seconde
passe a ensuite atteint la conservation après correction et campagne réellement
réussies. Son sélecteur de conservation a été corrigé vers « Les emails envoyés
sont effacés chaque nuit » ; une troisième passe est en cours. Le transcript a
été développé pour expliquer les deux destinataires du nouvel envoi et les
échéances accélérées, sans évoquer une panne de service qui n'a pas été provoquée.
Ne pas présenter le contrôle TypeScript comme une preuve de
tournage ou de synchronisation.

La troisième répétition a réussi les huit chapitres ; sa capture brute, sa
timeline et ses contrôles sont conservés dans `owner-rehearsal`. L'introduction
est ensuite complétée par une connexion réelle au compte Marc, organisateur :
réglages en lecture seule, puis renvoi et campagnes avec ses propres droits.
La quatrième répétition de cette version a réussi les huit chapitres. Aucun rôle n'est injecté
et aucun formulaire n'est masqué pour simuler une restriction.

Le contrôle `verifyDeliveryReviewFixture` a également passé sur cette prise :
cinq membres et deux comptes fictifs, un événement de formation avec deux
inscriptions, deux messages de Marc, neuf lignes de file et les deux emails
ouverts vérifiés dans Mailpit. Les trente-deux images de répétition sont extraites
et leur planche contact a été inspectée ; ce n'est pas une vérification de la
synchronisation. Le serveur temporaire 43106 est arrêté. Le titre du chapitre
de renvoi est précisé en « Renvoyer après résolution du problème » pour ne pas
prétendre qu'une panne globale de service a été simulée.

Garde-fous vérifiés : la revue audiovisuelle passe le contrôle des données
fictives puis refuse la timeline `rehearsal` avant tout appel Gemini. La capture
normale refuse les métadonnées audio absentes avant de remplacer le fichier
brut. Son SHA-256 est identique avant/après ce refus :
`ff7c9b31b6524cdd5875a9e0c5d58b6c87866165894e1ada1679c46f369f7809`.
Les outils passent le contrôle TypeScript sur 71 fichiers explicites.

La cinquième répétition a réussi les huit chapitres après ajout d'un contrôle
de fraîcheur pour l'adresse corrigée : l'email affiché doit avoir un identifiant
Mailpit absent avant le nouvel envoi. Le contrôle des données de revue exige
désormais cette preuve, afin de ne pas accepter un email d'une ancienne prise.
Cette répétition reste sans narration synchronisée et n'est pas un MP4 final.
Le serveur temporaire 43106 a ensuite été arrêté.
Après ce renforcement, le contrôle TypeScript complet du projet a également
réussi (`@typescript/native/bin/tsc --noEmit --incremental false`). Ce résultat
ne remplace pas les contrôles de narration et de synchronisation à effectuer.
