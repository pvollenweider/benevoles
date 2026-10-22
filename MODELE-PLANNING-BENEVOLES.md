<!-- BROUILLON : texte proposé pour #870, à relire et réécrire par le propriétaire avant publication. Le contrôle « Draft content » reste rouge tant que cette ligne est là. -->
# Un modèle gratuit de planning des bénévoles

Un tableur reste souvent le premier planning d'une association : tout le monde sait l'ouvrir, et il suffit de quelques colonnes pour savoir qui tient la buvette samedi. Ce modèle vous donne une base prête à remplir pour une semaine : un bloc par poste, une colonne par jour, le nombre de personnes voulu pour chaque créneau, et ce qui manque encore, calculé pour vous.

Il est gratuit, sans macro, et s'ouvre dans Excel, LibreOffice ou Google Sheets.

<!-- actions -->
- [Télécharger le modèle Excel (.xlsx, 14 Ko)](/modeles/modele-planning-benevoles.xlsx)
- [Télécharger le modèle LibreOffice (.ods, 39 Ko)](/modeles/modele-planning-benevoles.ods)

![L'onglet Planning du modèle, rempli pour le poste Accueil : deux créneaux, 9 h à 12 h et 14 h à 18 h, du lundi 14 au dimanche 20 juin. Pour chaque jour, le besoin, les prénoms inscrits, le nombre d'inscrits et le manque : 0 en vert quand le créneau est complet, 1 ou 2 en rouge quand il manque du monde, et un nombre d'inscrits en jaune le mercredi, où trois personnes sont notées pour deux places.](/doc-img/modele-planning-tableur.png)

## Ce que contient le modèle

Le fichier a trois onglets.

- **Mode d'emploi** : comment remplir le planning, lire les couleurs et ajouter un poste, un créneau ou des lignes.
- **Planning** : un bloc par poste (trois postes d'exemple, Accueil, Buvette, Montage et rangement, à remplacer par les vôtres). Chaque créneau a une ligne « Besoin » où vous indiquez combien de personnes il faut ce jour-là, six lignes pour les noms, puis « Inscrits » et « Manque », qui se calculent seuls.
- **Récapitulatif** : le besoin, les inscrits et le manque de chaque jour, et le manque de chaque poste sur la semaine.

Les couleurs montrent où il manque encore du monde : le manque passe en rouge tant qu'il faut encore quelqu'un et en vert quand le créneau est complet, et le nombre d'inscrits passe en jaune quand il y a plus de noms que de places. Le chiffre reste écrit dans chaque case, la couleur ne fait que le souligner.

## Le remplir pas à pas

1. **Nommez l'événement et sa semaine.** Dans l'onglet Planning, écrivez le nom de l'événement en B2 et la date du premier jour en B3 : les jours s'affichent en tête des colonnes.
2. **Remplacez les postes d'exemple.** Le nom du poste s'écrit sur la ligne colorée de son bloc, les lignes en dessous le reprennent.
3. **Donnez l'horaire de chaque créneau** dans la colonne Créneau, sur sa ligne « Besoin ».
4. **Indiquez le besoin de chaque jour.** Laissez la case vide un jour où le créneau n'a pas lieu : rien n'est compté.
5. **Notez les noms** au fil des réponses, un par case. Le manque et le récapitulatif se mettent à jour.

Pour un créneau qui demande plus de six personnes, insérez des lignes entre « Nom 1 » et « Nom 6 » : le décompte les inclut. Pour un poste de plus, copiez un bloc entier et collez-le sous le dernier ; le mode d'emploi détaille chaque cas.

## Ce qui demande de l'attention

Un planning tenu à la main marche très bien tant qu'une personne s'en occupe et que l'équipe reste petite. Quelques points méritent un peu de soin à mesure qu'il grandit :

- **Une seule version.** Si le fichier circule par email, chacun finit par avoir sa copie. Gardez un seul fichier de référence, partagé ou tenu par une personne, et datez ce que vous envoyez.
- **Les réponses à reporter.** Les bénévoles répondent par message, par téléphone ou de vive voix : chaque réponse est à recopier dans le planning, et c'est là que les oublis se glissent.
- **Les rappels et les changements.** Le tableur ne prévient personne : la veille, un changement d'horaire ou un désistement, c'est à vous d'écrire aux personnes concernées.
- **Les coordonnées.** Les numéros et les adresses notés à côté des noms sont des données personnelles : ne partagez le fichier qu'avec celles et ceux qui en ont besoin.

## Le même planning dans benevol.app

Quand ces points commencent à prendre du temps, benevol.app reprend la même structure : des postes, des créneaux avec le nombre de places voulu, et ce qui manque, poste par poste. Ici, ce sont les bénévoles qui s'inscrivent.

![La Frise des créneaux d'un événement dans benevol.app : une ligne par poste (Montage, Accueil, Buvette, Navette), chaque créneau placé sur la journée avec son nombre d'inscrits et de places libres.](/doc-img/admin-shifts.png)

- **Les créneaux** se créent poste par poste, avec leur nombre de places ; une série de créneaux qui se suivent se crée en une fois.
- **Un lien à partager** : chaque bénévole ouvre la page sur son téléphone, choisit ses créneaux et confirme, sans compte ni mot de passe. Il n'y a plus de réponse à recopier.
- **Les rappels partent seuls**, deux jours avant, la veille et le jour même, et les inscrits sont prévenus par email si un créneau change d'horaire ou est annulé.
- **Où manque-t-il du monde ?** liste les créneaux à compléter, du plus dégarni au plus proche du complet, comme la ligne « Manque » du modèle.
- **Le planning s'imprime** par jour, par poste ou par bénévole, pour le terrain.

Vos habitués n'ont pas à être ressaisis : leur liste s'importe depuis un fichier Excel ou CSV. benevol.app est gratuit, open source et hébergé en France.

En savoir plus : [les fonctionnalités](FEATURES.md), [où manque-t-il du monde ?](guide/ou-manque-t-il-du-monde.md), [créer son premier événement](guide/creer-son-premier-evenement.md).

## Questions fréquentes

### Le modèle fonctionne-t-il dans Google Sheets ?

Oui. Ouvrez le fichier .xlsx dans Google Drive, puis choisissez « Enregistrer au format Google Sheets ». Les formules n'utilisent que des fonctions communes à Excel, LibreOffice et Google Sheets.

### Peut-on l'utiliser pour plus d'une semaine ?

Oui : dupliquez l'onglet Planning pour chaque semaine, ou enregistrez une copie du fichier. Pour un événement d'un ou deux jours, laissez simplement vides les besoins des autres jours.

### Pourquoi le fichier n'a-t-il pas de macro ?

Pour qu'il s'ouvre sans avertissement de sécurité. Tout est calculé par des formules ordinaires, que vous pouvez lire et modifier.

## Démarrer

Téléchargez le modèle et remplissez votre première semaine. Le jour où vous préférez que les bénévoles s'inscrivent eux-mêmes, demandez un espace sur benevol.app.

<!-- actions -->
- [Télécharger le modèle Excel (.xlsx, 14 Ko)](/modeles/modele-planning-benevoles.xlsx)
- [Demander un espace](/inscription)
