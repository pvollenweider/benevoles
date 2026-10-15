---
roles: [admin]
group: preparer
order: 120
summary: Des dates clés à cocher dans l'aperçu de l'événement, chacune confiée à quelqu'un si besoin ; les jalons en retard sont mis en évidence.
related: [tableau-de-bord, ou-manque-t-il-du-monde]
legacy: [admin#jalons-de-l-evenement]
aliases: []
---

# Jalons de l'événement

<!-- video: EVENT_MILESTONES -->

Section **Jalons** de l'onglet **Aperçu** de l'événement (**Événements**, puis l'événement).

Une checklist simple de dates clés pour l'événement (ex. « Fermer les inscriptions », « Envoyer les rappels ») : titre, échéance, la personne qui s'en occupe si vous en choisissez une, coché ou non. Cocher un jalon ne déclenche aucune action automatique. Un jalon non coché est en retard dès le lendemain de son échéance, dans le fuseau horaire de l'organisation : il est alors signalé dans **À traiter**, dans l'aperçu de l'événement, et dans **Ce qui demande votre attention** du [tableau de bord](tableau-de-bord.md), avec son titre et la personne qui s'en occupe.

## Qui s'occupe d'un jalon

Le champ **Qui s'en occupe** est facultatif : **Aucun** par défaut, ou un membre de l'[équipe admin](equipe-admin.md) de l'organisation (propriétaire ou organisateur, compte activé). Les responsables de secteur n'y figurent pas : ils n'ont pas de compte et ne voient pas les jalons. Son nom s'affiche sous le titre du jalon (« Qui s'en occupe : … »).

Trois jours avant l'échéance, cette personne reçoit un email de rappel, une seule fois, si le jalon n'est pas encore coché. Un jalon ajouté ou confié moins de trois jours avant son échéance déclenche le rappel dans l'heure qui suit. Si vous changez de personne ou d'échéance, le rappel repart pour la nouvelle personne ou la nouvelle date. Pas de rappel pour un événement archivé, ni pour un compte désactivé.

Si son compte est désactivé, son nom reste affiché avec la mention « compte désactivé » jusqu'à ce que vous choisissiez quelqu'un d'autre ; s'il est supprimé, plus personne ne s'occupe du jalon.

## Modifier ou supprimer un jalon

Pour corriger le titre, l'échéance ou la personne qui s'occupe d'un jalon, cliquez sur **Modifier** sur sa ligne : les champs s'ouvrent à sa place, puis **Enregistrer** (ou **Annuler**, ou la touche Échap). Le jalon reprend sa place dans la liste, triée par échéance. Une échéance passée est acceptée, comme à l'ajout. **Supprimer** retire le jalon après confirmation. Chaque ajout, modification et suppression est inscrit au [journal de l'événement](journal-de-l-evenement.md).

Les jalons ne sont jamais copiés lors d'une duplication.

## Questions fréquentes

### Comment je sais si mon événement va bien se passer avant le jour J, sans tout vérifier à la main ?

Dans l'onglet **Aperçu** de l'événement, **Où manque-t-il du monde ?** dit en phrases les places encore libres, **À traiter** ce qui attend une décision, et les jalons (échéances clés comme « Fermer les inscriptions » ou « Envoyer les rappels ») complètent cet état des lieux, et un jalon dépassé non coché saute aux yeux. Pour le détail des places à pourvoir, voir [Où manque-t-il du monde ?](ou-manque-t-il-du-monde.md).
