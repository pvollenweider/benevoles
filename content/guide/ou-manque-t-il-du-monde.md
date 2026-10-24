---
roles: [admin]
group: suivre
order: 20
summary: Voir en une page les créneaux et les postes qui manquent de monde, puis proposer ces créneaux à des membres choisis.
related: [suivre-les-inscriptions, inviter-des-membres, ecrire-aux-benevoles]
legacy: [admin#ou-manque-t-il-du-monde, admin#chercher-des-benevoles]
aliases: []
---

# Où manque-t-il du monde ?

> « Pour notre tournoi, on a besoin de parents à la buvette, à l'accueil et au montage. Le plus compliqué, c'est de savoir quels postes restent à compléter. »
>
> Julien, responsable d'un club sportif*
>
> \* Personnage et citation fictifs.

<!-- video: STAFFING_GAPS -->

**Événements**, puis l'événement, puis, dans la section **Où manque-t-il du monde ?**, **Voir les créneaux à compléter** (ou **Voir le détail des créneaux** quand tout est complet)

En haut de la page principale de l'événement (**Événements**, puis l'événement), la section **Où manque-t-il du monde ?** résume l'état en quelques phrases (« Il manque encore 12 personnes sur 20 places (7 créneaux). », suivie de « 2 créneaux sont sous leur minimum. » et du nombre de personnes en liste d'attente s'il y en a) et mène à la vue détaillée.

La question que se pose l'organisateur avant l'événement, en une page, du plus urgent au moins urgent :

![Page « Où manque-t-il du monde ? » d'un événement : vue d'ensemble des places pourvues, puis les créneaux à compléter du plus dégarni au plus proche du complet](/doc-img/admin-staffing.png)

- **Postes sans personne** : aucun inscrit sur aucun créneau du poste ;
- **Créneaux à compléter** : chaque créneau avec des places libres, du plus dégarni au plus proche du complet, avec le nombre de personnes qui manquent (les créneaux fermés aux inscriptions ne sont pas comptés). Quand des créneaux ont un minimum de personnes (voir [Minimum de personnes](configurer-les-creneaux.md#minimum-de-personnes)), ceux qui ne l'ont pas encore passent d'abord, avec la mention **sous le minimum** ; ceux qui l'ont atteint (**minimum atteint**) viennent ensuite. Un créneau sans minimum a besoin de toutes ses places : il reste parmi les premiers, trié par personnes manquantes ;
- **Personnes en liste d'attente** : créneaux complets où des bénévoles attendent une place, à qui proposer une place de plus ou un autre créneau ;
- **Postes sans responsable de secteur** (facultatif si vous n'utilisez pas les responsables) ;
- **Créneaux complets**, pour mémoire.

Chaque ligne mène là où on agit : les inscriptions filtrées sur le créneau, les créneaux du poste, ou les responsables de secteur.

## Chercher des bénévoles

Depuis cette page, **Chercher des bénévoles** sur la ligne d'un créneau, ou **Chercher des bénévoles pour plusieurs créneaux** sous la liste.

Après un désistement qui laisse une place vide sans personne sur la liste d'attente, l'email envoyé aux organisateurs contient **Trouver un remplaçant** : il ouvre cette page avec le créneau déjà choisi. Plusieurs désistements du même événement à quelques minutes d'intervalle arrivent dans un seul email, qui les liste avec un lien par créneau à compléter ; il part environ cinq minutes après le dernier.

Sous chaque créneau à compléter, **Chercher des bénévoles** ouvre une page pour proposer ce créneau à des membres choisis ; **Chercher des bénévoles pour plusieurs créneaux**, sous la liste, permet d'en proposer plusieurs à la fois. Sur cette page :

1. Cochez les créneaux à proposer, parmi ceux qui manquent de monde (places libres indiquées, et « sous le minimum » ou « minimum atteint » pour un créneau qui a un minimum ; l'email aux membres n'en parle pas).
2. La liste des membres apparaît, par ordre alphabétique, sans classement ni score. Pour chaque membre, les raisons de sa présence sont écrites : ses étiquettes, sa disponibilité générale (indicative : elle ne confirme rien pour ces créneaux) et si elle correspond aux horaires choisis, s'il est déjà inscrit à l'événement, s'il est déjà invité ou s'il recevra une invitation. Filtrez par **Étiquette** ou cherchez un nom si besoin.
3. Un membre dont une inscription chevauche un créneau choisi, même de quelques minutes, est affiché avec la mention **Chevauchement** et la durée en commun : ce créneau ne lui est pas proposé. Ce n'est pas le cas si l'un des deux postes est cumulable avec un autre créneau : le créneau lui est alors proposé. S'il n'a plus rien à recevoir, sa case n'est pas cochable.
4. Personne n'est coché d'avance : cochez vous-même chaque personne. Les membres inactifs, sans email, déjà inscrits sur tous les créneaux choisis, sans l'étiquette d'un poste réservé, ou dont la date de naissance connue est sous l'âge minimum du créneau ne sont pas listés ; une phrase dit combien ont été laissés de côté et pourquoi. Les membres qui ont répondu « pas disponible » à leur invitation sont aussi laissés de côté, sauf si vous cochez **Afficher aussi les membres qui ont répondu « pas disponible »**.
5. Ajoutez si vous le souhaitez un mot pour accompagner l'email, puis **Voir l'aperçu et envoyer** : l'aperçu montre l'email reçu par la première personne et rappelle le nombre de destinataires avant l'envoi.

Chaque personne reçoit un seul email avec les créneaux qu'elle peut prendre (date, horaires, places libres), un lien **Je prends ce créneau** sous chacun (la page d'inscription s'ouvre avec ce créneau proposé ; premier arrivé, premier servi, avec les règles habituelles de l'inscription), et son lien pour s'inscrire : son lien d'invitation si elle est déjà invitée ; une invitation est créée pour les membres pas encore invités (elle apparaît ensuite dans les invitations de l'événement) ; un membre déjà inscrit sans invitation reçoit le lien de l'événement et celui de ses inscriptions. Personne ne voit les autres destinataires. L'envoi passe par la file d'envoi, compte dans la même limite horaire que [Écrire aux bénévoles](ecrire-aux-benevoles.md), et figure dans les **Messages envoyés** de l'événement. Les inscriptions doivent être ouvertes : sinon l'envoi est refusé.

## Questions fréquentes

### Un poste critique risque d'être en sous-effectif (sécurité, premiers secours…) : comment je le surveille ?

La page **Où manque-t-il du monde ?** de l'événement (lien depuis sa page principale) liste tous les créneaux encore ouverts avec des places libres, tous postes confondus, du plus dégarni au plus proche du complet, et les postes où personne n'est inscrit : pas besoin d'éplucher le planning entier la veille pour repérer ce qui manque. Donnez aussi à ces créneaux un minimum de personnes (par exemple 2 secouristes sur 3 places) : ceux qui ne l'ont pas atteint passent en tête de la liste, marqués **sous le minimum**.
