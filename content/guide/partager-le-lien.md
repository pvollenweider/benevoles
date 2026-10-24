---
roles: [admin]
group: publier
order: 20
summary: Copier ou partager le lien d'un événement publié, son QR code, un lien par groupe filtré sur ses postes, ou l'inscription sur votre site.
related: [publier-un-evenement, inviter-des-membres, suivre-les-inscriptions]
legacy: [admin#partager-le-lien, admin#qr-code]
aliases: []
---

# Partager le lien de l'événement

> « On avait peur de devoir expliquer l'outil à chacun. Finalement, la plupart des bénévoles se sont inscrits seuls, et on a accompagné les quelques personnes qui préféraient nous appeler. »
>
> Exemple de situation : fête de village

L'onglet **Partage** de l'événement (le bouton **Partager le lien**, en haut de ses pages une fois publié, y mène) ouvre la page **Partager l'événement**. Une fois l'événement publié, sa section **Lien de l'événement**, comme la page de vérification avant publication, affiche le lien à partager, avec deux boutons :

- **Copier le lien** copie l'adresse publique de l'événement. « Lien copié. » s'affiche sous les boutons. Si le navigateur refuse la copie, le lien affiché est sélectionné : copiez-le.
- **Partager** ouvre le partage de votre téléphone ou de votre navigateur (WhatsApp, email, messages…). Ce bouton n'apparaît que si votre navigateur sait partager, le plus souvent sur téléphone.

Le lien partagé est toujours l'adresse publique de l'événement, jamais un lien personnel de bénévole ou de responsable.

**Aperçu du lien.** Collé dans une messagerie, un réseau social ou une newsletter, le lien d'un événement publié s'affiche avec son titre, un court texte et l'image de benevol.app. Le texte reprend le début de la **description** de l'événement (160 caractères au plus, sans mise en forme), suivi des dates quand la place le permet ; sans description, c'est « [Organisation] cherche des bénévoles pour [événement], du … au … ». Le nombre de places restantes n'y figure pas : les messageries gardent l'aperçu en mémoire, il serait vite faux. Un événement non répertorié a le même aperçu, mais reste hors des moteurs de recherche. Un brouillon ou un événement archivé ne donne ni titre ni texte.

Une messagerie peut garder l'ancien aperçu quelque temps après une modification du titre ou de la description.

## QR code

Dans l'onglet **Partage**, page **QR code**, télécharger le QR code de la page publique de l'événement (formats PNG ou SVG). Pratique pour l'affichage en salle ou sur une affiche. Pour un partage en ligne (messagerie, email, réseau social), utilisez plutôt **Copier le lien** ou **Partager**.

## Un lien par groupe

Quand plusieurs clubs ou équipes recrutent chacun pour leurs propres postes, donnez à chacun son lien : il ouvre la page de l'événement sur les postes de ce groupe seulement, avec son propre QR code, et vous voyez combien d'inscriptions chaque lien a apportées.

Les liens par groupe se gèrent dans l'onglet **Partage**, section **Liens par groupe et intégration**. Vous pouvez les préparer avant de publier : ils ouvrent la page de l'événement une fois celui-ci publié, et tant qu'il ne l'est pas, ils mènent à la même page introuvable que le lien principal.

### Exemple : la fête du village et ses sociétés locales

La fête du village est montée par plusieurs sociétés : l'Amicale des pompiers s'occupe du montage, de la sécurité et du démontage, la fanfare tient la buvette. Chaque société diffuse son lien à ses membres.

**1. Créer un lien par société.** Cliquez sur **Créer un lien pour un groupe**, puis :

- **Nom du groupe** : « Amicale des pompiers » (60 caractères au plus). Ce nom s'affiche sur la page du lien ;
- **Postes affichés** : cochez Montage, Sécurité et Démontage (au moins un poste) ;
- **Masquer les créneaux complets**, si vous le souhaitez : les bénévoles ne voient alors que les créneaux où il reste de la place.

Puis **Créer le lien**. Recommencez pour la fanfare, avec le poste Buvette.

![Section « Partager l'événement » : le lien de l'événement, puis « Liens par groupe » avec deux liens, « Amicale des pompiers » (postes Montage, Sécurité, Démontage) et « Fanfare L'Écho du Mont » (poste Buvette, créneaux complets masqués), chacun avec son nombre d'inscriptions, son adresse et les boutons Copier le lien, QR code PNG, QR code SVG, Modifier et Supprimer ; en dessous, « Créer un lien pour un groupe », puis « Intégrer à votre site » avec le bouton « Code d'intégration »](/doc-img/admin-group-links.png)

**2. Diffuser les liens.** Chaque lien a son adresse, de la forme `https://[organisation].benevol.app/[evenement]?groupe=[code]`. **Copier le lien** la copie pour un email ou une messagerie ; **QR code PNG** et **QR code SVG** téléchargent le QR code de ce lien, à imprimer sur l'affiche ou dans le bulletin de la société. Le code est tiré au hasard : on ne devine pas le lien d'une autre société à partir du sien.

**3. Ce que voient les bénévoles.** La page ouverte par le lien n'affiche que les postes de la société, avec une ligne qui le dit, par exemple « Lien « Amicale des pompiers » : seuls ses 3 postes sont affichés. ». Le bouton **Voir tous les postes** montre tout l'événement, et **Revenir aux postes de « Amicale des pompiers »** remet le filtre. Les postes réservés à certains membres gardent leurs règles, quel que soit le lien. Un lien par groupe ne montre jamais qui est inscrit, même à un bénévole confirmé : il est partagé, il n'identifie donc personne (voir [Voir qui est inscrit](choisir-ses-creneaux.md#voir-qui-est-inscrit)).

![Page publique de la fête du village ouverte par le lien de l'Amicale des pompiers : la ligne « Lien « Amicale des pompiers » : seuls ses 3 postes sont affichés. » avec le bouton « Voir tous les postes », puis le planning limité aux postes Montage, Sécurité et Démontage](/doc-img/public-group-link.png)

**4. Suivre les inscriptions par société.** Sous chaque lien, la section affiche les inscriptions qu'il a apportées (« 6 personnes inscrites, 6 créneaux »), avec **Voir ses inscriptions**. Sur la page des inscriptions, le filtre **Par lien de groupe** montre les inscriptions d'un lien, ou celles arrivées **Sans lien de groupe**. Vous voyez ainsi quelle société doit encore mobiliser ses membres. Une inscription compte pour le lien par lequel la page a été ouverte, même si le bénévole a choisi un poste d'un autre groupe après **Voir tous les postes**.

### Modifier ou supprimer un lien

**Modifier** change le nom, les postes ou l'option des créneaux complets ; l'adresse et le QR code restent les mêmes, ceux déjà imprimés continuent de fonctionner. Renommer l'événement ou un poste ne casse pas non plus le lien : un poste renommé reste dans le lien sous son nouveau nom. Un poste supprimé en sort, et le lien continue avec les autres. S'il ne reste aucun de ses postes au planning, le lien affiche tout l'événement, avec une courte phrase qui le dit.

**Supprimer** demande une confirmation. Les inscriptions venues de ce lien sont conservées, mais ne sont plus comptées pour ce groupe. L'adresse et le QR code du lien supprimé ouvrent ensuite tout l'événement, avec la phrase « Ce lien de groupe n'existe plus ». La création, la modification et la suppression d'un lien sont inscrites au [journal de l'événement](journal-de-l-evenement.md).

## Intégrer l'inscription à votre site

Votre association a son propre site ? Affichez-y l'inscription : les bénévoles choisissent leurs créneaux et s'inscrivent sans quitter votre site. La page garde le nom, le logo et la couleur de votre organisation ; seuls le lien « Retour » et les colonnes du pied de page de benevol.app disparaissent. En bas de la page restent les mentions légales, le lien « Propulsé par benevol.app » vers la page d'accueil de benevol.app et le lien vers le code source.

L'événement doit être publié. Dans l'onglet **Partage**, section **Liens par groupe et intégration**, sous **Intégrer à votre site**, cliquez sur **Code d'intégration**.

![Section « Intégrer à votre site » ouverte : le choix « Postes affichés », la case « Ajuster la hauteur automatiquement », le code à coller dans un champ, les boutons « Copier le code » et « Aperçu en direct », puis les trois étapes pour l'ajouter à votre site](/doc-img/admin-embed.png)

- **Postes affichés** : tout l'événement, ou les postes d'un [lien par groupe](#un-lien-par-groupe). Ce choix n'apparaît que si l'événement a des liens par groupe. Les inscriptions venues du site comptent alors pour ce lien.
- **Ajuster la hauteur automatiquement** : sans cette option, le cadre a une hauteur fixe de 900 pixels et la page défile à l'intérieur. Avec elle, le code contient quelques lignes de script qui donnent au cadre la hauteur de la page, sans barre de défilement. Certains éditeurs de site refusent les scripts : laissez alors la case décochée.
- **Copier le code** copie le code affiché. Si votre navigateur refuse la copie, le code est sélectionné : copiez-le.
- **Aperçu en direct** montre la page telle qu'elle apparaîtra dans votre site. C'est la vraie page d'inscription : une inscription faite dans l'aperçu est enregistrée.

**Ajouter le code à votre site.** Dans l'éditeur de votre site, ouvrez la page voulue et ajoutez un bloc de type « HTML », « Code personnalisé » ou « Intégrer » (le nom change d'un éditeur à l'autre). Collez-y le code, puis enregistrez et publiez la page. Le code ne charge aucun script d'un autre site : seulement la page d'inscription de benevol.app dans un cadre.

**Ce que voient les bénévoles.** Le même parcours que sur la page de l'événement : choix des créneaux, formulaire, récapitulatif, confirmation. Ce qui quitte l'inscription s'ouvre dans un nouvel onglet, pour que votre page reste en place : la page personnelle, les pages de l'événement, les mentions légales, la page d'accueil de benevol.app, le code source. La confirmation rappelle que l'email contient le lien personnel, pour modifier ou annuler. Les rappels par notification se proposent depuis la page personnelle, pas dans le cadre. L'inscription affichée sur votre site ne montre jamais qui est inscrit : l'interrupteur **Voir qui est inscrit** n'existe que sur la page de l'événement, pour les bénévoles confirmés et les membres invités.

Certains navigateurs ne laissent pas une page affichée dans le site d'un autre retenir quoi que ce soit sur l'appareil. Le bénévole doit alors retaper ses coordonnées pour un autre événement, et la page ne le reconnaît pas en revenant : son lien personnel reste dans l'email.

Le cadre affiche uniquement la page d'inscription : la page personnelle, l'espace organisateur et les autres pages de benevol.app refusent de s'afficher dans un autre site.
