---
roles: [admin]
group: publier
order: 20
summary: Copier ou partager le lien d'un événement publié, son aperçu, son QR code, et un lien par club ou équipe filtré sur ses postes.
related: [publier-un-evenement, inviter-des-membres, suivre-les-inscriptions]
legacy: [admin#partager-le-lien, admin#qr-code]
aliases: []
---

# Partager le lien de l'événement

Une fois l'événement publié, la page de l'événement (section **Partager l'événement**) et la page de vérification avant publication affichent le lien à partager, avec deux boutons :

- **Copier le lien** copie l'adresse publique de l'événement. « Lien copié. » s'affiche sous les boutons. Si le navigateur refuse la copie, le lien affiché est sélectionné : copiez-le.
- **Partager** ouvre le partage de votre téléphone ou de votre navigateur (WhatsApp, email, messages…). Ce bouton n'apparaît que si votre navigateur sait partager, le plus souvent sur téléphone.

Le lien partagé est toujours l'adresse publique de l'événement, jamais un lien personnel de bénévole ou de responsable.

**Aperçu du lien.** Collé dans une messagerie, un réseau social ou une newsletter, le lien d'un événement publié s'affiche avec son titre, un court texte et l'image de benevol.app. Le texte est le début de la **description** de l'événement (environ 200 caractères, sans mise en forme) ; sans description, c'est « [Organisation] cherche des bénévoles pour [événement], du … au … ». Le nombre de places restantes n'y figure pas : les messageries gardent l'aperçu en mémoire, il serait vite faux. Un événement non répertorié a le même aperçu, mais reste hors des moteurs de recherche. Un brouillon ou un événement archivé ne donne ni titre ni texte.

Une messagerie peut garder l'ancien aperçu quelque temps après une modification du titre ou de la description.

## QR code

Depuis la page de l'événement, puis **QR code**, télécharger le QR code de la page publique de l'événement (formats PNG ou SVG). Pratique pour l'affichage en salle ou sur une affiche. Pour un partage en ligne (messagerie, email, réseau social), utilisez plutôt **Copier le lien** ou **Partager**.

## Un lien par groupe

Quand plusieurs clubs ou équipes recrutent chacun pour leurs propres postes, donnez à chacun son lien : il ouvre la page de l'événement sur les postes de ce groupe seulement, avec son propre QR code, et vous voyez combien d'inscriptions chaque lien a apportées.

Les liens par groupe se gèrent dans la section **Partager l'événement** de la page de l'événement, sous **Liens par groupe**. Vous pouvez les préparer avant de publier : ils ouvrent la page de l'événement une fois celui-ci publié, et tant qu'il ne l'est pas, ils mènent à la même page introuvable que le lien principal.

### Exemple : la fête du village et ses sociétés locales

La fête du village est montée par plusieurs sociétés : l'Amicale des pompiers s'occupe du montage, de la sécurité et du démontage, la fanfare tient la buvette. Chaque société diffuse son lien à ses membres.

**1. Créer un lien par société.** Cliquez sur **Créer un lien pour un groupe**, puis :

- **Nom du groupe** : « Amicale des pompiers » (60 caractères au plus). Ce nom s'affiche sur la page du lien ;
- **Postes affichés** : cochez Montage, Sécurité et Démontage (au moins un poste) ;
- **Masquer les créneaux complets**, si vous le souhaitez : les bénévoles ne voient alors que les créneaux où il reste de la place.

Puis **Créer le lien**. Recommencez pour la fanfare, avec le poste Buvette.

![Section « Partager l'événement » : le lien de l'événement, puis « Liens par groupe » avec deux liens, « Amicale des pompiers » (postes Montage, Sécurité, Démontage) et « Fanfare L'Écho du Mont » (poste Buvette, créneaux complets masqués), chacun avec son nombre d'inscriptions, son adresse et les boutons Copier le lien, QR code PNG, QR code SVG, Modifier et Supprimer ; en dessous, « Créer un lien pour un groupe »](/doc-img/admin-group-links.png)

**2. Diffuser les liens.** Chaque lien a son adresse, de la forme `https://[organisation].benevol.app/[evenement]?groupe=[code]`. **Copier le lien** la copie pour un email ou une messagerie ; **QR code PNG** et **QR code SVG** téléchargent le QR code de ce lien, à imprimer sur l'affiche ou dans le bulletin de la société. Le code est tiré au hasard : on ne devine pas le lien d'une autre société à partir du sien.

**3. Ce que voient les bénévoles.** La page ouverte par le lien n'affiche que les postes de la société, avec une ligne qui le dit, par exemple « Lien « Amicale des pompiers » : seuls ses 3 postes sont affichés. ». Le bouton **Voir tous les postes** montre tout l'événement, et **Revenir aux postes de « Amicale des pompiers »** remet le filtre. Les postes réservés à certains membres gardent leurs règles, quel que soit le lien.

![Page publique de la fête du village ouverte par le lien de l'Amicale des pompiers : la ligne « Lien « Amicale des pompiers » : seuls ses 3 postes sont affichés. » avec le bouton « Voir tous les postes », puis le planning limité aux postes Montage, Sécurité et Démontage](/doc-img/public-group-link.png)

**4. Suivre les inscriptions par société.** Sous chaque lien, la section affiche les inscriptions qu'il a apportées (« 6 personnes inscrites, 6 créneaux »), avec **Voir ses inscriptions**. Sur la page des inscriptions, le filtre **Par lien de groupe** montre les inscriptions d'un lien, ou celles arrivées **Sans lien de groupe**. Vous voyez ainsi quelle société doit encore mobiliser ses membres. Une inscription compte pour le lien par lequel la page a été ouverte, même si le bénévole a choisi un poste d'un autre groupe après **Voir tous les postes**.

### Modifier ou supprimer un lien

**Modifier** change le nom, les postes ou l'option des créneaux complets ; l'adresse et le QR code restent les mêmes, ceux déjà imprimés continuent de fonctionner. Renommer l'événement ou un poste ne casse pas non plus le lien : un poste renommé reste dans le lien sous son nouveau nom. Un poste supprimé en sort, et le lien continue avec les autres. S'il ne reste aucun de ses postes au planning, le lien affiche tout l'événement, avec une courte phrase qui le dit.

**Supprimer** demande une confirmation. Les inscriptions venues de ce lien sont conservées, mais ne sont plus comptées pour ce groupe. L'adresse et le QR code du lien supprimé ouvrent ensuite tout l'événement, avec la phrase « Ce lien de groupe n'existe plus ». La création, la modification et la suppression d'un lien sont inscrites au [journal de l'événement](journal-de-l-evenement.md).
