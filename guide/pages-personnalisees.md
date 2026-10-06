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

**`/admin/events/[id]/pages`**

En complément du champ unique « instructions publiques », ajoutez autant de pages libres que nécessaire à un événement : règlement, FAQ, accès et lieu, ce qu'il faut apporter…

- **Ajouter** une page : titre + contenu rédigé en Markdown (gras, listes, titres, liens, tableaux)
- L'adresse de la page (slug) est générée automatiquement depuis le titre
- **Réordonner** les pages avec leurs flèches Monter et Descendre (aussi au clavier) : l'ordre est enregistré à chaque déplacement ; si l'enregistrement échoue, un message le dit et l'ordre enregistré est rétabli
- **Supprimer** une page (confirmation demandée)

Les pages apparaissent sous forme de liens juste après les instructions publiques, sur la page de l'événement.

![Pages personnalisées d'un événement (« Accès et parking », « Questions fréquentes »), avec leur adresse et les actions modifier et supprimer](/doc-img/admin-pages.png)

## Questions fréquentes

### Je veux donner des infos pratiques (accès, parking, ce qu'il faut apporter) sans surcharger le message principal.

Créez une ou plusieurs pages personnalisées : règlement, FAQ, plan d'accès… Elles apparaissent comme des liens discrets sous les instructions publiques, chacune sur sa propre page.
