---
roles: [admin]
group: preparer
order: 100
summary: Ajouter à un événement des pages libres (règlement, accès, ce qu'il faut apporter), liées depuis sa page d'inscription.
related: [programme-des-spectacles, creer-un-evenement]
legacy: [admin#pages-personnalisees-de-l-evenement]
aliases: []
---

# Pages personnalisées de l'événement

**Événements**, puis l'événement, puis l'onglet **Partage**, et **Pages d'information** dans ses pages

En complément du champ unique « instructions publiques », ajoutez autant de pages libres que nécessaire à un événement : règlement, FAQ, accès et lieu, ce qu'il faut apporter…

- **Ajouter** une page : titre + contenu rédigé en Markdown (gras, listes, titres, liens, tableaux). Une image s'affiche comme un lien vers elle, que le visiteur ouvre s'il le souhaite
- **Rattacher la page à des postes** : dans « Pour les bénévoles de ces postes », cochez un ou plusieurs postes, ou aucun. Une page rattachée est proposée sous le lien « À lire avant ton créneau » aux bénévoles qui ont une place confirmée sur ces postes : email de confirmation, rappels et page Mes inscriptions. Renommer un poste met la page à jour ; le supprimer en détache le nom. La page et son titre restent publics pour tout le monde, même rattachés : n'y écrivez pas de code d'accès
- L'adresse de la page (slug) est générée automatiquement depuis le titre
- **Réordonner** les pages avec leurs flèches Monter et Descendre (aussi au clavier) : l'ordre est enregistré à chaque déplacement ; si l'enregistrement échoue, un message le dit et l'ordre enregistré est rétabli
- **Supprimer** une page (confirmation demandée)

Les pages apparaissent sous forme de liens juste après les instructions publiques, sur la page d'inscription. Une page rattachée à un poste reste dans cette liste ; elle est en plus nommée, par son seul lien, aux bénévoles confirmés de ce poste.

![Pages personnalisées d'un événement (« Accès et parking », « Questions fréquentes »), avec leur adresse et les actions modifier et supprimer](/doc-img/admin-pages.png)

## Questions fréquentes

### Je veux donner des infos pratiques (accès, parking, ce qu'il faut apporter) sans surcharger le message principal.

Créez une ou plusieurs pages personnalisées : règlement, FAQ, plan d'accès… Elles apparaissent comme des liens discrets sous les instructions publiques, chacune sur sa propre page.

### Une page ne concerne qu'un poste : comment la montrer à ses bénévoles ?

Rattachez-la à ce poste dans « Pour les bénévoles de ces postes ». Les bénévoles qui ont une place confirmée sur ce poste reçoivent le lien dans leur email de confirmation, dans les rappels et sur leur page Mes inscriptions, sans que vous ayez à l'envoyer à la main. La page reste publique : son titre et son contenu sont lisibles par tout le monde, y compris les personnes qui n'ont pas de place sur ce poste.
