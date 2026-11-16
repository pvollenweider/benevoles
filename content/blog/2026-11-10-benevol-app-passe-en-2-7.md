---
title: benevol.app passe en 2.7 : les secteurs pour tous, et un jour J plus souple
date: 2026-11-10
summary: Secteurs pour tous, besoin de dernière minute le jour J, « Je ne peux pas » par créneau et ménage des membres en une fois.
version: 2.7.0
---

La 2.7 rend disponibles pour tous des outils que vous avez essayés en bêta, et s'attaque aux petites frictions du terrain : le besoin imprévu du jour J, les relances qui tombent à côté, le nettoyage d'une liste de membres après un import raté.

## Les secteurs, pour toutes les organisations

À la Fête des Moissons de Vercelin, la buvette, la cuisine et le parking comptent chacun plusieurs postes. Avec les secteurs, « Parking Nord » et « Parking Sud » se rangent sous « Parking », et une seule personne peut suivre tout le secteur depuis son lien de responsable, sans compte.

Les secteurs ne demandent plus de participer à la bêta : l'option « Organiser les postes par secteurs » se trouve dans les informations de chaque événement. Elle reste désactivée par défaut, et un événement sans secteurs ne change pas.

→ [Organiser les postes par secteurs](/doc/gerer-les-postes#organiser-les-postes-par-secteurs)
→ [Confier tout un secteur à un responsable](/doc/responsables-de-secteur#confier-tout-un-secteur)
▶ Vidéo : [Organiser les postes par secteurs](/videos/SECTORS)
▶ Vidéo : [Responsables de poste et de secteur](/videos/SECTOR_LEADERS)

## Un besoin de dernière minute, le jour J

Samedi, 15 h : le camion de boissons arrive plus tôt que prévu et il faut deux bras de plus au déchargement. Depuis la page Jour J, **Ajouter un besoin** crée le créneau en deux étapes, sans quitter la page, puis propose aussitôt la liste des bénévoles inscrits aujourd'hui. Un email et une notification sur leur téléphone partent en un clic.

→ [Ajouter un besoin le jour J](/doc/presences-le-jour-j#ajouter-un-besoin)
▶ Vidéo : [Gérer un imprévu sans perdre le fil](/videos/LAST_MINUTE_CHANGES)

## « Je ne peux pas », pour un seul créneau

Quand vous cherchez du monde, l'email « On cherche encore du monde » propose maintenant, sous chaque créneau, un lien **Je ne peux pas**. La réponse ne vaut que pour ce créneau : la personne reste dans vos listes, et vous voyez « A répondu non le … » avant de la relancer pour le même créneau.

→ [Chercher des bénévoles](/doc/ou-manque-t-il-du-monde#chercher-des-benevoles)
▶ Vidéo : [Gérer un imprévu sans perdre le fil](/videos/LAST_MINUTE_CHANGES)

## Le ménage des membres en une fois

Un fichier importé par erreur, et voilà deux cents fiches en trop. La liste des membres permet maintenant de sélectionner les fiches du filtre affiché et de les supprimer en une seule confirmation. Les membres qui ont des inscriptions ne sont jamais supprimés : une case propose de les désactiver au passage, et **Désactiver la sélection** fait la même chose sans rien supprimer.

→ [Supprimer plusieurs fiches en une fois](/doc/effacer-ou-supprimer-un-membre#supprimer-plusieurs-fiches-en-une-fois)
▶ Vidéo : [Importer ses membres sans repartir de zéro](/videos/MEMBERS_IMPORT)

## Des inscriptions publiques vérifiées, si vous le voulez

Une adresse mal tapée, et un bénévole ne reçoit jamais son lien. Pour les événements où cela compte, une nouvelle option demande de confirmer son adresse email avant que l'inscription soit définitive : les places sont réservées au plus 24 heures, le temps de cliquer sur **Confirmer mon inscription**. L'option est désactivée par défaut, et un bénévole qui passe par son lien personnel s'inscrit comme avant.

→ [Les options d'un événement](/doc/creer-un-evenement#page-blanche)
→ [Côté bénévole : confirmer son adresse](/doc/s-inscrire#si-l-organisation-demande-de-confirmer-ton-adresse-email)

## Et aussi

- **Une couleur par type de poste**, la même d'une organisation à l'autre : l'accueil en bleu, les secours en rouge, la buvette en ambre. La couleur que vous choisissez reste prioritaire.
- **Le [Manifeste](/manifeste)** dit pourquoi benevol.app existe et ce qu'il ne fera pas.
- **Les [guides pratiques](/ressources)** rassemblent des méthodes pour organiser ses bénévoles, utiles aussi sans logiciel : un désistement la veille, un roulement équitable, un changement de planning à annoncer.

## Pour les installations auto-hébergées

Avec Docker Compose, l'application n'écoute plus que sur la machine elle-même (`127.0.0.1:3000`). Si vous y accédez depuis une autre machine, publiez le port sur une interface privée derrière un proxy de confiance.

→ [Déploiement](https://github.com/pvollenweider/benevoles/blob/main/docs/deploiement.md)

## Et maintenant ?

Activez les secteurs sur votre prochain grand événement, essayez le jour J avec un besoin imprévu, et dites-nous ce qui vous manque : [contact@benevol.app](mailto:contact@benevol.app). Tout le détail est dans les [Nouveautés](/nouveautes).

À très vite,
L'équipe benevol.app
