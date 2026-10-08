# Remplacer le tableur des bénévoles

Beaucoup d'associations tiennent le planning de leurs bénévoles dans un fichier Excel ou une feuille Google Sheets. Tant qu'une seule personne le remplit, ça tient. Les ennuis arrivent quand trente bénévoles doivent s'y inscrire eux-mêmes, ou quand le fichier repart par email avec « version finale 3 » dans son nom.

benevol.app prend le relais sur cette partie-là. Vous y importez votre liste de bénévoles et vous refaites les créneaux, puis vous envoyez un lien au lieu du fichier. Si vous avez encore besoin d'un tableur, les inscriptions s'exportent dans un fichier qui s'ouvre dans Excel.

<!-- actions -->
- [Demander un espace](mailto:contact@benevol.app?subject=Demande%20d%E2%80%99un%20espace%20sur%20benevol.app&body=Bonjour%2C%0A%0ANous%20aimerions%20essayer%20benevol.app%20pour%20organiser%20nos%20b%C3%A9n%C3%A9voles.%0A%0AAssociation%20%3A%0A%C3%89v%C3%A9nement%20%28nom%2C%20dates%2C%20nombre%20de%20b%C3%A9n%C3%A9voles%20environ%29%20%3A%0AAdresse%20souhait%C3%A9e%20%3A%20%E2%80%A6.benevol.app%0A%0AMerci%20%21)
- [Voir comment passer du tableur à benevol.app](#passer-du-tableur-a-benevol-app-en-trois-etapes)

<!-- image: VOLUNTEER_CHOOSE_SHIFTS | La page d'inscription d'un événement : les créneaux de chaque poste sur une frise par jour, et à droite le récapitulatif des créneaux choisis. -->

<!-- video: EVENT_CREATE_PUBLISH_OVERVIEW -->

## Ce que le tableur fait bien

Autant le dire tout de suite, le tableur a de vraies qualités. Tout le monde au comité sait l'ouvrir, il ne coûte rien et on y ajoute les colonnes qu'on veut, la taille de t-shirt comme la personne qui amène la camionnette. Pour une buvette d'un après-midi tenue par six habitués, une feuille et deux coups de téléphone suffisent souvent. Si c'est votre cas, gardez-la.

## Là où il coince

Le tableur montre ses limites le jour où les bénévoles s'inscrivent eux-mêmes. Partagée en modification, la feuille Google Sheets voit passer quarante personnes. Quelqu'un trie une colonne sans les autres, une ligne disparaît, et le samedi matin deux personnes se présentent au bar pour une seule place, chacune sûre d'être inscrite. Avec un fichier Excel envoyé par email, c'est l'inverse : les réponses arrivent une par une, et c'est vous qui recopiez les noms le soir dans la bonne case.

La feuille ne prévient personne non plus. Personne n'est relancé la veille, et celui qui attendait qu'une place se libère n'en saura rien. Pour savoir où il manque du monde, il faut relire toutes les lignes, alors les derniers jours se passent au téléphone. Une feuille partagée montre aussi à chacun le numéro et l'adresse email de tous les autres.

Sur benevol.app, chaque bénévole choisit ses créneaux sur une page qui affiche les places restantes, jamais les coordonnées des autres inscrits. Un créneau complet n'accepte pas de nom en plus. Si vous avez activé sa liste d'attente, la personne suivante y prend son rang.

## Passer du tableur à benevol.app en trois étapes

1. **Importez vos bénévoles.** Enregistrez votre liste au format Excel ou CSV et importez-la depuis la page Membres. Rien n'est enregistré avant que vous ayez vu ce que l'import va créer.
2. **Recréez les postes et les créneaux.** Un poste par mission, puis ses créneaux. Une buvette de 10 h à 22 h en tranches de deux heures se crée en une seule saisie.
3. **Partagez le lien.** Une fois l'événement publié, envoyez son lien à vos membres, sur le groupe de l'association ou sur une affiche avec son QR code. Chacun s'inscrit depuis son téléphone, sans créer de compte.

## Importer la liste de vos bénévoles

<!-- image: MEMBERS_MANAGEMENT | La fiche d'un membre : prénom, nom, email, téléphone, étiquettes, notes et disponibilités générales. -->

Pas besoin de remettre votre fichier au propre. Le bouton **Importer CSV/Excel**, sur la page **Membres**, accepte un fichier Excel (.xlsx) ou un fichier CSV, le format texte que tout tableur sait enregistrer, jusqu'à 5000 lignes. Les colonnes sont reconnues par leur intitulé : prénom, nom, email, téléphone et étiquettes. Les variantes courantes passent aussi, comme « courriel », « mobile » ou « groupes ». Depuis Google Sheets, téléchargez d'abord la feuille au format .xlsx ou .csv.

**Analyser le fichier** montre ensuite, sans rien enregistrer, qui sera créé, qui sera mis à jour et quelles lignes posent problème, avec leur numéro et la raison : un nom manquant, un email invalide, la même adresse deux fois dans le fichier. Quand une adresse est déjà connue, vous choisissez d'ignorer la ligne ou de mettre la fiche à jour. Les majuscules ne comptent pas, Marie.Dupont et marie.dupont sont la même personne. Le fichier n'est pas conservé après l'import.

Une même personne inscrite deux fois dans votre ancien fichier, avec deux adresses différentes ? benevol.app signale les doublons possibles, et c'est vous qui décidez, champ par champ, ce que vous gardez. Vos membres peuvent ensuite recevoir une invitation par email, avec un lien qui remplit déjà leurs coordonnées.

<!-- video: MEMBERS_IMPORT -->

En savoir plus : [gérer les membres](guide/gerer-les-membres.md), [doublons et fusion](guide/doublons-et-fusion.md), [inviter des membres](guide/inviter-des-membres.md).

## Recréer le planning

<!-- image: SHIFTS_ROLES_VIEWS | La Frise des créneaux d'un événement : une ligne par poste, chaque créneau placé sur la journée avec ses places. -->

Le planning lui-même ne s'importe pas. On le refait, et ça va plus vite qu'on ne le croit. Une colonne de votre feuille devient le plus souvent un poste (accueil, bar, parking), et chaque ligne horaire un créneau avec son nombre de places.

Pour une plage entière, **Créer une série** découpe la journée en créneaux de même durée, avec une pause entre deux si vous voulez, et montre l'aperçu avant de les créer. Un créneau de nuit peut finir le lendemain. Vous pouvez aussi partir d'un modèle (festival, buvette, manifestation sportive, fête de village). L'année suivante, **Dupliquer** reprend l'événement avec toutes ses dates décalées.

Tout se retrouve sur la Frise, une ligne par poste, où l'on voit d'un coup d'œil les places prises et celles qui restent.

<!-- video: SHIFT_CREATE_SERIES -->

En savoir plus : [créer son premier événement](guide/creer-son-premier-evenement.md), [créer une série de créneaux](guide/creer-une-serie-de-creneaux.md), [configurer les créneaux](guide/configurer-les-creneaux.md), [dupliquer un événement](guide/dupliquer-un-evenement.md).

## Partager un lien plutôt qu'un fichier

<!-- image: VOLUNTEER_REGISTER | La page d'inscription sur un téléphone : le créneau choisi, puis le court formulaire « Vos informations ». -->

Une fois l'événement publié, **Copier le lien** vous donne son adresse, à coller dans un email ou une messagerie. Le QR code se télécharge pour l'affiche de la salle des fêtes.

Le bénévole ouvre la page dans le navigateur de son téléphone, coche un ou plusieurs créneaux et donne son nom et son email. Si deux créneaux se chevauchent, la page le lui signale. Il reçoit une confirmation avec un lien personnel pour retrouver ses créneaux ou en annuler un, et la place libérée revient dans le planning.

Certains ne s'inscriront jamais en ligne. Quand Monique vous appelle pour prendre le stand des crêpes, vous l'ajoutez vous-même avec **+ Ajouter manuellement**, en notant « inscrite par téléphone ».

En savoir plus : [partager le lien](guide/partager-le-lien.md), [s'inscrire](guide/s-inscrire.md), [suivre les inscriptions](guide/suivre-les-inscriptions.md).

## Ce que la feuille ne faisait pas

<!-- image: STAFFING_GAPS | « Où manque-t-il du monde ? » : le nombre de places pourvues sur le total, puis les créneaux à compléter, là où il manque le plus de monde d'abord. -->

Les rappels partent par email sans que vous y pensiez, deux jours avant, la veille, puis quelques heures avant le premier créneau de la journée. Quand quelqu'un se désiste sur un créneau avec liste d'attente, la place est proposée par email à la personne suivante, qui a 24 heures pour la prendre. Et si vous déplacez un créneau d'une heure, les inscrits reçoivent un email.

La page **Où manque-t-il du monde ?** liste les créneaux à compléter, les plus dégarnis en premier. Vous pouvez y chercher des bénévoles parmi vos membres et leur écrire directement.

Le jour de l'événement, une page faite pour le téléphone montre les créneaux en cours et ceux des trois prochaines heures, qui est arrivé et qui manque. Pour ceux qui préfèrent le papier, les plannings par jour, par poste et par bénévole s'impriment, avec une feuille de présence à cocher.

<!-- video: STAFFING_GAPS -->

En savoir plus : [les rappels](guide/rappels.md), [la liste d'attente](guide/liste-d-attente.md), [où manque-t-il du monde ?](guide/ou-manque-t-il-du-monde.md), [les présences le jour J](guide/presences-le-jour-j.md).

## Garder un tableur sous la main

<!-- image: EVENT_REPORTS | Le planning imprimé : pour chaque poste, les créneaux de la journée et le nom des bénévoles inscrits, lisible en noir et blanc. -->

Laisser le tableur pour les inscriptions ne vous oblige pas à vous en passer pour le reste. Le trésorier voudra ses chiffres, et la mairie parfois la liste des présents. Ces fichiers, vous les téléchargez vous-même, quand vous voulez.

- **Exporter les présences (CSV)**, sur la page des inscriptions de l'événement, donne une ligne par inscription confirmée, avec nom, email, téléphone, poste, créneau, date, horaires et présence. C'est ce qui ressemble le plus à votre ancienne feuille.
- **Exporter les membres (CSV)** sort tout votre répertoire, avec les étiquettes, les disponibilités et les notes.
- **Heures par bénévole, pour une période (CSV)** sert au rapport annuel ou à un dossier de subvention.
- Les plannings imprimables s'enregistrent en PDF, et l'archive complète d'un événement se télécharge en JSON, un format de données qu'un autre logiciel sait relire.

Les fichiers CSV s'ouvrent tels quels dans Excel ou LibreOffice. Un numéro de téléphone qui commence par + y reste affiché comme un numéro, au lieu d'être pris pour une formule.

<!-- video: DATA_EXPORTS_ARCHIVES -->

En savoir plus : [exporter et conserver ses données](guide/exporter-et-conserver-ses-donnees.md), [rapports, badges et résumé](guide/rapports-badges-et-resume.md).

## Questions fréquentes

### Que deviennent mes données Excel ?

Votre fichier reste sur votre ordinateur, tel quel. Quand vous importez la liste des bénévoles, benevol.app en tire les fiches de vos membres et ne garde pas le fichier. Le planning, lui, ne s'importe pas : les postes et les créneaux se recréent, le plus souvent en quelques séries.

### Comment importer la liste des bénévoles ?

Sur la page Membres, bouton **Importer CSV/Excel**, avec un fichier .xlsx ou .csv de 5000 lignes au plus. Les colonnes prénom, nom, email et téléphone sont reconnues par leur intitulé. **Analyser le fichier** montre ce qui sera créé ou mis à jour, et les lignes en erreur, avant que rien ne soit enregistré.

### Pourrai-je encore exporter vers un tableur ?

Oui. Les inscriptions d'un événement s'exportent en CSV, un fichier qui s'ouvre dans Excel ou LibreOffice, avec une ligne par bénévole et par créneau. Vos membres et les heures par bénévole s'exportent aussi en CSV, quand vous voulez.

### Combien de temps faut-il pour passer au nouvel outil ?

Votre espace se demande par email. Ensuite, l'import de vos membres prend quelques minutes, le temps de relire l'analyse. Pour une buvette de quelques postes, le premier planning peut être publié en un quart d'heure environ. Un festival sur plusieurs jours demande plus de saisie, mais les séries de créneaux en font l'essentiel.

### Et si je veux revenir au tableur ?

Rien ne vous retient. Exportez les inscriptions, les membres et les heures en CSV, ou l'archive complète de chaque événement, puis demandez la fermeture de votre espace. Pendant 30 jours, il peut encore être réactivé. Passé ce délai, ses données sont effacées.

### Mes bénévoles devront-ils créer un compte ?

Non. Ils ouvrent le lien, choisissent leurs créneaux et confirment avec leur nom et leur email. L'email de confirmation contient un lien personnel pour retrouver ou annuler leurs créneaux. Ceux qui n'ont pas d'email, vous pouvez les inscrire vous-même depuis l'administration.

### Est-ce gratuit ?

Oui. Il n'y a ni abonnement ni fonction payante, et aucun plafond de bénévoles ou d'événements. Le code est open source, sous licence AGPL, et le service est hébergé en France.

## Démarrer

Écrivez-nous pour obtenir votre espace, à l'adresse de votre association, du type votre-association.benevol.app. La page [Créer son premier événement](guide/creer-son-premier-evenement.md) vous accompagne ensuite jusqu'au lien partagé. Pour voir tout ce que fait l'outil, lisez la page [Logiciel de planning pour bénévoles](LOGICIEL-PLANNING-BENEVOLES.md) ou les [fonctionnalités](FEATURES.md).

<!-- actions -->
- [Demander un espace](mailto:contact@benevol.app?subject=Demande%20d%E2%80%99un%20espace%20sur%20benevol.app&body=Bonjour%2C%0A%0ANous%20aimerions%20essayer%20benevol.app%20pour%20organiser%20nos%20b%C3%A9n%C3%A9voles.%0A%0AAssociation%20%3A%0A%C3%89v%C3%A9nement%20%28nom%2C%20dates%2C%20nombre%20de%20b%C3%A9n%C3%A9voles%20environ%29%20%3A%0AAdresse%20souhait%C3%A9e%20%3A%20%E2%80%A6.benevol.app%0A%0AMerci%20%21)
- [Créer son premier événement](guide/creer-son-premier-evenement.md)
