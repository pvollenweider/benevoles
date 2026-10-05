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

**Règles du mot de passe**, affichées sous le champ et cochées au fur et à mesure : 10 caractères minimum, une lettre majuscule, une lettre minuscule, un chiffre, un caractère spécial, et pas trop long : 72 signes au plus sans accents, une lettre accentuée comptant pour 2 signes et un emoji pour 4. Sur **Mon compte**, après 5 mots de passe actuels erronés (ou 20 depuis une même adresse IP) en 15 minutes, le changement est refusé pendant un quart d'heure.

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

Les étapes se cochent d'elles-mêmes au fur et à mesure. La liste disparaît quand les étapes obligatoires sont faites ; un propriétaire peut la retirer plus tôt, pour tous les admins de l'organisation, avec **Masquer ces étapes**.

---

## Tableau de bord

**`/admin/dashboard`**

En haut, **Ce qui demande votre attention** liste, du plus urgent au moins urgent, les situations de vos événements publiés sur lesquelles agir, chacune avec un lien vers l'endroit où la régler :

![Tableau de bord : « Ce qui demande votre attention » avec, du plus urgent au moins urgent, deux demandes d'inscription à traiter, un jalon en retard, des créneaux à compléter, une invitation sans réponse, des postes sans responsable et le début de l'événement, puis les chiffres clés](/doc-img/admin-dashboard.png)

- créneaux des 7 prochains jours pas encore complets (urgent à moins de 2 jours) ;
- demandes d'inscription à accepter ou refuser, sur les créneaux sur validation (urgent) ;
- places proposées en liste d'attente qui expirent dans les 12 heures sans réponse ;
- jalons en retard ;
- personnes invitées il y a plus de 3 jours qui n'ont encore aucun créneau confirmé ni répondu ne pas être disponibles (avec un lien pour leur écrire) ;
- postes sans responsable de secteur, quand l'événement en a déjà d'autres ;
- bénévoles avec une charge élevée (plus de 8 h dans la journée, ou plus de 6 h d'affilée sans vraie pause) ;
- événement qui commence dans la semaine ;
- événement terminé mais toujours publié, à archiver ;
- membres avec une adresse à vérifier, quand un message important (confirmation, proposition de liste d'attente ou rappel) a été refusé définitivement — lien vers la liste des membres déjà filtrée.

Quand rien ne demande votre attention, la section le dit.

Vue d'ensemble de votre organisation : nombre d'événements (publiés et à venir), bénévoles inscrits, taux de remplissage global (places occupées sur places disponibles) et répartition des membres (total, avec email, sans email : ces derniers ne peuvent pas recevoir d'invitations).

---

## Rechercher

**`/admin/search`**

La loupe **Rechercher** de la barre du haut ouvre le champ de recherche (**Ctrl + K**, ou **Cmd + K** (⌘) sur Mac, l'ouvre aussi ; **Échap** le referme). Sur un petit écran, le champ est dans le **Menu**. Il retrouve en une fois, dans toute votre organisation :

- les **bénévoles** dont le prénom, le nom, l'email ou le téléphone correspond : le lien ouvre la page Membres filtrée sur cette personne, membres désactivés compris ;
- leurs **inscriptions** (confirmées, en liste d'attente ou place proposée), avec l'événement et le créneau : le lien ouvre les inscriptions de l'événement filtrées sur cette personne ;
- les **événements** dont le titre ou le lieu correspond ;
- les **créneaux** dont le poste ou l'intitulé correspond : le lien ouvre les inscriptions de ce créneau.

Tous les mots doivent correspondre : « alice martin » trouve Alice Martin, « fête bar » les créneaux du poste Bar de l'événement « Fête d'été ». Ni les majuscules ni les accents ne comptent : « zoe » trouve Zoé, dans la recherche globale comme dans les filtres des pages Membres et Inscriptions. Chaque groupe affiche les 20 premiers résultats ; au-delà, précisez la recherche.

Au clavier, la première pression sur **Tab** en haut d'une page fait apparaître un lien **Aller au contenu**, qui saute la barre du haut.

---

## Créer un événement

**`/admin/events/new`**

La création se fait en trois étapes, indiquées en haut de page : **1. Informations**, **2. Postes et créneaux**, **3. Vérification et publication**. Après l'étape 1, vous arrivez sur les créneaux avec un bouton **Continuer** ; l'étape 3 (`/admin/events/[id]/review`) récapitule ce qui est prêt et ce qui manque (dates, créneaux, lieu, message de confirmation, instructions, responsables, puis les points décrits ci-dessous), propose l'aperçu bénévole, puis **Publier** ou **Rester en brouillon**. On peut publier sans les points facultatifs, mais pas sans créneau : cette règle vaut partout (page de l'événement, formulaire d'édition), pas seulement dans l'assistant, et un événement est toujours créé en brouillon. Dans l'autre sens, si le dernier créneau d'un événement publié est annulé (ou son dernier poste supprimé), l'événement repasse en brouillon, avec une entrée dans le journal. **Quitter l'assistant** ramène à tout moment à la page de l'événement : rien n'est perdu, chaque étape est une page normale de l'administration.

La vérification signale aussi, sans jamais bloquer la publication, des points **À vérifier** (marqués d'un ?), chacun avec une phrase d'explication et un lien vers l'endroit où le corriger. Les points **À faire** (marqués d'un !) bloquent la publication ; les champs **Facultatif** (marqués d'un –) peuvent rester vides :

- **Infos pratiques des créneaux** : le nombre de créneaux sans lieu de rendez-vous ou sans personne de contact (« 3 créneaux sans lieu ni contact »), ce que les bénévoles retrouvent dans l'email de confirmation, les rappels et leur page personnelle. Le lieu de l'événement vaut pour tous ses créneaux ; un contact, lui, se renseigne créneau par créneau. Lien vers les créneaux.
- **Inscriptions** : ouvertes dès la publication (avec l'heure de fermeture si elle est programmée), ouverture programmée à une date donnée, ou fermées sans date d'ouverture, dans le fuseau de l'organisation. Une ouverture programmée ne compte que si la case **Inscriptions ouvertes** est cochée, et la vérification le rappelle. Lien vers les réglages de l'événement.
- **Rappels automatiques**, seulement s'il reste un créneau à venir : tous envoyés, en partie ou entièrement désactivés pour l'organisation (lien vers **Paramètres → Emails**), ou coupés pour cet événement (ce dernier réglage ne se change pas encore depuis l'interface, le point n'a donc pas de lien).
- **Couverture**, une fois l'événement publié : places occupées et créneaux incomplets (« 46 places occupées sur 52, 3 créneaux incomplets »), avec le lien **Voir les créneaux incomplets** vers la page **Où manque-t-il du monde ?**.

### Partir d'un modèle

En haut de la page, **Comment commencer ?** propose une page blanche ou un modèle : festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage. Un modèle n'est qu'un événement déjà rempli : choisissez-le, donnez un titre et la date du premier jour, et le brouillon est créé avec ses postes et ses créneaux (la liste de ce qui sera créé est affichée avant). Vous arrivez sur ses créneaux : horaires, effectifs et postes sont des points de départ, chacun se modifie ou se supprime comme d'habitude. Rien n'est publié.

### Page blanche

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement. L'adresse de la page d'inscription (`festival-2025`) en est tirée automatiquement à la création |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Coordonnées GPS ou lien de carte | Collez un lien OpenStreetMap ou Google Maps, ou une paire « latitude, longitude » : les bénévoles ont alors un lien **Voir sur la carte** (OpenStreetMap, aucune requête vers un service tiers tant qu'ils ne cliquent pas) sur la page d'inscription, dans les emails et sur leur page personnelle. Un créneau peut avoir ses propres coordonnées dans ses infos pratiques ; sinon celles de l'événement sont utilisées |
| Description | Texte libre, affiché publiquement dans l'encadré de l'événement sur la page d'inscription (colonne de droite, sur ordinateur) |
| Instructions publiques | Message visible en haut de la page d'inscription |
| Téléphone obligatoire à l'inscription | Si coché, le formulaire public exige un numéro de téléphone (désactivé par défaut). Ne s'applique pas aux bénévoles que vous ajoutez vous-même depuis l'administration. Le numéro saisi est enregistré avec l'inscription : c'est lui qui s'affiche dans la liste des inscriptions, les **Rapports** et la page du responsable de secteur (à défaut, celui de la fiche du membre) |
| Message de confirmation | Texte affiché sur la page de succès après inscription, sur la page personnelle du bénévole et dans l'email de confirmation. Mise en forme simple (gras, listes, liens). Variables : {prénom}, et pour le premier créneau de la personne : {créneau}, {date}, {heure} |
| Couleur de la page publique | Une couleur de la palette (la même que celle des postes) derrière le titre de la page d'inscription, avec un aperçu dans le formulaire. Le texte reste blanc sur un fond foncé, donc lisible ; sans couleur, l'en-tête reste blanc. La couleur est copiée avec les réglages lors d'une duplication |

L'événement est créé en **brouillon** (`draft`) — il n'est pas visible du public tant qu'il n'est pas publié.

En modification (**`/admin/events/[id]/edit`**), chaque changement est enregistré automatiquement ; l'heure du dernier enregistrement s'affiche en haut du formulaire. Si un enregistrement échoue, un message le dit et **Réessayer** renvoie vos modifications.

**Repartir d'un événement existant** (édition suivante d'un festival, même organisation d'une année sur l'autre) : **Dupliquer**, depuis la liste des événements ou la page de l'événement, ouvre une page de choix :

- le **titre** de la copie (« (copie) » par défaut) ;
- le **premier jour** de la copie : toutes les dates (fin, créneaux, spectacles) sont décalées du même nombre de jours ;
- ce qui suit : les **créneaux** (postes, horaires, places, listes d'attente, âge minimum, infos pratiques, rouverts et sans inscriptions), les **messages et réglages d'inscription**, les **pages personnalisées**, et, décochés par défaut, les **responsables de secteur** (chacun reçoit alors un email avec son lien pour la copie).

Un récapitulatif dit ce qui va être créé avant de confirmer. La copie est un brouillon ; les inscriptions et les jalons ne sont jamais copiés.

Une fois créé, chaque événement a sa propre page de pilotage : statistiques en un coup d'œil, raccourcis vers les créneaux et les inscriptions, jalons, journal. C'est votre poste de commande pour toute la durée de l'événement.

![Page de pilotage d'un événement publié : barre d'étapes, statistiques, raccourcis vers les créneaux, les inscriptions et les autres pages de l'événement, puis la liste des jalons dont un en retard](/doc-img/admin-event-overview.png)

---

## Configurer les créneaux

**`/admin/events/[id]/shifts`**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

![Frise des créneaux d'un événement, un bloc par jour, avec les postes en lignes et les créneaux en barres colorées par poste](/doc-img/admin-shifts.png)

### Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. |
| Libellé | Intitulé spécifique (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin, de `00:00` à `23:59` |
| Capacité | Nombre maximum de bénévoles |
| Description | Texte court, qui n'est affiché ni sur la page publique ni dans les emails. Ce n'est pas un champ confidentiel : pour ce qui doit rester à l'organisation, utilisez les notes internes ; pour ce que les bénévoles doivent savoir, les infos pratiques |
| Infos pratiques pour les bénévoles | Lieu de rendez-vous et consigne pratique, visibles sur la page publique d'inscription et dans les emails ; personne de contact (nom, téléphone), envoyée seulement aux inscrits (email de confirmation, rappels, page personnelle), jamais affichée publiquement. Facultatifs, courts : pas de fiche de mission. |
| Notes internes | Jamais montrées aux bénévoles |
| Âge minimum (optionnel) | Condition d'âge pour ce poste (ex. : `18` pour un poste avec permis de conduire). Affiché en info sur le planning public ; vérifié à l'inscription — voir « Âge minimum sur un poste » ci-dessous. |
| Activer la liste d'attente | Une fois le créneau complet, les bénévoles peuvent s'inscrire en liste d'attente — voir « Activer la liste d'attente » ci-dessous |
| Sur validation | Chaque inscription devient une demande à accepter ou refuser — voir « Inscriptions sur validation » ci-dessous |

Un créneau est créé ouvert ; son état (inscriptions ouvertes, fermées, complet, créneau annulé) se change ensuite depuis le planning.

### Créer une série de créneaux

Pour couvrir une plage horaire avec des créneaux qui se suivent (une buvette de 10 h à 22 h par créneaux de deux heures, trois personnes à chaque fois), cliquez sur **Créer une série** au lieu de saisir chaque créneau.

| Champ | Description |
|-------|-------------|
| Poste, libellé | Comme pour un créneau seul |
| Date, début, fin | La plage à couvrir ; une fin plus petite que le début passe minuit |
| Durée d'un créneau | Choix courant (30 min à 4 h) ou saisie en minutes (15 au minimum) |
| Pause entre deux créneaux | Facultative, en minutes |
| Personnes par créneau, **Activer la liste d'attente**, **Sur validation** | Appliqués à chaque créneau |

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
- **Inscriptions** : **Ouvertes**, **Complet**, **Fermées** (le créneau reste visible, personne ne peut plus s'y inscrire) ou **Créneau annulé** ;
- **Dupliquer** : crée une copie juste après, de même durée, avec tous les réglages du créneau (places, liste d'attente, âge minimum, infos pratiques) et sans inscriptions ; déplacez-la ensuite si besoin ;
- **Voir les inscriptions** (lien vers les inscriptions du créneau) et **Supprimer le créneau**.

### Activer la liste d'attente

Cochez **Activer la liste d'attente** dans le formulaire du créneau (ou dans celui d'une série de créneaux). Quand le créneau est complet, les bénévoles peuvent s'y inscrire ; une place libérée déclenche automatiquement l'envoi d'un email à la première personne en attente, avec un lien de confirmation valable **24 heures**. Passé ce délai sans réponse, la place est proposée à la personne suivante.

La vue des inscriptions (`/admin/events/[id]/registrations`) affiche les bénévoles en attente (**Liste d'attente**, avec leur rang dans la file, par exemple « position 2 ») et ceux à qui une place a été proposée (**Place proposée**).

### Inscriptions sur validation

Pour un poste sensible (conduite, caisse, sécurité, une qualification), cochez **Sur validation** dans le formulaire du créneau (ou dans la série de créneaux). Une inscription sur ce créneau devient alors une **demande** :

- le bénévole voit le créneau marqué « Sur validation » sur la page publique et dans le récapitulatif, puis « Demande envoyée » après l'envoi. Il reçoit un email « Demande reçue » avec son lien personnel, où il suit sa demande et peut la retirer ;
- la demande **garde sa place** jusqu'à votre décision : quand les demandes remplissent le créneau, les suivants vont en liste d'attente (ou le créneau est complet) ;
- dans les inscriptions de l'événement, chaque demande porte les boutons **Accepter** et **Refuser**, et la case **Demandes à traiter** n'affiche qu'elles. Un récapitulatif dit ce qui va se passer avant de confirmer ;
- **Accepter** fait de la demande une inscription confirmée : le bénévole reçoit l'email de confirmation habituel, et les responsables du poste sont prévenus ;
- **Refuser** libère la place, proposée ensuite à la liste d'attente. Le bénévole reçoit un email poli, sans raison, sauf si vous écrivez un message (facultatif) ;
- chaque décision est inscrite dans le journal de l'événement (le texte du message n'y figure pas).

![Inscriptions filtrées sur « Demandes à traiter (2) » : deux demandes sur le poste Navette, chacune avec les boutons Accepter et Refuser](/doc-img/admin-registrations-requests.png)

![Fenêtre « Refuser la demande de Marc Duc ? » : ce qui va se passer, un message facultatif pour la personne, et les boutons Annuler et Refuser](/doc-img/admin-refuse-request.png)

Les demandes ne reçoivent pas les rappels, ne figurent pas sur les feuilles de présence et les exports, et ne font pas partie de « tous les inscrits » dans les messages ciblés. Une demande compte comme une inscription pour les doublons, les chevauchements et la limite de créneaux par personne. Tant qu'elle n'est pas acceptée, elle garde sa place sans compter parmi les inscrits : la page de l'événement l'affiche à côté des inscrits (« + 2 demandes à traiter ») et ne la compte pas dans les places restantes, et « Où manque-t-il du monde ? » ne compte pas sa place comme manquante, avec un lien vers les demandes à traiter. Les **Rapports** ne la montrent nulle part, coordonnées comprises. Une place proposée depuis la liste d'attente sur un créneau sur validation devient, elle aussi, une demande. Si le créneau est annulé, les demandes le sont aussi, avec le même email que les inscrits.

Une personne ajoutée à la main est inscrite directement, sans demande. Cocher **Sur validation** ne change rien aux inscriptions déjà confirmées ; le décocher laisse les demandes en cours à traiter. Les demandes en attente apparaissent dans **Ce qui demande votre attention**.

### Gérer les postes

Le bouton **Gérer les postes** ouvre un panneau qui regroupe ces actions, poste par poste :

- **Réordonner** : glissez-déposez une ligne, ou utilisez ses flèches Monter et Descendre (aussi au clavier), puis **Enregistrer l'ordre**. L'ordre défini ici s'applique à la timeline admin **et** à la page publique.
- **Renommer** : clique sur « Renommer », tape le nouveau nom, valide. Tous les créneaux de ce poste sont renommés d'un coup — impossible de renommer vers un nom déjà utilisé par un autre poste (pour ne pas fusionner deux postes par erreur).
- **Supprimer** : annule tous les créneaux de ce poste (comme une suppression de créneau individuelle) — une confirmation indique le nombre de créneaux et de bénévoles concernés ; ces derniers sont prévenus par email.
- **Couleur** : le point coloré à gauche du nom ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique » pour revenir à la couleur assignée par défaut) ; la couleur choisie est cochée. S'applique à la timeline admin et à la page publique.
- **Limite par personne** : le bouton « Limite » fixe le nombre maximum de créneaux de ce poste qu'une même personne peut prendre (par exemple 2 pour la loge des artistes, pour que plus de monde y participe). Laissez vide pour ne pas limiter. Comptent toutes les inscriptions de la personne sur ce poste, confirmées ou en liste d'attente ; les annulées ne comptent pas. La page publique empêche de sélectionner un créneau de trop et dit pourquoi ; le serveur refuse aussi toute inscription au-delà, même envoyée en même temps qu'une autre. Les inscriptions déjà au-delà d'une nouvelle limite restent. En ajoutant quelqu'un à la main, l'administration prévient et propose **Ajouter quand même**. La limite est copiée avec l'événement.
- **Accès réservé** : le bouton « Accès » réserve le poste aux membres portant l'une des étiquettes indiquées (par exemple `sécurité` pour la sécurité). Ces membres s'y inscrivent avec le lien personnel de leur invitation (dans **Invitations**, filtrez les membres par étiquette pour les inviter). Sans ce lien, la page publique affiche le poste comme « Réservé » et le serveur refuse toute inscription ; les étiquettes ne sont jamais montrées aux bénévoles. L'étiquette est lue au moment de l'inscription : si vous la retirez à un membre, son invitation ne lui ouvre plus le poste. Les inscriptions déjà faites restent. Vous pouvez toujours ajouter quelqu'un à la main. Le réglage est copié avec l'événement.

### Âge minimum sur un poste

Un poste peut exiger un âge minimum (majorité, permis de conduire, qualification…). Une fois renseigné dans le formulaire du créneau, il est affiché en petit sur le planning public (ex. « 18+ »). Le créneau reste sélectionnable — l'âge du bénévole n'est pas connu avant qu'il remplisse le formulaire — mais l'inscription lui demande alors sa date de naissance et est refusée si la condition n'est pas remplie. L'âge pris en compte est celui qu'aura le bénévole le jour du créneau, pas le jour de l'inscription.

---

## Configurer le programme des spectacles

Dans le formulaire de l'événement, à la création comme dans la page d'édition (**`/admin/events/[id]/edit`**), section **Spectacles**. Elle apparaît dès que les dates de début et de fin sont renseignées.

Chaque entrée définit une plage horaire qui apparaît en fond coloré sur la timeline, permettant aux bénévoles de visualiser quand ils travaillent par rapport aux spectacles.

**+ Ajouter** propose les champs : **Nom du spectacle**, **Date**, **Début**, **Fin**.

---

## Questions aux bénévoles

**`/admin/events/[id]/questions`**, depuis la page de l'événement (**Questions**).

![Page des questions d'un événement : « Taille de t-shirt » (choix unique S à XL, obligatoire) et « Régime alimentaire » (texte court), avec les actions pour les modifier, les réordonner ou les retirer](/doc-img/admin-questions.png)

Jusqu'à 5 questions ajoutées au formulaire d'inscription, quand l'événement demande une information de plus : taille de t-shirt, permis, régime, expérience, transport. Types : **texte court**, **oui / non**, **choix unique** ou **choix multiple** (un choix par ligne, au moins deux), obligatoire ou facultative. L'ordre se change avec **Monter** et **Descendre**.

Chaque bénévole répond une fois pour l'événement. S'il se réinscrit depuis son invitation (ou lors de sa toute première inscription), sa nouvelle réponse remplace l'ancienne, et une question facultative laissée vide efface l'ancienne réponse. Depuis le formulaire public sans invitation, rien ne prouve qui a saisi l'adresse email : seules les réponses manquantes sont ajoutées, les réponses existantes ne sont jamais remplacées. Le serveur vérifie les réponses (une réponse obligatoire manquante ou un choix inconnu refuse l'inscription, avec la raison). Les réponses apparaissent sous chaque inscription, dans la feuille de présence (CSV, une colonne par question) et dans l'archive de l'événement, et le récapitulatif avant l'envoi les liste dans « Transmis à l'organisation ».

Une question qui a déjà des réponses garde son type, et les choix déjà retenus ne peuvent pas être retirés (créez une nouvelle question si besoin). **Retirer** une question qui a des réponses la sort du formulaire, mais ses réponses restent dans les inscriptions et les exports jusqu'à la suppression de l'événement ; sans réponse, elle est simplement supprimée. Une copie de l'événement reprend les questions (sans les réponses) avec les réglages.

### Synthèse des réponses

Sous la liste des questions, **Synthèse des réponses** compte les réponses, par exemple pour savoir combien de t-shirts de chaque taille commander. Un tableau par question :

- **choix unique** et **choix multiple** : le nombre de bénévoles par choix, dans l'ordre de la question, puis **Sans réponse**. Pour un choix multiple, chacun peut cocher plusieurs choix : le total peut dépasser le nombre de bénévoles ;
- **oui / non** : les deux totaux, puis **Sans réponse** ;
- **texte court** : les réponses regroupées sans tenir compte des majuscules, des accents ni des espaces autour (« Végétarien » et « vegetarien » comptent ensemble, sous l'orthographe la plus saisie), la plus fréquente en premier, puis **Sans réponse**.

Qui est compté : chaque bénévole qui a au moins un créneau confirmé sur l'événement, une seule fois quel que soit son nombre de créneaux. Les bénévoles sans créneau confirmé mais en liste d'attente, avec une place proposée ou une demande à valider sont comptés à part, dans la colonne **En attente** : une marge pour la commande. Les inscriptions annulées ou refusées ne comptent pas, même si la réponse reste enregistrée. Un choix retiré de la question après avoir été retenu reste compté, après les choix actuels, avec la mention « (choix retiré) ». Les questions retirées n'apparaissent pas.

La ligne **État au** donne la date et l'heure du calcul, dans le fuseau de l'organisation : les inscriptions bougent jusqu'à la commande. **Télécharger la synthèse (CSV)** donne un fichier (question, réponse, confirmés, en attente) à envoyer tel quel à un fournisseur, sans nom ni coordonnées ; **Imprimer la synthèse** ouvre la même synthèse en noir et blanc, aussi disponible dans **Rapports**.

Ne demandez que ce qui est nécessaire à l'organisation, et pas d'information sensible (santé, religion, opinions…) : les réponses sont des données personnelles.

## Pages personnalisées de l'événement

**`/admin/events/[id]/pages`**

En complément du champ unique « instructions publiques », ajoutez autant de pages libres que nécessaire à un événement : règlement, FAQ, accès et lieu, ce qu'il faut apporter…

- **Ajouter** une page : titre + contenu rédigé en Markdown (gras, listes, titres, liens, tableaux)
- L'adresse de la page (slug) est générée automatiquement depuis le titre
- **Réordonner** les pages avec leurs flèches Monter et Descendre (aussi au clavier) : l'ordre est enregistré à chaque déplacement ; si l'enregistrement échoue, un message le dit et l'ordre enregistré est rétabli
- **Supprimer** une page (confirmation demandée)

Les pages apparaissent sous forme de liens juste après les instructions publiques, sur la page de l'événement.

![Pages personnalisées d'un événement (« Accès et parking », « Questions fréquentes »), avec leur adresse et les actions modifier et supprimer](/doc-img/admin-pages.png)

---

## Responsables de secteur

**`/admin/events/[id]/sector-leaders`**

Désignez un ou plusieurs bénévoles responsables d'un poste (ex. « Bar »). Chacun reçoit un lien personnel — sans compte à créer — qui affiche en lecture seule la liste des bénévoles inscrits sur ce poste (nom, email, téléphone).

![Liste des responsables de secteur d'un événement, avec le poste, le nom et l'action retirer](/doc-img/admin-sector-leaders.png)

- **+ Ajouter un responsable** : poste (autocomplété depuis les postes existants), nom, email — ou **Depuis les inscrits** pour choisir directement un bénévole déjà inscrit à l'événement, qui pré-remplit ces champs
- Depuis la page des inscriptions, sélectionner une seule ligne puis **Rendre responsable** propose directement le poste de ce créneau

  ![Fenêtre « Rendre Camille Rochat responsable » : choix du poste parmi ceux où la personne est inscrite, et email pré-rempli](/doc-img/admin-make-leader-modal.png)
- Un email est automatiquement envoyé au responsable avec son lien personnel ; il est aussi prévenu à chaque nouvelle inscription sur son poste, et à chaque désistement d'une place confirmée ou d'une demande (réglage **Prévenir en cas de désistement**, voir « Réglages des emails »)
- **Retirer** un responsable à tout moment (confirmation demandée)
- La fiche du bénévole concerné (`/admin/members`) reçoit automatiquement le tag « responsable »

![Page personnelle de la responsable du poste Buvette : chaque créneau avec ses bénévoles inscrits, leur email et leur téléphone, et les personnes en liste d'attente](/doc-img/leader-page.png)

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

Ce n'est pas une protection : toute personne qui a le lien, ou qui le devine, peut ouvrir l'événement et s'y inscrire, et l'application ne propose pas de mot de passe. Pour réserver un poste à certains membres, utilisez l'**Accès réservé** (voir « Gérer les postes »). Une copie ou un événement créé depuis un modèle est toujours répertorié : le choix se refait pour chaque événement.

**Avant de publier**, le bouton **Prévisualiser comme un bénévole** de la page de l'événement montre la page publique exactement comme la verront les bénévoles, même tant que l'événement est en brouillon : planning et places, pages personnalisées, charte, champs demandés dans le formulaire (téléphone si vous l'avez rendu obligatoire, date de naissance pour un créneau avec âge minimum). Vous pouvez remplir le formulaire : au lieu de vous inscrire, l'aperçu affiche le message de confirmation et l'email que recevrait le bénévole. Rien n'est enregistré ni envoyé. Pour voir le rendu sur téléphone, réduisez la largeur de la fenêtre ou ouvrez l'aperçu depuis votre téléphone.

La page **Vérification et publication** (`/admin/events/[id]/review`, voir « Créer un événement ») fait le tour de ce qui manque encore : infos pratiques des créneaux, état des inscriptions, rappels automatiques et, une fois publié, la couverture des créneaux. Aucun de ces points n'empêche de publier.

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**.

L'événement devient alors visible à l'URL :

```
https://[slug-organisation].benevol.app/[slug-evenement]
```

Le slug de l'organisation est un sous-domaine, pas un chemin — chaque organisation a sa propre adresse.

Le lien **Vue publique ↗** apparaît sur la page admin dès que l'événement est publié.

### Partager le lien

Une fois l'événement publié, la page de l'événement (section **Partager l'événement**) et la page de vérification avant publication affichent le lien à partager, avec deux boutons :

- **Copier le lien** copie l'adresse publique de l'événement. « Lien copié. » s'affiche sous les boutons. Si le navigateur refuse la copie, le lien affiché est sélectionné : copiez-le.
- **Partager** ouvre le partage de votre téléphone ou de votre navigateur (WhatsApp, email, messages…). Ce bouton n'apparaît que si votre navigateur sait partager, le plus souvent sur téléphone.

Le lien partagé est toujours l'adresse publique de l'événement, jamais un lien personnel de bénévole ou de responsable.

**Aperçu du lien.** Collé dans une messagerie, un réseau social ou une newsletter, le lien d'un événement publié s'affiche avec son titre, un court texte et l'image de benevol.app. Le texte est le début de la **description** de l'événement (environ 200 caractères, sans mise en forme) ; sans description, c'est « [Organisation] cherche des bénévoles pour [événement], du … au … ». Le nombre de places restantes n'y figure pas : les messageries gardent l'aperçu en mémoire, il serait vite faux. Un événement non répertorié a le même aperçu, mais reste hors des moteurs de recherche. Un brouillon ou un événement archivé ne donne ni titre ni texte.

Une messagerie peut garder l'ancien aperçu quelque temps après une modification du titre ou de la description.

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

- **Sauvegarder avant de supprimer** : **Rapports** → **Archive de l'événement (JSON)** télécharge toutes ses données (réglages, créneaux, inscriptions, pages, responsables, jalons, journal). Dans la fenêtre de suppression, le lien **Ouvrir l'export PDF** ouvre le planning, le récapitulatif par poste et la liste des bénévoles ; enregistrez-le depuis la fenêtre d'impression du navigateur. L'application ne conserve aucun export.
- **Les bénévoles ne sont pas prévenus** : leur lien de gestion d'inscription cesse de fonctionner. Pour les prévenir, annulez d'abord les créneaux depuis la page des créneaux : chaque bénévole reçoit un email.
- **Confirmation** : saisir le titre de l'événement (les accents et les majuscules ne comptent pas) pour activer le bouton **Supprimer définitivement**. Cette action est irréversible.

---

## Suivre les inscriptions

**`/admin/events/[id]/registrations`**

Vue tabulaire des inscriptions, en quatre colonnes :

- **Bénévole** : nom, puis sous le nom l'email, le téléphone, les réponses aux questions, les disponibilités, le commentaire et, s'il y a lieu, l'alerte **Charge élevée** ;
- **Créneau** : poste, libellé, jour et horaires ;
- **Source** : **Formulaire** (inscription depuis la page publique) ou **Manuel** (ajout depuis l'administration) ;
- **Statut** : **Liste d'attente** (avec le rang dans la file, par exemple « position 2 »), **Place proposée** ou **Demande à traiter** ; rien pour une inscription confirmée.

![Page des inscriptions d'un événement : compteurs (actives, liste d'attente, demandes à traiter), recherche et filtres, puis le tableau avec bénévole et coordonnées, créneau et source](/doc-img/admin-registrations.png)

Seules les demandes sur un créneau sur validation ont leurs propres boutons, **Accepter** et **Refuser**, sur la ligne (voir « Inscriptions sur validation »). Tout le reste passe par la sélection : cocher une ou plusieurs inscriptions (case d'en-tête pour tout sélectionner d'un coup) fait apparaître une barre d'outils, appliquée à toute la sélection — même une inscription masquée entre-temps par un filtre ou une recherche :

- **Marquer présents** et **Annuler la présence** : voir « Présences le jour J » ci-dessous.
- **Rendre responsable** de leur poste. Avec une seule ligne sélectionnée, une modale s'ouvre pour choisir le poste (si le bénévole a plusieurs inscriptions) et ajuster nom/email avant l'envoi. Avec plusieurs lignes, chaque bénévole est directement rattaché au poste de son propre créneau, sans étape intermédiaire.
- **Renvoyer le lien** : réenvoie par email le lien personnel de gestion (`/my/[token]`) de chaque bénévole sélectionné — utile s'il l'a perdu ou supprimé par erreur. Le lien renvoyé donne accès à toutes les inscriptions actives du bénévole pour cet événement, pas seulement au créneau de la ligne.
- **Retirer de leur créneau** : annule chaque inscription sélectionnée. Les lignes quittent la liste tout de suite, mais rien n'est enregistré ni envoyé pendant 10 secondes : **Annuler le retrait** les remet en place (aucun email ne part), **Retirer maintenant** n'attend pas. Le compte à rebours s'arrête tant que le curseur ou le focus clavier est sur cette barre. Quitter la page valide le retrait ; confirmer un second retrait pendant l'attente le regroupe avec le premier et relance les 10 secondes.

**Rendre responsable**, **Renvoyer le lien** et **Retirer de leur créneau** demandent d'abord une confirmation qui récapitule ce qui va se passer : personnes concernées, emails envoyés, places proposées à la liste d'attente, et le fait que l'action est journalisée. Une fois l'action faite, le lien **Voir cette action dans le journal** ouvre le journal de l'événement à la date du jour pour la retrouver.

Un badge **Responsable** s'affiche sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.

**Charge élevée** : une ligne l'indique, en toutes lettres, quand ce bénévole cumule plus de 8 h de créneaux dans une journée, ou plus de 6 h d'affilée sans pause d'au moins 30 minutes (une pause plus courte compte comme du temps continu). Un créneau qui passe minuit compte pour le jour où il commence ; le temps d'affilée se suit d'un jour à l'autre. Seules les inscriptions confirmées comptent, pas la liste d'attente. C'est une information, rien n'est bloqué. En ajoutant quelqu'un à la main, le formulaire prévient avant l'ajout si ce créneau le ferait dépasser ces seuils, quand la personne est déjà inscrite (même email).

### Ajouter quelqu'un à la main

**+ Ajouter manuellement** ouvre le formulaire **Inscription manuelle** : prénom et nom (obligatoires), email, téléphone, créneau (obligatoire) et une note (par exemple « Inscrit par téléphone »). Si l'email correspond à une personne déjà inscrite à l'événement, ses disponibilités s'affichent sous le champ.

- L'inscription est confirmée directement, même sur un créneau sur validation : pas de demande à traiter.
- Les conditions du formulaire public ne s'appliquent pas : inscriptions fermées, téléphone obligatoire, âge minimum, accès réservé.
- Pour une personne déjà inscrite à l'événement (même email), le formulaire signale qu'elle a déjà un créneau sur la même plage horaire, et si ce créneau lui donnerait une charge élevée ; l'ajout reste possible. Une seconde inscription de la même personne sur le même créneau est refusée.
- Si la personne a déjà atteint la limite de créneaux par personne du poste, l'ajout est refusé avec la raison et le bouton **Ajouter quand même** ; l'ajout au-delà de la limite est noté dans le journal.
- L'ajout n'envoie aucun email. Pour transmettre son lien personnel à la personne, sélectionnez sa ligne puis **Renvoyer le lien**.

### Présences le jour J

Pour savoir qui est venu, sans terminal ni badge : sélectionnez les lignes des personnes arrivées et cliquez **Marquer présents**. Un badge **Présent** apparaît sur la ligne, le compteur « N présents sur M inscrits » se met à jour, et l'action est notée dans le journal. **Annuler la présence** retire la marque (sélection de lignes déjà marquées). Seules les inscriptions confirmées peuvent être marquées.

**Exporter les présences (CSV)**, en haut de la page, télécharge la feuille de présence : une ligne par inscription confirmée avec prénom, nom, email, téléphone, poste, créneau, date, horaires, présent oui/non et l'heure du pointage (fuseau de l'organisation). Elle s'ouvre directement dans Excel ou LibreOffice.

Depuis la page principale de l'événement (`/admin/events/[id]`) :
- 4 chiffres en un coup d'œil en haut de page : créneaux, places totales, inscrits, places restantes
- **Où manque-t-il du monde ?** : une phrase (« Il manque encore 12 personnes sur 20 places ») et un lien vers la vue détaillée décrite ci-dessous

### Où manque-t-il du monde ?

**`/admin/events/[id]/staffing`**

La question que se pose l'organisateur avant l'événement, en une page, du plus urgent au moins urgent :

![Page « Où manque-t-il du monde ? » d'un événement : vue d'ensemble des places pourvues, puis les créneaux à compléter du plus dégarni au plus proche du complet](/doc-img/admin-staffing.png)

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

![Répertoire des membres : export, import et ajout, recherche et filtre par étiquette, puis pour chaque membre ses coordonnées, ses étiquettes, ses heures planifiées et les liens Activité, Éditer et Désactiver](/doc-img/admin-members.png)

- **Ajouter** un membre : prénom, nom, email, téléphone, tags, notes internes, et ses **disponibilités** en général (matin, après-midi, soir, plus une remarque comme « pas le dimanche »), facultatives. Le bénévole peut les renseigner lui-même depuis sa page personnelle. Elles s'affichent dans la liste des membres et sous chaque nom dans les inscriptions, et quand vous ajoutez quelqu'un à la main dès que son email correspond à une personne déjà inscrite à l'événement. C'est une information pour vous : rien n'est filtré ni attribué automatiquement.
- **Modifier**, désactiver ou, pour une fiche inactive sans inscription, **supprimer** un membre existant (voir « Supprimer une fiche » ci-dessous)
- **Importer** des membres en masse : bouton **Importer CSV/Excel** (fichiers `.csv` ou `.xlsx`, 2 Mo et 5000 lignes au plus). Les colonnes sont reconnues par leur intitulé (prénom, nom, email, téléphone, tags ; par exemple `prenom`, `courriel`, `mobile`, `groupes`). Plusieurs tags dans une cellule se séparent par `,`, `;` ou `|`. L'import se fait en deux temps. **Analyser le fichier** montre d'abord, sans rien enregistrer, les membres à créer, à mettre à jour ou ignorés (selon le choix « Si un email existe déjà »), les lignes en erreur avec leur numéro et la raison (nom manquant, email invalide, email en double dans le fichier), et les tags ajoutés ou réutilisés. **Importer** applique ensuite exactement cette analyse. Si des membres ont changé entre-temps, rien n'est enregistré et l'analyse à jour s'affiche, à vérifier avant de confirmer. Les emails sont comparés sans tenir compte des majuscules. Le fichier n'est pas conservé. L'import apparaît une fois dans le journal d'activité de l'organisation, avec les nombres de membres créés et mis à jour. Par organisation, 30 analyses et 10 imports par heure au plus.
- **Rechercher** par texte libre (prénom, nom, email, téléphone) ou filtrer par tag
- **Adresses à vérifier** : une étiquette **Adresse à vérifier** apparaît sur un membre quand un message important (confirmation d'inscription, proposition de liste d'attente, ou rappel pour un créneau proche) a été refusé définitivement par le serveur destinataire, avec la date et une explication neutre (« boîte inexistante ou adresse refusée par le serveur »), jamais une mise en cause de la personne. Un incident temporaire se signale différemment et ne déclenche jamais cette étiquette à lui seul. La case à cocher **Adresses à vérifier**, au-dessus de la liste, filtre sur ces membres et affiche leur nombre. Depuis la ligne d'un membre concerné : **Éditer** corrige l'adresse (le statut disparaît dès qu'une autre adresse est enregistrée, sans attendre un nouvel envoi), **Activité** ouvre ses inscriptions, et **Doublon ?** ouvre les **Doublons possibles** de ce membre. Rien n'est bloqué : les envois à cette adresse continuent normalement, l'étiquette n'est qu'un signal.
- **Trier** par prénom, nom, heures planifiées, heures attestées ou dernière participation : cliquer sur l'en-tête de colonne (croissant → décroissant → reset)
- **Activité** : le lien **Activité** d'une ligne ouvre la chronologie du membre, du plus récent au plus ancien : invitations envoyées et utilisées, inscriptions, liste d'attente, annulations, présences, responsabilités de secteur et modifications de la fiche, chacune avec sa date et un lien vers l'événement. Une phrase résume le tout (nombre d'événements, de créneaux, de présences). Ce sont des faits, sans note ni score ; ils disparaissent avec les événements et la fiche.
- **Heures planifiées** : durée totale des créneaux passés sur lesquels le membre a une inscription confirmée, tous événements confondus, qu'il soit venu ou non (seuls les créneaux à venir sont exclus, puisqu'ils ne sont pas encore « donnés »). Un créneau pendant le changement d'heure compte sa durée réelle (une heure de moins au printemps, une de plus en automne).
- **Heures attestées** : parmi ces mêmes créneaux passés, la durée de ceux où une présence a été enregistrée (pointage à l'arrivée) — toujours incluse dans les heures planifiées, jamais en plus : un membre présent à chaque créneau a autant d'heures attestées que de planifiées, jamais 0 h attestée pour autant d'heures planifiées.
- **Dernière participation** : la date du dernier créneau passé sur lequel le membre a une inscription confirmée ; un indice sous la date précise celle de la dernière présence enregistrée, ou signale qu'aucune présence n'a été saisie. Rien n'en découle automatiquement (pas de désactivation, pas d'étiquette) : ce sont des faits à votre disposition.

Ces colonnes n'apparaissent que dans cette page ; elles ne sont jamais incluses dans les **Rapports**, potentiellement partagés avec les bénévoles.

### Heures par bénévole, pour une période (CSV)

Le bandeau **Heures par bénévole, pour une période (CSV)**, au-dessus de la liste, exporte un fichier avec une ligne par membre ayant au moins une inscription confirmée sur la période choisie (douze derniers mois par défaut) : nombre d'événements, de créneaux, heures planifiées et heures attestées, puis une ligne de total pour l'organisation. La case **Inclure les membres sans créneau confirmé sur la période** ajoute aussi ceux qui n'ont rien donné sur cette période, à zéro — utile pour répondre à « qui n'a plus participé depuis… » sans écran supplémentaire. Mêmes règles de comptage que l'attestation de bénévolat : seules les inscriptions actives sur un créneau jamais annulé comptent.

![Page « Activité de Camille Rochat » : un résumé en une phrase, puis la chronologie datée, du plus récent au plus ancien, de ses inscriptions, de sa place en liste d'attente et de son invitation, chacune reliée à l'événement](/doc-img/admin-member-activity.png)

### Attestation de bénévolat

Depuis la page **Activité** d'un membre, le lien **Attestation de bénévolat** ouvre un document imprimable à remettre sur demande : nom de l'organisation, nom du bénévole, période choisie (douze derniers mois par défaut), le détail par événement (postes tenus, nombre de créneaux, heures attestées) et une zone de signature. Seules les présences enregistrées (pointage à l'arrivée) comptent comme heures attestées ; un créneau confirmé sans présence enregistrée n'y figure que si vous cochez **Inclure les heures planifiées sans présence saisie**, et apparaît alors séparément, sous l'intitulé « planifiées ». Un avertissement à l'écran (absent de l'impression) liste les créneaux confirmés sans présence enregistrée sur la période choisie. Un texte libre facultatif (par exemple le rôle tenu) peut être ajouté. Un créneau annulé après coup ne compte jamais, même si une présence y avait été enregistrée. Rien n'est conservé : le document est régénéré à chaque demande.

### Doublons possibles

Le lien **Doublons possibles (N)**, dans l'en-tête de la page **Membres**, n'apparaît que s'il y a au moins une paire à regarder. Chaque paire montre les deux fiches et les raisons, en mots, pour lesquelles elles se ressemblent : même nom et prénom (après normalisation des majuscules, accents, espaces, traits d'union et apostrophes), même numéro de téléphone (après normalisation des formats suisses et français courants), adresses email très proches (faute de frappe probable sur le même domaine, ou domaine mal orthographié), l'une des deux fiches a une adresse à vérifier proche de l'autre, ou même date de naissance. Un nom identique seul reste présenté comme incertain (« un homonyme n'est pas forcément la même personne ») ; un numéro ou une adresse partagés seuls ne sont jamais présentés comme une probable même personne (une famille, un standard commun expliquent aussi bien un numéro partagé). **Rien n'est fusionné ni modifié depuis cette page** : ce ne sont que des suggestions.

Pour chaque paire : **Ignorer** la retire de la liste (elle ne revient pas, sauf si un nouveau type de signal apparaît plus tard entre ces deux fiches, par exemple une date de naissance ajoutée après coup) ; **Comparer et fusionner** ouvre l'aperçu de fusion ci-dessous, réservé aux propriétaires (les organisateurs voient la paire et un message indiquant qu'un propriétaire doit s'en charger). Le lien **Doublon ?** d'une fiche à l'adresse à vérifier (ci-dessus) ouvre directement les paires de cette fiche.

Les fiches déjà fusionnées (absorbées par une autre, #600) ne sont jamais suggérées. Seuls les membres de votre organisation sont comparés.

### Fusionner deux fiches en double

Quand deux fiches du répertoire désignent en fait la même personne (une adresse email saisie de travers, un doublon de saisie), le lien **Fusionner avec un autre membre** de la page **Activité** d'un membre, ou **Comparer et fusionner** depuis **Doublons possibles**, ouvre la fusion. Réservée aux propriétaires de l'organisation (les organisateurs peuvent repérer un doublon mais pas fusionner).

1. **Choisir la fiche à absorber** : recherchez par nom ou email la seconde fiche, celle qui disparaîtra.
2. **Aperçu** : pour chaque champ où les deux fiches diffèrent (prénom, nom, email, téléphone, date de naissance, note de disponibilité), choisissez la valeur à garder ; pour les notes internes, gardez celles d'une fiche, prenez celles de l'autre, ou mettez les deux à la suite. Les étiquettes et les disponibilités des deux fiches sont toujours réunies, sans choix à faire. Un tableau indique ce qui va être déplacé : inscriptions (par statut), invitations, réponses aux questions, et ce qui ne l'est pas (les abonnements aux notifications du navigateur, jamais déplacés).
3. **Points à vérifier** : si les deux fiches étaient inscrites au même créneau, l'inscription la plus avancée est gardée et l'autre annulée (avec une trace dans le journal de l'événement) ; les autres points (chevauchement de créneaux, limite de postes, âge minimum, poste réservé) sont seulement signalés, pas bloqués, puisque vous avez déjà placé ces personnes en connaissance de cause. Une réponse différente à une même question, ou une invitation au même événement des deux côtés quand ce n'est pas déjà tranché par « déjà utilisée en premier », demande un choix explicite avant de pouvoir confirmer.
4. **Confirmer** : la fusion est **irréversible**. La fiche absorbée est désactivée et vidée de ses informations personnelles (nom, email, téléphone, notes, date de naissance, étiquettes). Les liens personnels (inscriptions, invitations) déplacés depuis la fiche absorbée sont régénérés : une case à cocher permet d'envoyer aussi les nouveaux liens à l'adresse conservée. Les anciens liens affichent la page « lien plus valide » habituelle.

L'historique (journal de l'événement, journal de l'organisation) n'est jamais réécrit ; la page **Activité** de la fiche conservée continue à montrer les faits enregistrés sous l'ancienne fiche. Les responsables de secteur (#186) sont repérés par email, pas déplacés automatiquement : s'ils correspondent à l'adresse abandonnée, mettez-les à jour à la main.

### Supprimer une fiche

Une fiche se supprime définitivement quand elle est **inactive** et n'a **aucune inscription**, quel que soit son statut (confirmée, en liste d'attente, proposée, demandée, annulée, refusée) : rien, dans l'historique d'aucun événement, ne pointe plus vers elle. Une fiche avec des inscriptions reste seulement désactivable (l'effacement de ses données personnelles malgré des inscriptions fait l'objet d'une demande séparée) ; une fiche fusionnée dans une autre (page précédente) n'est jamais proposée à la suppression non plus, elle disparaît de son côté par la purge de rétention.

Le bouton **Supprimer** n'apparaît, sur la ligne de la fiche dans la liste des membres et sur sa page **Activité**, que lorsqu'elle remplit ces deux conditions ; sinon la page **Activité** explique en mots pourquoi elle ne peut pas être supprimée (fiche encore active, ou inscriptions à conserver). La confirmation nomme la personne, précise que l'action est **irréversible** et liste ce qui disparaît avec la fiche : ses invitations, ses réponses aux questions des événements, ses abonnements aux notifications du navigateur, les suivis d'envoi d'email la concernant et les doublons possibles écartés qui la citaient. Aucun email n'est envoyé. L'action est journalisée dans le journal d'activité de l'organisation ; l'activité des autres fiches n'est pas affectée.

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

Le tableau affiche pour chaque membre invité l'un de trois statuts :
- **✓ Participation confirmée**
- **Pas disponible** : la personne a répondu depuis son lien d'invitation qu'elle ne pouvait pas venir cette fois (voir ci-dessous)
- **Sans réponse** : ni inscription confirmée, ni réponse

Les compteurs en haut récapitulent : **Invités**, **Inscrits**, **Pas disponible** et **Sans réponse** — ils s'additionnent toujours au nombre d'invités. Cliquer sur un compteur filtre le tableau sur cet état ; cliquer sur **Invités** l'efface.

**Tester l'envoi d'email** envoie un exemple de l'email d'invitation à l'adresse de votre choix, pour vérifier le rendu avant d'inviter.

### Pas disponible

L'email d'invitation et la page de l'événement ouverte depuis le lien personnel proposent un second lien, **Je ne suis pas disponible pour cet événement**, qui ouvre une étape de confirmation avant d'enregistrer quoi que ce soit (un simple aperçu du lien dans la messagerie ne répond jamais à la place de la personne). Aucune raison n'est demandée. La personne peut changer d'avis à tout moment : s'inscrire depuis ce même lien efface le statut « Pas disponible » ; se désinscrire ensuite de tous ses créneaux ne le remet pas.

### Relancer les invités sans réponse

Le compteur **Sans réponse** compte les membres invités qui n'ont encore ni inscription confirmée ni réponse à l'événement (ceux qui ne sont qu'en liste d'attente en font partie). Le bouton **Relancer les N sans créneau** leur renvoie un rappel, sans message personnalisé, contrairement à l'invitation initiale ; une confirmation récapitule l'envoi avant qu'il parte et précise combien de personnes ayant indiqué ne pas être disponibles ne sont pas relancées. **Écrire un message aux N sans créneau** ouvre « Écrire aux bénévoles » avec ce public déjà choisi, pour un texte libre ; la même exclusion s'applique, et l'aperçu comme la confirmation disent combien de personnes en ont été exclues.

---

## Communications bénévoles

### Écrire aux bénévoles

**`/admin/events/[id]/message`**, depuis la page de l'événement (**Écrire aux bénévoles**) ou depuis les inscriptions (le bouton reprend le poste ou le créneau filtré).

![Page « Écrire aux bénévoles » : choix des destinataires (tous les inscrits, un poste, un créneau, la liste d'attente, les invités sans créneau) avec le nombre de personnes, le choix d'un modèle, puis l'objet et le message](/doc-img/admin-message.png)

Un email simple, à qui c'est utile :

- **tous les bénévoles inscrits** de l'événement ;
- **les bénévoles d'un poste** ;
- **les bénévoles d'un créneau** ;
- **les personnes en liste d'attente** (en attente ou à qui une place est proposée) ;
- **les invités sans créneau confirmé** : les membres invités à l'événement qui n'ont encore aucune inscription confirmée, y compris ceux qui ne sont qu'en liste d'attente (le compteur le précise), à l'exclusion des personnes ayant indiqué ne pas être disponibles (leur nombre est aussi précisé). Leur email contient leur lien d'invitation, **Choisir mes créneaux**. Le public est recalculé au moment de l'envoi.

Si des destinataires ont une adresse à vérifier (un précédent message leur a été définitivement refusé), l'aperçu et la confirmation le signalent avec leur nombre — un avertissement, l'envoi reste possible : l'adresse a pu être corrigée côté destinataire depuis.

Vous saisissez un objet et un message texte (les retours à la ligne sont conservés). Pour une information urgente, cochez **Envoyer aussi une notification (téléphone ou ordinateur)** : les destinataires qui ont activé les notifications la reçoivent en plus de l'email, qui part à tous dans tous les cas. Le formulaire indique combien d'appareils sont abonnés parmi les destinataires, et l'aperçu comme la confirmation le rappellent. La notification montre l'objet et la première ligne du message, et ouvre la page personnelle du bénévole (la page de l'événement pour la liste d'attente). Son résultat s'affiche à part de celui des emails dans les messages envoyés ; un appareil qui n'existe plus est retiré. Le nombre de destinataires s'affiche dès le choix ; **Voir l'aperçu et envoyer** montre l'email tel qu'il sera reçu, puis demande une confirmation avec le nombre de personnes. Chaque personne reçoit un seul email, avec ses créneaux concernés et le lien vers ses inscriptions ; l'envoi est noté dans le journal de l'événement. Pas d'éditeur HTML, de segments enregistrés ni de programmation : pour relancer les membres invités sans réponse, voir « Relancer les … sans créneau » dans les invitations.

**Modèles de messages** (**Paramètres** → **Modèles de messages**) : enregistrez les messages que vous envoyez souvent (infos pratiques, convocation, remerciements), jusqu'à 20 par organisation, avec un nom, un objet et un texte. Dans « Écrire aux bénévoles », **Partir d'un modèle** remplit l'objet et le message, que vous modifiez librement avant l'envoi. Variables, remplacées pour chaque destinataire : `{prénom}`, `{événement}`, `{poste}` (public « un poste » ou « un créneau ») et `{créneau}` (public « un créneau ») ; pour écrire une accolade, doublez-la (`{{`). Une variable inconnue ou hors de son public est signalée et bloque l'envoi, elle n'est jamais envoyée telle quelle. Les modèles appartiennent à l'organisation (tous ses événements) et figurent dans le journal d'activité.

**Messages envoyés** : sous le formulaire, chaque message déjà envoyé pour l'événement, du plus récent au plus ancien, avec la date et l'heure, qui l'a écrit, l'objet, le public choisi, le nombre de destinataires et la remise en toutes lettres (envoyés, en échec, en attente). **Voir le texte envoyé** affiche le message. Quand des emails ont échoué, **Renvoyer les emails en échec** les remet en file d'envoi, eux seuls ; un second clic n'en renvoie pas d'autres. Les destinataires ne sont pas listés, seulement leur nombre. Les emails automatiques (confirmations, rappels) n'y figurent pas. Les messages sont conservés 12 mois, puis supprimés ; ils le sont aussi avec l'événement.

### Rappel manuel

Depuis la page de l'événement, le bouton **Envoyer le rappel** permet d'envoyer un email de rappel à **tous les bénévoles inscrits** de l'événement.

Avant d'envoyer, rédiger un message dans la section « Message de rappel » (page d'édition de l'événement, `/admin/events/[id]/edit`). Ce message apparaîtra dans l'email, avec le récapitulatif des créneaux de chaque bénévole.

### Rappels automatiques

L'application envoie automatiquement des rappels :
- **J-2** (48 h avant le premier créneau du jour) : rappel avec détails des créneaux
- **J-1** (24 h avant le premier créneau du jour) : rappel court
- **Jour J** (2–4 h avant le premier créneau du jour) : rappel de dernière minute

Un bénévole inscrit sur plusieurs créneaux le même jour pour un même événement ne reçoit qu'un seul email par rappel (un seul J-2, un seul J-1, un seul rappel du jour), listant tous ses créneaux de ce jour-là dans l'ordre des horaires, plutôt qu'un email par créneau. S'il est aussi inscrit le même jour sur un autre événement, il reçoit un email séparé pour cet événement. Un créneau de nuit (qui se termine après minuit) compte sur son jour de début. Une inscription faite après l'envoi du rappel du jour (inscription tardive) reçoit son propre rappel, sans jamais en manquer ni en dupliquer un.

Ces rappels sont envoyés sans intervention de votre part pour les événements publiés, sauf ceux décochés pour toute l'organisation dans **Paramètres → Emails** (voir « Réglages des emails »).

### Notifications de modification

- **Annulation d'un créneau** → les bénévoles inscrits sont avertis automatiquement et leur inscription est annulée
- **Modification des horaires** → email envoyé aux bénévoles inscrits

---

## Exports

### Rapports

**`/admin/events/[id]/print`**, depuis la page de l'événement (**Rapports**). Des documents à imprimer ou enregistrer en PDF depuis le navigateur, chacun ouvert dans un nouvel onglet ; l'archive de l'événement se télécharge :

![Page « Rapports » d'un événement : les plannings à remettre aux bénévoles (par jour, par poste, individuel), puis la section réservée aux organisateurs, qui commence par l'export complet](/doc-img/admin-print.png)

| Document | Contenu | Pour qui |
|---|---|---|
| Planning par jour | pour chaque jour, la frise des postes avec les prénoms dans les créneaux, puis le détail avec les places libres | affichage, bénévoles |
| Planning par poste | une page par poste : sa frise, ses créneaux, ses bénévoles, son responsable de secteur | chaque responsable |
| Planning individuel | une page par bénévole : sa journée en frise, puis chaque créneau avec lieu de rendez-vous, contact et consignes | à remettre à l'arrivée |
| Export complet | le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles avec leurs coordonnées (en couleur) | organisateurs seulement (téléphones et emails) |
| Feuille de présence | par créneau, une case à cocher par bénévole (déjà cochée si la présence a été marquée dans l'application), heure d'arrivée, remarque, et des lignes vides pour les arrivées imprévues | organisateurs |
| Liste avec téléphones | tous les bénévoles par ordre alphabétique, téléphone, email et créneaux | organisateurs seulement |
| Synthèse des réponses | par question posée aux bénévoles, le nombre de réponses des confirmés et des personnes en attente, sans nom ni coordonnées (voir « Synthèse des réponses ») | organisateurs, ou pour passer commande |
| Archive de l'événement (JSON) | un fichier téléchargé avec toutes les données de l'événement : réglages, créneaux, inscriptions, pages, responsables, jalons et journal | vos archives, ou pour changer d'outil |

Sauf l'export complet, ces documents sont conçus pour le noir et blanc. La feuille de présence en CSV se télécharge depuis les inscriptions (voir « Présences le jour J »). Les heures planifiées des membres n'y figurent jamais ; les documents avec téléphones portent la mention « ne pas afficher ni distribuer ».

---

### Badges

Depuis **Rapports**, la section **Badges** imprime un badge d'identification par bénévole inscrit : prénom en grand et poste(s), toujours imprimés ; nom de famille et créneaux, cochés par défaut, peuvent être retirés. **Couleur du bandeau** : celle du poste (à défaut celle de l'événement), celle de l'événement, ou noir et blanc. Dix badges par feuille A4, à découper sur les pointillés. Filtre par **Poste**, et liste **Bénévole (réimpression)** pour réimprimer un badge perdu (deux homonymes y sont distingués par leur email) ; avec un poste choisi, seuls ses créneaux sur ce poste figurent sur le badge. Pas de photo ni de code QR : un badge peut être photographié ou perdu, il ne porte donc aucun lien vers les données du bénévole.

### Résumé de l'événement

Toujours depuis **Rapports**, la section **Résumé de l'événement** (juste avant l'archive) donne de quoi faire le bilan et préparer la prochaine édition : nombre de bénévoles distincts avec un créneau confirmé, dont ceux de retour et ceux pour la première fois (pas d'inscription active sur un événement antérieur de l'organisation) ; nombre de créneaux confirmés avec une présence enregistrée sur le total, avec une phrase explicite si le pointage n'a pas été utilisé ou seulement en partie ; heures planifiées (le total des créneaux confirmés) et, parmi elles, les heures attestées (présence enregistrée) — par exemple « 46 h planifiées, dont 38 h attestées » ; taux de remplissage global puis par poste, chiffres à l'appui (« 46 places occupées sur 52 ») ; la liste des créneaux restés incomplets. Tant que l'événement n'est pas terminé, un bandeau rappelle que ces chiffres sont provisoires. Mêmes règles de comptage que l'attestation de bénévolat et l'export « Heures par bénévole » : seules les inscriptions actives sur un créneau jamais annulé comptent.

## QR code

Depuis la page de l'événement → **QR code**, télécharger le QR code de la page publique de l'événement (formats PNG ou SVG). Pratique pour l'affichage en salle ou sur une affiche. Pour un partage en ligne (messagerie, email, réseau social), utilisez plutôt **Copier le lien** ou **Partager** (voir « Partager le lien »).

---

## Gérer l'équipe admin

**`/admin/settings/admins`**

Deux rôles :

- **Propriétaire** : tous les droits, dont l'équipe d'administration, les réglages de l'organisation (nom, titre public, adresse, fuseau horaire, charte, réglages des emails, masquer les **Premiers pas**) et la suppression définitive d'un événement archivé.
- **Organisateur** : événements (création, duplication, modification, publication, archivage), postes, créneaux, questions, pages personnalisées, responsables de secteur, jalons, inscriptions, demandes et présences, membres (import et export compris) et invitations, messages aux bénévoles et modèles de messages, rappel manuel, rapports et exports, journaux, et renvoi d'un email en échec. Il voit l'équipe et un résumé des réglages de l'organisation, sans pouvoir les changer ; la page le dit.

Dans les sections qui suivent, les réglages marqués **(réservé aux propriétaires)** ne sont modifiables que par un propriétaire.

Sur cette page, un propriétaire peut :

- voir la **liste** des administrateurs de votre organisation (actifs et invitations en attente) ;
- **inviter** un nouvel admin : saisir son nom et son email, et choisir son rôle (Organisateur par défaut). Un email d'invitation avec un lien d'activation est envoyé (lien valable 7 jours) ;
- **changer le rôle** d'un admin dans sa ligne ; le changement s'applique aussitôt, y compris à ses sessions ouvertes ;
- **retirer** un admin. Il est impossible de se retirer soi-même ou de retirer le dernier admin actif, et l'organisation garde toujours au moins un propriétaire actif.

---

## Emails

### Réglages des emails

**Paramètres → Emails** (`/admin/settings/notifications`) commence par les réglages de l'organisation (réservé aux propriétaires ; un organisateur n'y voit que l'adresse de réponse) :

- **Rappels automatiques** : cochez ou décochez le rappel J-2, le rappel J-1 et le rappel du jour pour toute l'organisation.
- **Prévenir les administrateurs à chaque inscription** : l'email envoyé à chaque administrateur actif quand un bénévole s'inscrit depuis la page publique.
- **Prévenir en cas de désistement** : réglage séparé du précédent, coché par défaut. Quand un bénévole annule une place confirmée ou une demande, un email part aux administrateurs actifs et aux responsables du poste concerné : qui se désiste, de quel créneau, combien de places manquent désormais, si la liste d'attente a repris la place, et le mot laissé par le bénévole le cas échéant (300 caractères maximum, jamais conservé une fois l'email envoyé). Quitter la liste d'attente ou refuser une place proposée ne prévient personne : rien à décider dans ces cas. Décoché, ni les administrateurs ni les responsables ne reçoivent cet email.
- **Adresse de réponse** : quand un bénévole répond à un email de l'application, sa réponse arrive à cette adresse (vide : l'adresse par défaut de la plateforme). Elle figure aussi sur la page personnelle des bénévoles (« Écrire à l'organisation »).
- **Résumé quotidien des adresses à vérifier** : coché par défaut. Un email par jour aux administrateurs actifs, seulement quand une confirmation, une proposition de liste d'attente ou un rappel a échoué définitivement depuis la veille — jamais pour un incident temporaire seul, et jamais plus d'un par jour même si plusieurs échecs se sont produits.
- **M'envoyer un email de test** : un email à votre propre adresse, avec les réglages enregistrés, pour vérifier l'expéditeur, l'adresse de réponse et le rendu (cinq par heure au plus).

Les textes personnalisables restent par événement : instructions publiques, message de confirmation et message de rappel dans les réglages de l'événement.

### Emails envoyés

La même page liste les emails de l'organisation des plus récents aux plus anciens : date, type (confirmation, rappel, message aux bénévoles…), destinataire et état :

- **En attente d'envoi** : mis en file, part dans la minute ;
- **Nouvel essai prévu** : le premier envoi a échoué pour une cause temporaire (incident chez notre serveur d'envoi, boîte pleine, délai dépassé…), l'application réessaie toute seule (jusqu'à six fois, à intervalles croissants) ;
- **Envoyé** : parti, avec l'heure ;
- **Échec définitif** : soit six essais temporaires épuisés, soit un rejet permanent du serveur destinataire (boîte inexistante, adresse refusée) qui arrête les essais tout de suite : ça ne sert à rien de réessayer une adresse qui n'existe pas. Dans les deux cas, une phrase en français explique la cause et le bouton **Renvoyer** remet l'email en file.

**Ce que « accepté par le serveur d'envoi » veut dire, et ce que ça ne veut pas dire** : quand un envoi réussit, la seule chose prouvée est que notre propre serveur d'envoi (le relais SMTP) a accepté le message. Ce n'est ni une preuve de remise dans la boîte du destinataire, ni, à plus forte raison, une preuve de lecture : un relais de messagerie accepte en général toute adresse externe à la première étape, et n'apprend que plus tard, par un rebond invisible pour l'application, qu'une boîte n'existe pas. Un **rejet permanent** affiché ici reste donc la source la plus fiable aujourd'hui pour repérer une adresse à corriger, mais il ne couvre pas tous les cas : si un message a été accepté, l'application ne peut pas dire s'il a réellement atteint la bonne personne.

Un rejet permanent sur l'adresse actuelle d'un membre se retrouve aussi, sans avoir à parcourir cette page, sur sa fiche et dans la liste des membres (« Adresse à vérifier », voir **Gérer les membres**) : même donnée, lue depuis l'endroit où vous corrigez l'adresse.

Les emails envoyés sont effacés chaque nuit (ils contiennent des données personnelles) ; ceux en échec restent 30 jours, comme le résultat détaillé de chaque envoi (destinataire concerné, type de message, résultat, raison), conservé pour la même durée. Les 200 plus récents sont affichés.

## Exporter et conserver ses données

Vos données vous appartiennent et sortent de l'application à tout moment, sans demande :

| Export | Où | Format |
|---|---|---|
| Un événement complet (réglages, créneaux, inscriptions avec les bénévoles, pages, responsables, jalons, journal) | page de l'événement → **Rapports** → **Archive de l'événement (JSON)** | JSON |
| Tous les membres (étiquettes, disponibilités, notes, nombre d'inscriptions, membres désactivés compris) | **Membres** → **Exporter les membres (CSV)** | CSV |
| Le journal d'activité de l'organisation | **Paramètres** → **Journal d'activité** → **Exporter tout le journal (CSV)** | CSV |
| Le planning, la liste des bénévoles, les feuilles à imprimer | **Rapports** de l'événement | PDF (depuis le navigateur) |
| La feuille de présence | **Inscriptions** de l'événement → **Exporter les présences (CSV)** | CSV |

Les fichiers CSV s'ouvrent tels quels dans Excel ou LibreOffice (UTF-8, point-virgule). Une valeur qui commence par `=`, `+`, `-` ou `@` (un numéro `+41…`, par exemple) y est précédée d'une apostrophe : le tableur l'affiche comme du texte au lieu de l'exécuter comme une formule. Les archives ne contiennent jamais de lien personnel ni de jeton d'accès.

**Durées de conservation** :

<!-- retention:start (généré depuis src/lib/retention.ts, npm run retention:docs) -->
| Données | Conservation |
|---|---|
| Membres, événements, créneaux, inscriptions (dont la preuve d'acceptation de la convention des bénévoles pour une inscription publique : empreinte du texte accepté et date, #569), versions de la convention déjà montrées à des bénévoles (texte par empreinte, #569), pages, journaux d'activité, comptes administrateurs, doublons possibles ignorés (#601) de l'organisation | tant que l'organisation est active, événements passés compris ; effacés 30 jours après sa désactivation (délai compté depuis la dernière modification de l'organisation désactivée) |
| Événement supprimé par un administrateur | effacé immédiatement, avec ses créneaux, inscriptions, invitations, réponses aux questions, responsables, pages, jalons, messages ciblés et son journal |
| Organisation supprimée par l'opérateur de benevol.app | effacée immédiatement, avec ses membres et ses administrateurs |
| Fiche absorbée par une fusion de membres (#600) : fiche inactive sans donnée personnelle (« mergedIntoId »), le temps que les anciens identifiants restent résolus | 30 jours après la fusion |
| Membres retirés, inscriptions annulées ou refusées, questions archivées | tant que l'organisation existe (tant que leur événement existe pour les inscriptions et les questions) : pas d'effacement individuel |
| Emails en file d'envoi (destinataire et contenu) | effacés chaque nuit une fois partis ; ceux en échec 30 jours après leur mise en file |
| Résultats d'envoi par destinataire (#598) : statut accepté/rejeté/échec, motif normalisé, codes, empreinte de l'adresse | 30 jours |
| Messages ciblés (objet, texte, public, nombres) | 365 jours, ou avec l'événement |
| Invitations d'administrateur non acceptées | effacées 30 jours après leur dernier envoi |
| Administrateur retiré de l'équipe | effacé immédiatement |
| Bénévoles sans organisation ni inscription | effacés au nettoyage suivant |
| Sauvegardes chiffrées de la base | 30 jours sur le serveur, 90 jours en copie hors site |
<!-- retention:end -->

Une donnée effacée reste dans les sauvegardes chiffrées jusqu'à leur rotation (voir la dernière ligne).

**Supprimer une organisation** : exportez d'abord ce que vous voulez garder, puis demandez la désactivation à l'administrateur de la plateforme (adresse de contact en bas de page). L'organisation devient inaccessible immédiatement ; ses données sont effacées définitivement par le nettoyage automatique 30 jours plus tard, sauvegardes comprises à l'issue de leur propre délai. Pendant ces 30 jours, une réactivation reste possible.

## Journal d'activité de l'organisation

**`/admin/settings/activity`**

Liste chronologique de ce qui concerne l'organisation plutôt qu'un événement précis :

- les **membres** : création, modification, désactivation, import ;
- les **comptes admin** : invitation, changement de rôle, retrait ;
- les **emails** : un email en échec remis en file d'envoi ;
- l'**organisation** : modification des réglages des emails ;
- les **modèles de messages** créés, modifiés ou supprimés.

**Filtrer par type** restreint la liste aux **Membres**, **Comptes admin**, **Emails** ou **Organisation** ; les modèles de messages n'apparaissent qu'avec **Tous les types**. **Exporter tout le journal (CSV)** télécharge le journal complet. Indépendant du journal par événement.

---

## Nom et adresse de l'organisation

**`/admin/settings/admins`** → sections **Nom de l'organisation** et **Identifiant public (slug)** (réservé aux propriétaires)

- **Nom de l'organisation** : 2 à 100 caractères. Affiché dans l'administration, dans les emails et au-dessus du titre de la page publique.
- **Identifiant public** : l'adresse de votre espace (`identifiant.benevol.app`), 2 à 40 caractères : lettres minuscules, chiffres et tirets, sans tiret au début ni à la fin. Si des événements sont publiés, une confirmation est demandée avant le changement. Après l'enregistrement, vous êtes redirigé(e) vers la nouvelle adresse.
- **Anciens identifiants** : ils continuent de rediriger vers l'adresse actuelle, pour que les liens déjà partagés fonctionnent. **Supprimer** un ancien identifiant arrête cette redirection : les liens qui l'utilisent ne fonctionnent plus.

---

## Titre de la page publique

**`/admin/settings/admins`** → section **Titre de la page publique** (réservé aux propriétaires)

Le titre affiché en haut de la page publique de vos événements (l'adresse de votre organisation, sans nom d'événement). Par défaut : « Bénévoles ». Saisissez le texte de votre choix (2 à 100 caractères) puis **Enregistrer** ; le même texte devient le titre de l'onglet du navigateur. Le nom de l'organisation reste affiché juste au-dessus. **Rétablir « Bénévoles »** revient au titre par défaut. Ce titre ne s'applique pas aux pages d'événement, qui gardent le titre de l'événement.

---

## Fuseau horaire

**`/admin/settings/admins`** → section **Fuseau horaire** (réservé aux propriétaires)

Les heures des créneaux sont des heures locales : ce réglage indique dans quel fuseau les lire. Il sert à envoyer les rappels au bon moment, à indiquer l'heure limite d'une place proposée en liste d'attente, et à afficher les heures du journal de l'événement et des **Rapports**. Par défaut, c'est le fuseau de la plateforme (Europe/Zurich) ; choisissez-en un autre si vos événements ont lieu ailleurs, puis **Enregistrer**. Changer de fuseau ne modifie pas les heures affichées des créneaux, mais décale le moment où leurs rappels partent.

---

## Charte du bénévole

Dans l'interface, la charte s'appelle « Convention des Bénévoles ».

**`/admin/settings/admins`** → section **Convention des Bénévoles** (réservé aux propriétaires)

La charte est le texte que les bénévoles doivent lire et accepter avant de finaliser leur inscription. Un texte par défaut est fourni ; vous pouvez le personnaliser librement ou le réinitialiser.

- Le commutateur **Assurance RC fournie par l'organisation** choisit la variante du texte par défaut : couverture par l'assurance responsabilité civile de l'organisation, ou couverture accidents personnelle à la charge de chaque bénévole. Changer le commutateur remplace le texte affiché dans la zone de saisie par la variante correspondante ; les modifications non enregistrées sont perdues.
- Modifier le texte dans la textarea et cliquer sur **Enregistrer**
- Cliquer sur **Réinitialiser la convention par défaut** pour revenir au texte standard

Dans le formulaire d'inscription, les bénévoles cochent la case « J'ai lu et j'accepte la convention des bénévoles ». Le lien « convention des bénévoles » ouvre une fenêtre « Convention des Bénévoles » avec le texte complet et un bouton « J'ai lu et j'accepte », qui coche la case.

Chaque inscription faite par ce formulaire garde la preuve que la personne a accepté la convention : quel texte exactement (le vôtre, ou le texte par défaut dans sa variante d'assurance) et à quelle date. Elle apparaît sous l'inscription, dans la liste **Inscriptions** de l'événement : « Convention acceptée le 5 octobre 2026 à 14h32 (version en vigueur) », à l'heure de votre organisation. Si vous avez modifié la convention depuis, la ligne dit « version précédente » avec le début de l'empreinte de l'ancien texte. Une inscription ajoutée à la main par un administrateur n'en a pas : personne n'a accepté quoi que ce soit dans ce cas. Les inscriptions plus anciennes que cette preuve n'en ont pas non plus.

---

## Vue publique

Le lien **Vue publique ↗** (visible uniquement si l'événement est publié) ouvre la page telle qu'un bénévole la voit, dans un nouvel onglet. Pratique pour vérifier l'affichage avant de partager.

---

## Questions fréquentes

**Un bénévole inscrit sur plusieurs créneaux le même jour reçoit beaucoup de rappels.**
Ce n'est plus le cas : les rappels sont regroupés par bénévole, par événement et par jour (voir « Rappels automatiques »). Une personne inscrite sur trois créneaux d'une même journée reçoit un seul email à J-2, un seul à J-1 et un seul le jour même, listant ses trois créneaux. Si elle est aussi inscrite le même jour sur un autre événement, elle reçoit un email séparé pour celui-ci. Pour envoyer moins de rappels encore, décochez ceux qui ne vous servent pas dans **Paramètres → Emails** (voir « Réglages des emails ») : le réglage vaut pour toute l'organisation.

**Une personne s'est inscrite avec une adresse email mal saisie et a maintenant deux fiches.**
Quand un email lui est définitivement refusé, sa fiche porte l'étiquette **Adresse à vérifier** : corrigez l'adresse depuis sa fiche. Si une seconde fiche a été créée, la page **Doublons possibles** la propose à côté de la première, avec les raisons du rapprochement ; le propriétaire de l'organisation peut alors **fusionner** les deux fiches, avec un aperçu de tout ce qui sera déplacé avant de confirmer (voir « Doublons possibles » et « Fusionner deux fiches en double »).

**Les bénévoles aimeraient savoir qui est déjà inscrit sur un créneau.**
La page publique d'un événement n'affiche aucun nom : elle montre les places libres, jamais les personnes inscrites. Pour qu'une personne suive l'équipe d'un poste, faites-en un·e responsable de secteur (voir « Responsables de secteur ») : son lien personnel affiche qui est inscrit sur son poste.

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
