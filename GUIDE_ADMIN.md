# Guide administrateur

Bienvenue ! Ce guide couvre tout ce qu'il faut pour faire tourner un événement de A à Z : créer l'événement, poser les créneaux, inviter les membres de votre pool, suivre les inscriptions en direct, et les fonctionnalités qui font gagner du temps le jour J — pages personnalisées, responsables de secteur, jalons, journaux d'activité.

Rien de sorcier : chaque section ci-dessous correspond à un écran de l'admin, dans l'ordre où vous les rencontrerez en montant un événement. Une question sans réponse ici ? La FAQ tout en bas couvre les cas un peu moins courants.

---

## Se connecter

Accéder à `/admin/login` et saisir les identifiants administrateur.

Si vous avez reçu un **lien d'invitation** (email « Invitation à rejoindre… »), cliquez sur le bouton « Créer mon compte » dans l'email pour définir votre mot de passe avant votre première connexion.

**Mot de passe oublié ?** Depuis la page de connexion, utilisez le lien de réinitialisation (`/admin/forgot-password`) : un email contenant un lien de réinitialisation vous est envoyé.

Sur un téléphone ou un petit écran, les liens de la barre du haut (Tableau de bord, Événements, Membres, Paramètres, Aide) sont regroupés sous le bouton **Menu**.

**Mon compte et déconnexion** : cliquez sur votre nom, en haut à droite de chaque page. Le menu propose **Mon compte** (`/admin/account`), où vous pouvez changer votre mot de passe, et **Se déconnecter**. Changer votre mot de passe, ou le réinitialiser via « mot de passe oublié », déconnecte toutes vos autres sessions (autres navigateurs ou appareils) ; vous restez connecté(e) là où vous l'avez changé.

**Connexion refusée après plusieurs essais ?** Après 10 mots de passe erronés sur un même compte (ou 30 depuis une même adresse IP) en 15 minutes, les tentatives suivantes sont refusées jusqu'à la fin de ce délai, même avec le bon mot de passe. Patientez un quart d'heure avant de réessayer.

---

## Premiers pas

Tant que votre organisation n'a pas terminé sa mise en place, une liste **Premiers pas** s'affiche en haut de la liste des événements et du tableau de bord. Elle indique dans quel ordre procéder, avec un lien vers chaque étape :

1. personnaliser la page publique et la charte (facultatif, des valeurs par défaut existent) ;
2. vérifier le fuseau horaire (facultatif, Europe/Zurich par défaut) ;
3. créer votre premier événement ;
4. définir les postes et les créneaux ;
5. publier l'événement ;
6. faire une inscription de test depuis la page publique, pour vérifier le parcours et l'email reçu ; vous pourrez l'annuler ensuite.

Les étapes se cochent d'elles-mêmes au fur et à mesure. La liste disparaît quand les étapes obligatoires sont faites ; **Masquer ces étapes** la retire plus tôt, pour tous les admins de l'organisation.

---

## Tableau de bord

**`/admin/dashboard`**

En haut, **Ce qui demande votre attention** liste, du plus urgent au moins urgent, les situations de vos événements publiés sur lesquelles agir, chacune avec un lien vers l'endroit où la régler :

- créneaux des 7 prochains jours pas encore complets (urgent à moins de 2 jours) ;
- places proposées en liste d'attente qui expirent dans les 12 heures sans réponse ;
- jalons en retard ;
- invitations envoyées il y a plus de 3 jours et pas encore utilisées ;
- postes sans responsable de secteur, quand l'événement en a déjà d'autres ;
- événement qui commence dans la semaine ;
- événement terminé mais toujours publié, à archiver.

Quand rien ne demande votre attention, la section le dit.

Vue d'ensemble de votre organisation : nombre d'événements (publiés et à venir), bénévoles inscrits, taux de remplissage global (places occupées sur places disponibles) et répartition des membres (total, avec email, sans email : ces derniers ne peuvent pas recevoir d'invitations).

---

## Rechercher

**`/admin/search`**

Le champ **Rechercher** de la barre du haut (dans le **Menu** sur un petit écran) retrouve en une fois, dans toute votre organisation :

- les **bénévoles** dont le prénom, le nom, l'email ou le téléphone correspond : le lien ouvre la page Membres filtrée sur cette personne, membres désactivés compris ;
- leurs **inscriptions** (confirmées, en liste d'attente ou place proposée), avec l'événement et le créneau : le lien ouvre les inscriptions de l'événement filtrées sur cette personne ;
- les **événements** dont le titre ou le lieu correspond ;
- les **créneaux** dont le poste ou l'intitulé correspond : le lien ouvre les inscriptions de ce créneau.

Tous les mots doivent correspondre : « alice martin » trouve Alice Martin, « fête bar » les créneaux du poste Bar de l'événement « Fête d'été ». Ni les majuscules ni les accents ne comptent : « zoe » trouve Zoé, dans la recherche globale comme dans les filtres des pages Membres et Inscriptions. Chaque groupe affiche les 20 premiers résultats ; au-delà, précisez la recherche.

Raccourci : **Ctrl + K** (**⌘ + K** sur Mac) place le curseur dans le champ de recherche depuis n'importe quelle page de l'admin.

Au clavier, la première pression sur **Tab** en haut d'une page fait apparaître un lien **Aller au contenu**, qui saute la barre du haut.

---

## Créer un événement

**`/admin/events/new`**

La création se fait en trois étapes, indiquées en haut de page : **1. Informations**, **2. Postes et créneaux**, **3. Vérification et publication**. Après l'étape 1, vous arrivez sur les créneaux avec un bouton **Continuer** ; l'étape 3 (`/admin/events/[id]/review`) récapitule ce qui est prêt et ce qui manque (dates, créneaux, lieu, message de confirmation, instructions, responsables), propose l'aperçu bénévole, puis **Publier** ou **Rester en brouillon**. On peut publier sans les points facultatifs, mais pas sans créneau : cette règle vaut partout (page de l'événement, formulaire d'édition), pas seulement dans l'assistant, et un événement est toujours créé en brouillon. Dans l'autre sens, si le dernier créneau d'un événement publié est annulé (ou son dernier poste supprimé), l'événement repasse en brouillon, avec une entrée dans le journal. **Quitter l'assistant** ramène à tout moment à la page de l'événement : rien n'est perdu, chaque étape est une page normale de l'administration.

### Partir d'un modèle

En haut de la page, **Comment commencer ?** propose une page blanche ou un modèle : festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage. Un modèle n'est qu'un événement déjà rempli : choisissez-le, donnez un titre et la date du premier jour, et le brouillon est créé avec ses postes et ses créneaux (la liste de ce qui sera créé est affichée avant). Vous arrivez sur ses créneaux : horaires, effectifs et postes sont des points de départ, chacun se modifie ou se supprime comme d'habitude. Rien n'est publié.

### Page blanche

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement |
| Slug | Identifiant URL (`festival-2025`) — généré automatiquement, modifiable |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Coordonnées GPS ou lien de carte | Collez un lien OpenStreetMap ou Google Maps, ou une paire « latitude, longitude » : les bénévoles ont alors un lien **Voir sur la carte** (OpenStreetMap, aucune requête vers un service tiers tant qu'ils ne cliquent pas) sur la page d'inscription, dans les emails et sur leur page personnelle. Un créneau peut avoir ses propres coordonnées dans ses infos pratiques ; sinon celles de l'événement sont utilisées |
| Description | Texte libre (usage interne) |
| Instructions publiques | Message visible en haut de la page d'inscription |
| Téléphone obligatoire à l'inscription | Si coché, le formulaire public exige un numéro de téléphone (désactivé par défaut). Ne s'applique pas aux bénévoles que vous ajoutez vous-même depuis l'administration. Le numéro saisi est enregistré avec l'inscription : c'est lui qui s'affiche dans la liste des inscriptions, l'export PDF et la page du responsable de secteur (à défaut, celui de la fiche du membre) |
| Message de confirmation | Texte affiché sur la page de succès après inscription |
| Couleur de la page publique | Une couleur de la palette (la même que celle des postes) derrière le titre de la page d'inscription, avec un aperçu dans le formulaire. Le texte reste blanc sur un fond foncé, donc lisible ; sans couleur, l'en-tête reste blanc. La couleur est copiée avec les réglages lors d'une duplication |

L'événement est créé en **brouillon** (`draft`) — il n'est pas visible du public tant qu'il n'est pas publié.

**Repartir d'un événement existant** (édition suivante d'un festival, même organisation d'une année sur l'autre) : **Dupliquer**, depuis la liste des événements ou la page de l'événement, ouvre une page de choix :

- le **titre** de la copie (« (copie) » par défaut) ;
- le **premier jour** de la copie : toutes les dates (fin, créneaux, spectacles) sont décalées du même nombre de jours ;
- ce qui suit : les **créneaux** (postes, horaires, places, listes d'attente, âge minimum, infos pratiques, rouverts et sans inscriptions), les **messages et réglages d'inscription**, les **pages personnalisées**, et, décochés par défaut, les **responsables de secteur** (chacun reçoit alors un email avec son lien pour la copie).

Un récapitulatif dit ce qui va être créé avant de confirmer. La copie est un brouillon ; les inscriptions et les jalons ne sont jamais copiés.

Une fois créé, chaque événement a sa propre page de pilotage : statistiques en un coup d'œil, raccourcis vers les créneaux et les inscriptions, jalons, journal. C'est votre poste de commande pour toute la durée de l'événement.

![Page de pilotage d'un événement : statistiques (créneaux, places, inscrits, restants), raccourcis vers les créneaux et les inscriptions, et jalons](/doc-img/admin-event-overview.png)

---

## Configurer les créneaux

**`/admin/events/[id]/shifts`**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

![Timeline des créneaux d'un événement, avec les postes en lignes et les créneaux en barres colorées par jour](/doc-img/admin-shifts.png)

### Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. |
| Libellé | Intitulé spécifique (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin, de `00:00` à `23:59` |
| Capacité | Nombre maximum de bénévoles |
| Statut | `Ouvert`, `Complet`, `Fermé`, `Annulé` |
| Infos pratiques pour les bénévoles | Lieu de rendez-vous et consigne pratique, visibles sur la page publique d'inscription et dans les emails ; personne de contact (nom, téléphone), envoyée seulement aux inscrits (email de confirmation, rappels, page personnelle), jamais affichée publiquement. Facultatifs, courts : pas de fiche de mission. |
| Notes internes | Jamais montrées aux bénévoles |
| Âge minimum (optionnel) | Condition d'âge pour ce poste (ex. : `18` pour un poste avec permis de conduire). Affiché en info sur le planning public ; vérifié à l'inscription — voir « Âge minimum sur un poste » ci-dessous. |

### Créer une série de créneaux

Pour couvrir une plage horaire avec des créneaux qui se suivent (une buvette de 10 h à 22 h par créneaux de deux heures, trois personnes à chaque fois), cliquez sur **Créer une série** au lieu de saisir chaque créneau.

| Champ | Description |
|-------|-------------|
| Poste, libellé | Comme pour un créneau seul |
| Date, début, fin | La plage à couvrir ; une fin plus petite que le début passe minuit |
| Durée d'un créneau | Choix courant (30 min à 4 h) ou saisie en minutes (15 au minimum) |
| Pause entre deux créneaux | Facultative, en minutes |
| Personnes par créneau, liste d'attente | Appliqués à chaque créneau |

L'aperçu se met à jour au fur et à mesure : nombre de créneaux, horaires de chacun. Si la plage ne se divise pas exactement, le dernier créneau est plus court (indiqué dans l'aperçu) ; supprimez-le ensuite s'il ne sert pas. Les créneaux qui commencent après minuit sont datés du lendemain. Une série compte au plus 48 créneaux.

Une fois créés, ce sont des créneaux ordinaires : chacun se modifie ou se supprime séparément.

#### Horaires et nuit

L'horloge va de `00:00` à `23:59` : on ne saisit jamais `24:00`, `25:00` ou `26:00`, l'horloge repart à zéro après minuit.

- **Créneau qui passe minuit** : saisissez une heure de fin plus petite que le début, par exemple `22:00` à `02:00`. Il est affiché « 22h–02h +1 » sur le planning.
- **Créneau qui commence après minuit** : il appartient au jour suivant. Créez-le à la date du lendemain, à `00:00`, `01:00`, etc.
- Un créneau qui se termine exactement à minuit s'écrit avec `00:00` comme fin (`22:00` à `00:00`).
- Les heures invalides (`26:00`, `-2:30`, `12:75`) sont refusées avec un message. Sur le planning administrateur, glisser une barre ne permet pas de sortir de la journée.

### Modifier vite depuis le planning

Un clic sur une barre du planning ouvre une petite fenêtre pour agir sans quitter la vue :

- **Libellé** et **Places** : enregistrés à la fermeture ; **Appliquer à tout le poste** met le même nombre de places sur tous les créneaux du poste (jamais en dessous des inscrits déjà confirmés sur un créneau) ;
- **Horaires** : changez le début ou la fin puis **Décaler** ; les bénévoles inscrits reçoivent un email si les horaires changent ;
- **Inscriptions** : ouvertes, fermées (le créneau reste visible, personne ne peut plus s'y inscrire), complet, ou créneau annulé ;
- **Dupliquer** : crée une copie juste après, de même durée, avec tous les réglages du créneau (places, liste d'attente, âge minimum, infos pratiques) et sans inscriptions ; déplacez-la ensuite si besoin ;
- **Inscriptions** (lien) et **Supprimer le créneau**.

### Activer la liste d'attente

Cochez **Activer la liste d'attente** dans le formulaire du créneau (ou dans le popover de la timeline admin). Quand le créneau est complet, les bénévoles peuvent s'y inscrire ; une place libérée déclenche automatiquement l'envoi d'un email à la première personne en attente, avec un lien de confirmation valable **24 heures**. Passé ce délai sans réponse, la place est proposée à la personne suivante.

La vue des inscriptions (`/admin/events/[id]/registrations`) affiche les bénévoles en attente (`En attente`) et ceux à qui une place a été proposée (`Offerte`).

### Gérer les postes

Le bouton **Gérer les postes** ouvre un panneau qui regroupe trois actions, poste par poste :

- **Réordonner** : glissez-déposez une ligne. L'ordre défini ici s'applique à la timeline admin **et** à la page publique.
- **Renommer** : clique sur « Renommer », tape le nouveau nom, valide. Tous les créneaux de ce poste sont renommés d'un coup — impossible de renommer vers un nom déjà utilisé par un autre poste (pour ne pas fusionner deux postes par erreur).
- **Supprimer** : annule tous les créneaux de ce poste (comme une suppression de créneau individuelle) — une confirmation indique le nombre de créneaux et de bénévoles concernés ; ces derniers sont prévenus par email.
- **Couleur** : le point coloré à gauche du nom ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique » pour revenir à la couleur assignée par défaut). S'applique à la timeline admin et à la page publique.

### Âge minimum sur un poste

Un poste peut exiger un âge minimum (majorité, permis de conduire, qualification…). Une fois renseigné dans le formulaire du créneau, il est affiché en petit sur le planning public (ex. « 18+ »). Le créneau reste sélectionnable — l'âge du bénévole n'est pas connu avant qu'il remplisse le formulaire — mais l'inscription lui demande alors sa date de naissance et est refusée si la condition n'est pas remplie. L'âge pris en compte est celui qu'aura le bénévole le jour du créneau, pas le jour de l'inscription.

---

## Configurer le programme des spectacles

Dans la page d'édition de l'événement (**`/admin/events/[id]/edit`**), section **Programme des spectacles**.

Chaque entrée définit une plage horaire qui apparaît en fond coloré sur la timeline, permettant aux bénévoles de visualiser quand ils travaillent par rapport aux spectacles.

Champs : **Nom du spectacle**, **Date**, **Heure de début**, **Heure de fin**.

---

## Pages personnalisées de l'événement

**`/admin/events/[id]/pages`**

En complément du champ unique « instructions publiques », ajoutez autant de pages libres que nécessaire à un événement : règlement, FAQ, accès et lieu, ce qu'il faut apporter…

- **Ajouter** une page : titre + contenu rédigé en Markdown (gras, listes, titres, liens, tableaux)
- L'adresse de la page (slug) est générée automatiquement depuis le titre
- **Réordonner** les pages avec les boutons monter/descendre
- **Supprimer** une page (confirmation demandée)

Les pages apparaissent sous forme de liens juste après les instructions publiques, sur la page de l'événement.

![Liste des pages personnalisées d'un événement, avec titre, adresse et actions modifier / supprimer](/doc-img/admin-pages.png)

---

## Responsables de secteur

**`/admin/events/[id]/sector-leaders`**

Désignez un ou plusieurs bénévoles responsables d'un poste (ex. « Bar »). Chacun reçoit un lien personnel — sans compte à créer — qui affiche en lecture seule la liste des bénévoles inscrits sur ce poste (nom, email, téléphone).

![Liste des responsables de secteur d'un événement, avec le poste, le nom et l'action retirer](/doc-img/admin-sector-leaders.png)

- **Ajouter** un·e responsable : poste (autocomplété depuis les postes existants), nom, email — ou **Depuis les inscrits** pour choisir directement un bénévole déjà inscrit à l'événement, qui pré-remplit ces champs
- Depuis la page des inscriptions, sélectionner une seule ligne puis **Rendre responsable** propose directement le poste de ce créneau

  ![Modal « Rendre Julie Moreau responsable » ouvert depuis la page des inscriptions, avec le poste et l'email pré-remplis](/doc-img/admin-make-leader-modal.png)
- Un email est automatiquement envoyé au responsable avec son lien personnel ; il est aussi prévenu à chaque nouvelle inscription sur son poste
- **Retirer** un·e responsable à tout moment (confirmation demandée)
- La fiche du bénévole concerné (`/admin/members`) reçoit automatiquement le tag « responsable »

---

## Jalons de l'événement

Section **Jalons** sur la page de l'événement (`/admin/events/[id]`).

Une checklist simple de dates clés pour l'événement (ex. « Fermer les inscriptions », « Envoyer les rappels ») : titre, échéance, coché ou non. Purement informatif — cocher un jalon ne déclenche aucune action automatique. Un jalon dépassé et non coché est mis en évidence.

---

## Publier un événement

### Brouillon, publié, répertorié, archivé

| État | Page d'inscription | Sur la page publique de l'organisation |
|---|---|---|
| Brouillon | inaccessible (sauf l'aperçu admin) | non |
| Publié, répertorié | accessible par son lien | oui, avec la liste publique et le sitemap |
| Publié, **non répertorié** | accessible par son lien | non : absent de la page d'accueil, de la liste publique et du sitemap, et non indexé par les moteurs de recherche |
| Archivé | inaccessible | non |

**Où en est l'événement ?** En haut de sa page, une barre d'étapes le situe : **Brouillon → Prêt à publier → Publié → Terminé → Archivé**. « Prêt à publier » est un brouillon qui a au moins un créneau ; « Terminé » un événement publié dont le dernier jour est passé. Sous la barre, **À faire** dit ce qui manque encore (par exemple « aucun créneau ») et **Concrètement** ce que l'étape signifie : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.

**Non répertorié** sert à séparer des publics : par exemple un planning réservé aux organisateurs, avec les mêmes postes que celui des bénévoles, que l'on ne veut pas voir sur la page d'accueil. Dans le formulaire d'édition, décochez **Afficher cet événement sur la page publique de l'organisation**, puis partagez le lien ou le QR code aux personnes concernées. L'administration affiche alors « Publié — non répertorié ».

Ce n'est pas une protection : toute personne qui a le lien, ou qui le devine, peut ouvrir l'événement et s'y inscrire. Pour un accès vraiment restreint, il n'existe pas encore de mot de passe. Une copie ou un événement créé depuis un modèle est toujours répertorié : le choix se refait pour chaque événement.

**Avant de publier**, le bouton **Prévisualiser comme un bénévole** de la page de l'événement montre la page publique exactement comme la verront les bénévoles, même tant que l'événement est en brouillon : planning et places, pages personnalisées, charte, champs demandés dans le formulaire (téléphone si vous l'avez rendu obligatoire, date de naissance pour un créneau avec âge minimum). Vous pouvez remplir le formulaire : au lieu de vous inscrire, l'aperçu affiche le message de confirmation et l'email que recevrait le bénévole. Rien n'est enregistré ni envoyé. Pour voir le rendu sur téléphone, réduisez la largeur de la fenêtre ou ouvrez l'aperçu depuis votre téléphone.

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**.

L'événement devient alors visible à l'URL :

```
https://[slug-organisation].benevol.app/[slug-evenement]
```

Le slug de l'organisation est un sous-domaine, pas un chemin — chaque organisation a sa propre adresse.

Le lien **Vue publique ↗** apparaît sur la page admin dès que l'événement est publié.

### Ouvrir et fermer les inscriptions

Publier rend le planning visible. Les inscriptions, elles, se règlent à part, dans la section **Inscriptions** du formulaire d'édition :

- **Inscriptions ouvertes** : décochez pour fermer les inscriptions tout en laissant le planning consultable. La page publique affiche « Les inscriptions sont fermées pour le moment » et ne permet plus de choisir de créneau.
- **Ouverture programmée** (facultatif) : avant cette date et heure, la page annonce « Les inscriptions ouvrent le… » et refuse les inscriptions.
- **Fermeture programmée** (facultatif) : à partir de cette date et heure, les inscriptions sont terminées. Tant qu'elles sont ouvertes, la page publique indique jusqu'à quand.

Les heures sont celles du fuseau de l'organisation. La case décochée l'emporte sur les dates. Une fois les inscriptions fermées, la liste d'attente ne propose plus de place ; une place déjà proposée reste confirmable pendant son délai. Les bénévoles déjà inscrits gardent leur lien personnel pour consulter, modifier ou annuler.

Une copie d'événement ou un événement créé depuis un modèle démarre avec les inscriptions fermées : ouvrez-les quand le planning est prêt.

---

## Archiver et supprimer un événement

### Archiver

Depuis la page de l'événement, cliquer sur **Archiver** puis **Confirmer**. L'événement n'est plus visible du public ; il reste consultable dans la liste avec le statut **Archivé**. Le bouton **Publier** permet de le remettre en ligne.

### Supprimer définitivement

Seul un événement archivé peut être supprimé. En bas de sa page, section **Suppression définitive**, cliquer sur **Supprimer l'événement…**. La fenêtre de confirmation indique ce qui sera effacé : créneaux, inscriptions (listes d'attente comprises) et invitations. Les membres du pool et l'organisation sont conservés.

- **Sauvegarder avant de supprimer** : le lien **Ouvrir l'export PDF** ouvre le planning, le récapitulatif par poste et la liste des bénévoles ; enregistrez-le depuis la fenêtre d'impression du navigateur. L'application ne conserve aucun export.
- **Les bénévoles ne sont pas prévenus** : leur lien de gestion d'inscription cesse de fonctionner. Pour les prévenir, annulez d'abord les créneaux depuis la page des créneaux : chaque bénévole reçoit un email.
- **Confirmation** : saisir le titre de l'événement (les accents et les majuscules ne comptent pas) pour activer le bouton **Supprimer définitivement**. Cette action est irréversible.

---

## Suivre les inscriptions

**`/admin/events/[id]/registrations`**

Vue tabulaire de toutes les inscriptions actives : nom, email, téléphone, créneau, commentaire, source, date.

![Tableau des inscriptions d'un événement, avec bénévole, créneau, source et actions rendre responsable / annuler](/doc-img/admin-registrations.png)

Aucune action directement sur une ligne : cocher une ou plusieurs inscriptions (case d'en-tête pour tout sélectionner d'un coup) fait apparaître une barre d'outils avec trois actions, appliquées à toute la sélection — même une inscription masquée entre-temps par un filtre ou une recherche :

- **Rendre responsable** de leur poste. Avec une seule ligne sélectionnée, une modale s'ouvre pour choisir le poste (si le bénévole a plusieurs inscriptions) et ajuster nom/email avant l'envoi. Avec plusieurs lignes, chaque bénévole est directement rattaché au poste de son propre créneau, sans étape intermédiaire.
- **Renvoyer le lien** : réenvoie par email le lien personnel de gestion (`/my/[token]`) de chaque bénévole sélectionné — utile s'il l'a perdu ou supprimé par erreur. Le lien renvoyé donne accès à toutes les inscriptions actives du bénévole pour cet événement, pas seulement au créneau de la ligne.
- **Retirer de leur créneau** : annule chaque inscription sélectionnée. Les lignes quittent la liste tout de suite, mais rien n'est enregistré ni envoyé pendant 10 secondes : **Annuler le retrait** les remet en place (aucun email ne part), **Retirer maintenant** n'attend pas. Le compte à rebours s'arrête tant que le curseur ou le focus clavier est sur cette barre. Quitter la page valide le retrait ; confirmer un second retrait pendant l'attente le regroupe avec le premier et relance les 10 secondes.

Chacune de ces actions demande d'abord une confirmation qui récapitule ce qui va se passer : personnes concernées, emails envoyés, places proposées à la liste d'attente, et le fait que l'action est journalisée. Une fois l'action faite, **Voir dans le journal** ouvre le journal de l'événement à la date du jour pour la retrouver (lien « Voir cette action dans le journal »).

Un badge **Responsable** s'affiche sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.

### Présences le jour J

Pour savoir qui est venu, sans terminal ni badge : sélectionnez les lignes des personnes arrivées et cliquez **Marquer présents**. Un badge **Présent** apparaît sur la ligne, le compteur « N présents sur M inscrits » se met à jour, et l'action est notée dans le journal. **Annuler la présence** retire la marque (sélection de lignes déjà marquées). Seules les inscriptions confirmées peuvent être marquées.

**Exporter les présences (CSV)**, en haut de la page, télécharge la feuille de présence : une ligne par inscription confirmée avec prénom, nom, email, téléphone, poste, créneau, date, horaires, présent oui/non et l'heure du pointage (fuseau de l'organisation). Elle s'ouvre directement dans Excel ou LibreOffice.

Depuis la page principale de l'événement (`/admin/events/[id]`) :
- 4 chiffres en un coup d'œil en haut de page : créneaux, places totales, inscrits, places restantes
- **Où manque-t-il du monde ?** : une phrase (« Il manque encore 12 personnes sur 20 places ») et un lien vers la vue détaillée décrite ci-dessous

### Où manque-t-il du monde ?

**`/admin/events/[id]/staffing`**

La question que se pose l'organisateur avant l'événement, en une page, du plus urgent au moins urgent :

- **Postes sans personne** : aucun inscrit sur aucun créneau du poste ;
- **Créneaux à compléter** : chaque créneau avec des places libres, du plus dégarni au plus proche du complet, avec le nombre de personnes qui manquent (les créneaux fermés aux inscriptions ne sont pas comptés) ;
- **Personnes en liste d'attente** : créneaux complets où des bénévoles attendent une place, à qui proposer une place de plus ou un autre créneau ;
- **Postes sans responsable de secteur** (facultatif si vous n'utilisez pas les responsables) ;
- **Créneaux complets**, pour mémoire.

Chaque ligne mène là où on agit : les inscriptions filtrées sur le créneau, les créneaux du poste, ou les responsables de secteur.

---

## Journal de l'événement

**`/admin/events/[id]/log`**

L'historique complet de ce qui s'est passé sur un événement : créneaux créés/modifiés, inscriptions, annulations, pages ajoutées, responsables désignés, jalons… Trois modes :

- **Explorer** : liste filtrable par type, action, personne ou période
- **Rejouer** : reconstitue l'état d'un créneau ou d'une inscription à un instant donné
- **Récit** : raconte en une phrase la suite des événements liés (ex. une annulation qui déclenche une offre de liste d'attente)

Le contenu des pages personnalisées et les coordonnées des bénévoles n'apparaissent jamais dans le journal — seuls les champs modifiés sont indiqués.

**Générer l'état initial** : le journal ne trace que ce qui s'est passé depuis sa mise en place. Pour un événement plus ancien, ce bouton (au-dessus des onglets) ajoute une entrée de départ pour chaque créneau et chaque inscription déjà existants, afin de ne pas laisser le journal vide. Ces entrées sont affichées en gris avec la mention « Généré, pas une action réelle ». Relancer la génération ne crée pas de doublon ; une fois faite, le bouton n'est plus proposé sur ce navigateur.

---

## Gérer les membres

**`/admin/members`**

Le répertoire des membres est le pool de bénévoles connus de votre organisation.

- **Ajouter** un membre : prénom, nom, email, téléphone, tags, notes internes, et ses **disponibilités** en général (matin, après-midi, soir, plus une remarque comme « pas le dimanche »), facultatives. Le bénévole peut les renseigner lui-même depuis sa page personnelle. Elles s'affichent dans la liste des membres et sous chaque nom dans les inscriptions, et quand vous ajoutez quelqu'un à la main dès que son email correspond à une personne déjà inscrite à l'événement. C'est une information pour vous : rien n'est filtré ni attribué automatiquement.
- **Modifier** ou désactiver un membre existant
- **Importer** des membres en masse : bouton **Importer CSV/Excel** (fichiers `.csv` ou `.xlsx`). Les colonnes sont reconnues par leur intitulé (prénom, nom, email, téléphone, tags ; par exemple `prenom`, `courriel`, `mobile`, `groupes`). Plusieurs tags dans une cellule se séparent par `,`, `;` ou `|`. Le résultat indique le nombre de membres créés, mis à jour et ignorés ; les lignes en erreur sont listées avec leur numéro (50 au maximum affichées).
- **Rechercher** par texte libre (prénom, nom, email, téléphone) ou filtrer par tag
- **Trier** par prénom, nom ou heures cumulées : cliquer sur l'en-tête de colonne (croissant → décroissant → reset)
- **Heures cumulées** : total du temps passé sur des créneaux actifs, tous événements confondus — utile pour identifier vos bénévoles les plus investis. Cette colonne n'apparaît que dans cette page ; elle n'est jamais incluse dans l'export PDF, potentiellement partagé avec les bénévoles.

---

## Inviter des membres à un événement

**`/admin/events/[id]/invitations`**

Les invitations permettent d'envoyer des emails personnalisés aux membres de votre liste, avec un lien pré-rempli vers la page d'inscription.

### Envoyer des invitations

1. Cliquer sur **+ Inviter des membres**
2. Sélectionner les membres par nom ou par tag
3. Optionnel : ajouter un message personnalisé (visible dans l'email)
4. Cliquer sur **Envoyer N invitation(s)**

Chaque membre reçoit un email avec un lien unique qui pré-remplit son prénom, nom, email et téléphone sur la page d'inscription.

### Suivre l'état des invitations

Le tableau affiche pour chaque membre invité :
- **✓ Participation confirmée**
- **Sans réponse**

Les compteurs en haut récapitulent : invités · inscrits · sans réponse.

### Relancer les non-inscrits

Le bouton **Relancer les N sans réponse** (visible s'il reste au moins un membre sans réponse) envoie un rappel à tous les membres invités qui ne se sont pas encore inscrits — sans message personnalisé, contrairement à l'invitation initiale.

---

## Communications bénévoles

### Écrire aux bénévoles

**`/admin/events/[id]/message`**, depuis la page de l'événement (**Écrire aux bénévoles**) ou depuis les inscriptions (le bouton reprend le poste ou le créneau filtré).

Un email simple, à qui c'est utile :

- **tous les bénévoles inscrits** de l'événement ;
- **les bénévoles d'un poste** ;
- **les bénévoles d'un créneau** ;
- **les personnes en liste d'attente** (en attente ou à qui une place est proposée).

Vous saisissez un objet et un message texte (les retours à la ligne sont conservés). Le nombre de destinataires s'affiche dès le choix ; **Voir l'aperçu et envoyer** montre l'email tel qu'il sera reçu, puis demande une confirmation avec le nombre de personnes. Chaque personne reçoit un seul email, avec ses créneaux concernés et le lien vers ses inscriptions ; l'envoi est noté dans le journal de l'événement. Pas d'éditeur HTML, de segments enregistrés ni de programmation : pour relancer les membres invités sans réponse, voir « Relancer les non-inscrits » dans les invitations.

### Rappel manuel

Depuis la page de l'événement, le bouton **Envoyer le rappel** permet d'envoyer un email de rappel à **tous les bénévoles inscrits** de l'événement.

Avant d'envoyer, rédiger un message dans la section « Message de rappel » (page d'édition de l'événement, `/admin/events/[id]/edit`). Ce message apparaîtra dans l'email, avec le récapitulatif des créneaux de chaque bénévole.

### Rappels automatiques

L'application envoie automatiquement des rappels :
- **J-2** (48 h avant le shift) : rappel avec détails du créneau
- **J-1** (24 h avant) : rappel court
- **Jour J** (2–4 h avant) : rappel de dernière minute

Ces rappels sont envoyés sans intervention de votre part, tant que `remindersEnabled` est actif sur l'événement.

### Notifications de modification

- **Annulation d'un créneau** → les bénévoles inscrits sont avertis automatiquement et leur inscription est annulée
- **Modification des horaires** → email envoyé aux bénévoles inscrits (peut être désactivé lors de la modification)

---

## Exports

### Rapports

**`/admin/events/[id]/print`**, depuis la page de l'événement (**Rapports**). Des documents à imprimer ou enregistrer en PDF depuis le navigateur, chacun ouvert dans un nouvel onglet :

| Document | Contenu | Pour qui |
|---|---|---|
| Export complet | le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles (en couleur) | l'équipe d'organisation |
| Planning par jour | pour chaque jour, la frise des postes avec les prénoms dans les créneaux, puis le détail avec les places libres | affichage, bénévoles |
| Planning par poste | une page par poste : sa frise, ses créneaux, ses bénévoles, son responsable de secteur | chaque responsable |
| Planning individuel | une page par bénévole : sa journée en frise, puis chaque créneau avec lieu de rendez-vous, contact et consignes | à remettre à l'arrivée |
| Feuille de présence | par créneau, une case à cocher par bénévole (déjà cochée si la présence a été marquée dans l'application), heure d'arrivée, remarque, et des lignes vides pour les arrivées imprévues | organisateurs |
| Liste avec téléphones | tous les bénévoles par ordre alphabétique, téléphone, email et créneaux | organisateurs seulement |

Sauf l'export complet, ces documents sont conçus pour le noir et blanc. Les heures cumulées des membres n'y figurent jamais ; les documents avec téléphones portent la mention « ne pas afficher ni distribuer ».

---

### Badges

Depuis **Rapports**, la section **Badges** imprime un badge d'identification par bénévole inscrit : prénom en grand, nom (optionnel), poste(s) et créneaux (optionnels), avec un bandeau à la couleur du poste (à défaut celle de l'événement, ou noir et blanc). Dix badges par feuille A4, à découper sur les pointillés. Filtre par poste, et liste « Un seul bénévole » pour réimprimer un badge perdu (deux homonymes y sont distingués par leur email). Pas de photo ni de code QR : un badge peut être photographié ou perdu, il ne porte donc aucun lien vers les données du bénévole.

## QR code

Depuis la page de l'événement → **QR code**, télécharger le QR code de la page publique de l'événement (formats PNG ou SVG). Pratique pour l'affichage en salle ou sur une affiche.

---

## Gérer l'équipe admin

**`/admin/settings/admins`**

- **Liste** des administrateurs de votre organisation (actifs et invitations en attente)
- **Inviter** un nouvel admin : saisir son nom et email → un email d'invitation avec lien d'activation est envoyé (lien valable 7 jours)
- **Retrait** d'un admin (impossible de se retirer soi-même ou de retirer le dernier admin actif)

---

## Emails

### Réglages des emails

**Paramètres → Emails** (`/admin/settings/notifications`) commence par les réglages de l'organisation :

- **Rappels automatiques** : cochez ou décochez le rappel J-2, le rappel J-1 et le rappel du jour pour toute l'organisation. Un événement peut en plus couper tous ses rappels dans ses propres réglages.
- **Prévenir les administrateurs à chaque inscription** : l'email envoyé à chaque administrateur actif quand un bénévole s'inscrit depuis la page publique.
- **Adresse de réponse** : quand un bénévole répond à un email de l'application, sa réponse arrive à cette adresse (vide : l'adresse par défaut de la plateforme). Elle figure aussi sur la page personnelle des bénévoles (« Écrire à l'organisation »).
- **M'envoyer un email de test** : un email à votre propre adresse, avec les réglages enregistrés, pour vérifier l'expéditeur, l'adresse de réponse et le rendu (cinq par heure au plus).

Les textes personnalisables restent par événement : instructions publiques, message de confirmation et message de rappel dans les réglages de l'événement.

### Emails envoyés

La même page liste les emails de l'organisation des plus récents aux plus anciens : date, type (confirmation, rappel, message aux bénévoles…), destinataire et état :

- **En attente d'envoi** : mis en file, part dans la minute ;
- **Nouvel essai prévu** : le premier envoi a échoué, l'application réessaie toute seule (jusqu'à six fois, à intervalles croissants), la raison du dernier échec est affichée ;
- **Envoyé** : parti, avec l'heure ;
- **Échec définitif** : six échecs ; la raison est affichée et le bouton **Renvoyer** remet l'email en file.

Les emails envoyés sont effacés chaque nuit (ils contiennent des données personnelles) ; ceux en échec restent 30 jours. Les 200 plus récents sont affichés.

## Exporter et conserver ses données

Vos données vous appartiennent et sortent de l'application à tout moment, sans demande :

| Export | Où | Format |
|---|---|---|
| Un événement complet (réglages, créneaux, inscriptions avec les bénévoles, pages, responsables, jalons, journal) | page de l'événement → **Rapports** → **Archive de l'événement (JSON)** | JSON |
| Tous les membres (étiquettes, disponibilités, notes, nombre d'inscriptions, membres désactivés compris) | **Membres** → **Exporter les membres (CSV)** | CSV |
| Le journal d'activité de l'organisation | **Paramètres** → **Journal d'activité** → **Exporter tout le journal (CSV)** | CSV |
| Une feuille de présence, le planning, la liste des bénévoles | **Rapports** de l'événement | CSV, PDF, HTML |

Les fichiers CSV s'ouvrent tels quels dans Excel ou LibreOffice (UTF-8, point-virgule). Les archives ne contiennent jamais de lien personnel ni de jeton d'accès.

**Durées de conservation** :

| Données | Conservation |
|---|---|
| Membres, événements, créneaux, inscriptions, pages, journaux | tant que l'organisation est active ; effacés 30 jours après sa désactivation |
| Emails envoyés (file d'envoi) | effacés chaque nuit une fois partis ; ceux en échec après 30 jours |
| Comptes administrateurs désactivés | effacés après 30 jours |
| Sauvegardes chiffrées de la base | 30 jours sur le serveur, 90 jours en copie hors site |

**Supprimer une organisation** : exportez d'abord ce que vous voulez garder, puis demandez la désactivation à l'administrateur de la plateforme (adresse de contact en bas de page). L'organisation devient inaccessible immédiatement ; ses données sont effacées définitivement par le nettoyage automatique 30 jours plus tard, sauvegardes comprises à l'issue de leur propre délai. Pendant ces 30 jours, une réactivation reste possible.

## Journal d'activité de l'organisation

**`/admin/settings/activity`**

Liste chronologique et filtrable des changements sur les membres et les comptes admin (création, modification, désactivation d'un membre ; invitation, retrait d'un compte admin). Indépendant du journal par événement — les membres et comptes admin appartiennent à l'organisation, pas à un événement précis.

---

## Titre de la page publique

**`/admin/settings/admins`** → section **Titre de la page publique**

Le titre affiché en haut de la page publique de vos événements (l'adresse de votre organisation, sans nom d'événement). Par défaut : « Bénévoles ». Saisissez le texte de votre choix (2 à 100 caractères) puis **Enregistrer** ; le même texte devient le titre de l'onglet du navigateur. Le nom de l'organisation reste affiché juste au-dessus. **Rétablir « Bénévoles »** revient au titre par défaut. Ce titre ne s'applique pas aux pages d'événement, qui gardent le titre de l'événement.

---

## Fuseau horaire

**`/admin/settings/admins`** → section **Fuseau horaire**

Les heures des créneaux sont des heures locales : ce réglage indique dans quel fuseau les lire. Il sert à envoyer les rappels au bon moment, à indiquer l'heure limite d'une place proposée en liste d'attente, et à afficher les heures du journal de l'événement et de l'export PDF. Par défaut, c'est le fuseau de la plateforme (Europe/Zurich) ; choisissez-en un autre si vos événements ont lieu ailleurs, puis **Enregistrer**. Changer de fuseau ne modifie pas les heures affichées des créneaux, mais décale le moment où leurs rappels partent.

---

## Charte du bénévole

**`/admin/settings/admins`** → section **Charte du bénévole**

La charte est le texte que les bénévoles doivent lire et accepter avant de finaliser leur inscription. Un texte par défaut est fourni ; vous pouvez le personnaliser librement ou le réinitialiser.

- Le commutateur **Assurance RC fournie par l'organisation** choisit la variante du texte par défaut : couverture par l'assurance responsabilité civile de l'organisation, ou couverture accidents personnelle à la charge de chaque bénévole. Changer le commutateur remplace le texte affiché dans la zone de saisie par la variante correspondante ; les modifications non enregistrées sont perdues.
- Modifier le texte dans la textarea et cliquer sur **Enregistrer**
- Cliquer sur **Réinitialiser la convention par défaut** pour revenir au texte standard

Dans l'interface, ce bloc s'intitule « Convention des Bénévoles » ; côté bénévole, le lien du formulaire s'intitule « charte du bénévole ».

Les bénévoles voient la charte sous forme de lien « Lire la charte » dans le formulaire d'inscription. Cliquer dessus ouvre un modal avec le texte complet et un bouton « J'ai lu et j'accepte ».

---

## Vue publique

Le lien **Vue publique ↗** (visible uniquement si l'événement est publié) ouvre la page telle qu'un bénévole la voit, dans un nouvel onglet. Pratique pour vérifier l'affichage avant de partager.

---

## Questions fréquentes

**J'organise un événement sur plusieurs jours avec des postes différents chaque jour — comment je structure ça ?**
Un seul événement, un seul planning : la timeline des créneaux affiche chaque jour de l'événement l'un sous l'autre. Créez un poste par type de mission (« Sécurité », « Bar »…) une seule fois — il regroupe automatiquement tous ses créneaux, même sur des jours différents et avec des horaires ou des capacités qui changent d'un jour à l'autre.

**J'ai un poste qui demande d'être majeur (ou d'avoir un âge minimum précis, genre 21 ans pour conduire) — je fais comment ?**
Renseignez le champ **Âge minimum** sur le créneau concerné (voir « Âge minimum sur un poste » plus haut). Le poste reste visible et sélectionnable pour tout le monde sur la page publique — c'est la date de naissance, demandée à l'inscription, qui filtre. Rien à gérer à la main : un bénévole trop jeune reçoit un message clair et son inscription n'aboutit pas.

**Un poste critique risque d'être en sous-effectif (sécurité, premiers secours…) — comment je le surveille ?**
La page **Où manque-t-il du monde ?** de l'événement (lien depuis sa page principale) liste tous les créneaux encore ouverts avec des places libres, tous postes confondus, du plus dégarni au plus proche du complet, et les postes où personne n'est inscrit — pas besoin d'éplucher le planning entier la veille pour repérer ce qui manque.

**Je veux qu'une personne suive « son » poste sans lui donner accès à tout l'admin.**
Faites-en un·e responsable de secteur (voir plus haut). Elle reçoit un lien personnel, sans compte à créer, qui affiche uniquement qui est inscrit sur son poste — parfait pour un chef d'équipe sécurité ou un responsable bar qui doit juste savoir qui arrive et quand.

**Un poste est complet mais j'ai encore des demandes — je perds ces bénévoles ?**
Activez la liste d'attente sur le créneau (voir plus haut). Une place libérée est proposée automatiquement à la première personne en attente, avec 24 h pour confirmer — vous n'avez rien à recontacter à la main.

**Je veux donner des infos pratiques (accès, parking, ce qu'il faut apporter) sans surcharger le message principal.**
Créez une ou plusieurs pages personnalisées (voir plus haut) : règlement, FAQ, plan d'accès… Elles apparaissent comme des liens discrets sous les instructions publiques, chacune sur sa propre page.

**Comment je sais si mon événement va bien se passer avant le jour J, sans tout vérifier à la main ?**
Les jalons (échéances clés comme « Fermer les inscriptions » ou « Envoyer les rappels ») et le récap global (créneaux, places, inscrits, restants) sur la page de l'événement donnent un état des lieux en un coup d'œil — et un jalon dépassé non coché saute aux yeux.

**J'ai fait une erreur sur un créneau ou une inscription — comment je retrouve ce qui s'est passé ?**
Le journal de l'événement (voir plus haut) garde l'historique complet : qui a fait quoi, quand. Le mode **Rejouer** reconstitue l'état exact d'un créneau ou d'une inscription à un instant donné, et le mode **Récit** raconte en une phrase une chaîne d'événements liés (ex. une annulation qui déclenche une offre de liste d'attente).
