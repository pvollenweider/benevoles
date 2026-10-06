---
roles: [admin]
group: suivre
order: 30
summary: L'historique de tout ce qui s'est passé sur un événement, à explorer, rejouer à un instant donné ou raconter en une phrase.
related: [journal-d-activite-de-l-organisation, suivre-les-inscriptions]
legacy: [admin#journal-de-l-evenement]
aliases: []
---

# Journal de l'événement

<!-- video: EVENT_ACTIVITY_LOG -->

**`/admin/events/[id]/log`**

L'historique complet de ce qui s'est passé sur un événement : créneaux créés/modifiés, inscriptions, annulations, pages ajoutées, responsables désignés, jalons… Trois modes :

- **Explorer** : liste filtrable par type, action, personne ou période
- **Rejouer** : reconstitue l'état d'un créneau ou d'une inscription à un instant donné
- **Récit** : raconte en une phrase la suite des événements liés (ex. une annulation qui déclenche une offre de liste d'attente)

Le contenu des pages personnalisées et les coordonnées des bénévoles n'apparaissent jamais dans le journal : seuls les champs modifiés sont indiqués.

**Générer l'état initial** : le journal ne trace que ce qui s'est passé depuis sa mise en place. Pour un événement plus ancien, ce bouton (au-dessus des onglets) ajoute une entrée de départ pour chaque créneau et chaque inscription déjà existants, afin de ne pas laisser le journal vide. Ces entrées sont affichées en gris avec la mention « Généré, pas une action réelle ». Relancer la génération ne crée pas de doublon ; une fois faite, le bouton n'est plus proposé sur ce navigateur.

Ce qui concerne l'organisation plutôt qu'un événement (membres, comptes admin, emails, réglages) est dans le [journal d'activité de l'organisation](journal-d-activite-de-l-organisation.md).

## Questions fréquentes

### J'ai fait une erreur sur un créneau ou une inscription : comment je retrouve ce qui s'est passé ?

Le journal de l'événement garde l'historique complet : qui a fait quoi, quand. Le mode **Rejouer** reconstitue l'état exact d'un créneau ou d'une inscription à un instant donné, et le mode **Récit** raconte en une phrase une chaîne d'événements liés (ex. une annulation qui déclenche une offre de liste d'attente).
