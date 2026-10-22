<!-- BROUILLON : texte proposé pour #870, à relire et réécrire par le propriétaire avant publication. Le contrôle « Draft content » reste rouge tant que cette ligne est là. -->
# Un modèle gratuit de planning des bénévoles

Le premier planning d'une association est souvent un tableur. Tout le monde sait l'ouvrir, et quelques colonnes suffisent pour savoir qui tient la buvette samedi. Ce modèle vous donne une base prête à remplir pour une semaine : un bloc par poste, une colonne par jour, combien de personnes il faut sur chaque créneau, et ce qui manque encore, calculé pour vous.

Il est gratuit et sans macro, en .xlsx pour Excel et en .ods pour LibreOffice. Ses formules n'utilisent que des fonctions qui existent aussi dans Google Sheets.

<!-- actions -->
- [Télécharger le modèle Excel (.xlsx, 14 Ko)](/modeles/modele-planning-benevoles.xlsx)
- [Télécharger le modèle LibreOffice (.ods, 39 Ko)](/modeles/modele-planning-benevoles.ods)

![L'onglet Planning du modèle, rempli pour le poste Accueil : deux créneaux, 9 h à 12 h et 14 h à 18 h, du lundi 14 au dimanche 20 juin. Pour chaque jour, le besoin, les prénoms inscrits, le nombre d'inscrits et le manque : 0 en vert quand le créneau est complet, 1 ou 2 en rouge quand il manque du monde, et un nombre d'inscrits en jaune le mercredi, où trois personnes sont notées pour deux places.](/doc-img/modele-planning-tableur.png)

## Ce que contient le modèle

Le fichier a trois onglets.

- **Mode d'emploi** : comment remplir le planning, lire les couleurs, ajouter un poste, un créneau ou des lignes.
- **Planning** : un bloc par poste. Il y en a trois pour l'exemple, Accueil, Buvette, Montage et rangement, à remplacer par les vôtres. Chaque créneau commence par une ligne « Besoin », où vous notez combien de personnes il faut ce jour-là. Viennent ensuite six lignes pour les noms, puis « Inscrits » et « Manque », qui se calculent seuls.
- **Récapitulatif** : le besoin, les inscrits et le manque de chaque jour, et ce qui manque à chaque poste sur la semaine.

Les couleurs aident à repérer les trous. Le manque reste en rouge tant qu'il faut encore quelqu'un, et passe au vert quand le créneau est complet. Le nombre d'inscrits devient jaune s'il y a plus de noms que de places. Le chiffre est toujours écrit dans la case : la couleur ne fait que le souligner.

## Le remplir pas à pas

1. **Nommez l'événement et sa semaine.** Dans l'onglet Planning, écrivez le nom de l'événement en B2 et la date du premier jour en B3. Les jours s'affichent alors en tête des colonnes, par exemple « lundi 14/06 ».
2. **Remplacez les postes d'exemple.** Le nom du poste s'écrit sur la ligne colorée de son bloc, et les lignes en dessous le reprennent.
3. **Donnez l'horaire de chaque créneau**, « 9 h à 12 h » par exemple, dans la colonne Créneau, sur sa ligne « Besoin ».
4. **Indiquez le besoin de chaque jour.** Si le créneau n'a pas lieu le mardi, laissez la case vide : rien n'est compté.
5. **Notez les noms** au fil des réponses, un par case. Le manque et le récapitulatif suivent tout seuls.

Pour un créneau à plus de six personnes, le montage du samedi par exemple, insérez des lignes entre « Nom 1 » et « Nom 6 » : elles sont comptées aussi. Pour un poste de plus, copiez un bloc entier et collez-le sous le dernier. Le mode d'emploi détaille chaque cas.

## Ce qui demande de l'attention

Un planning tenu à la main marche très bien tant qu'une personne s'en occupe et que l'équipe reste petite. Quand elle grandit, quelques points demandent un peu de soin :

- **Une seule version.** Si le fichier circule par email, chacun finit avec sa copie. Gardez un seul fichier de référence, partagé ou tenu par une personne, et mettez la date sur ce que vous envoyez.
- **Les réponses à reporter.** On vous répond par message, au téléphone ou à la sortie de l'entraînement. Chaque réponse est à recopier dans le planning, et c'est là que les oublis arrivent.
- **Les rappels et les changements.** Le tableur ne prévient personne. Le rappel de la veille, un horaire qui bouge, un désistement : c'est à vous d'écrire aux personnes concernées.
- **Les coordonnées.** Un numéro ou une adresse noté à côté d'un nom, c'est une donnée personnelle. Ne partagez le fichier qu'avec celles et ceux qui en ont besoin.

## Le même planning dans benevol.app

Le jour où ces points vous prennent trop de temps, benevol.app reprend la même structure : des postes, des créneaux avec le nombre de places voulu, et ce qui manque, poste par poste. La différence, c'est que les bénévoles s'inscrivent eux-mêmes.

![La Frise des créneaux d'un événement dans benevol.app : une ligne par poste (Montage, Accueil, Buvette, Navette), chaque créneau placé sur la journée avec son nombre d'inscrits et de places libres.](/doc-img/admin-shifts.png)

- **Les créneaux** se créent poste par poste, avec leur nombre de places. Pour une buvette ouverte de 10 h à 22 h, les six créneaux de deux heures se créent en une fois.
- **Un lien à partager.** Chaque bénévole ouvre la page sur son téléphone, choisit ses créneaux et confirme, sans compte ni mot de passe. Vous n'avez plus rien à recopier.
- **Les rappels partent seuls**, deux jours avant, la veille et le jour même. Si un créneau change d'horaire ou est annulé, les inscrits sont prévenus par email.
- **« Où manque-t-il du monde ? »** liste les créneaux à compléter, du plus dégarni au plus proche du complet. C'est la ligne « Manque » du modèle, réunie en une seule liste.
- **Des feuilles pour le terrain** : le planning s'imprime par jour, par poste ou par bénévole.

Vos habitués n'ont pas à être ressaisis, leur liste s'importe depuis un fichier Excel ou CSV. benevol.app est gratuit, open source et hébergé en France.

Le reste est dans [les fonctionnalités](FEATURES.md). La page [Où manque-t-il du monde ?](guide/ou-manque-t-il-du-monde.md) montre la liste des créneaux à compléter, et [Créer son premier événement](guide/creer-son-premier-evenement.md) vous mène jusqu'au lien à partager.

## Questions fréquentes

### Peut-on l'ouvrir dans Google Sheets ?

Ses formules n'utilisent que des fonctions qui existent aussi dans Google Sheets. Importez le fichier .xlsx dans Google Drive, ouvrez-le, puis choisissez « Enregistrer au format Google Sheets » dans le menu Fichier.

### Peut-on l'utiliser pour plus d'une semaine ?

Oui. Dupliquez l'onglet Planning pour chaque semaine, ou enregistrez une copie du fichier. Pour une fête d'un week-end, laissez simplement vides les besoins des autres jours.

### Pourquoi le fichier n'a-t-il pas de macro ?

Pour qu'il s'ouvre sans avertissement de sécurité. Tout se calcule avec des formules ordinaires, que vous pouvez lire et modifier.

## Démarrer

Téléchargez le modèle et remplissez votre première semaine, pour voir. Le jour où vous préférez que les bénévoles s'inscrivent eux-mêmes, demandez un espace sur benevol.app.

<!-- actions -->
- [Télécharger le modèle Excel (.xlsx, 14 Ko)](/modeles/modele-planning-benevoles.xlsx)
- [Demander un espace](/inscription)
