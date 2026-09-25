# Guide administrateur

Bienvenue ! Ce guide couvre tout ce qu'il faut pour faire tourner un événement de A à Z : créer l'événement, poser les créneaux, inviter les membres de votre pool, suivre les inscriptions en direct, et les fonctionnalités qui font gagner du temps le jour J — pages personnalisées, responsables de secteur, jalons, journaux d'activité.

Rien de sorcier : chaque section ci-dessous correspond à un écran de l'admin, dans l'ordre où vous les rencontrerez en montant un événement. Une question sans réponse ici ? La FAQ tout en bas couvre les cas un peu moins courants.

---

## Se connecter

Accéder à `/admin/login` et saisir les identifiants administrateur.

Si vous avez reçu un **lien d'invitation** (email « Invitation à rejoindre… »), cliquez sur le bouton « Créer mon compte » dans l'email pour définir votre mot de passe avant votre première connexion.

**Mot de passe oublié ?** Depuis la page de connexion, utilisez le lien de réinitialisation (`/admin/forgot-password`) : un email contenant un lien de réinitialisation vous est envoyé.

---

## Tableau de bord

**`/admin/dashboard`**

Vue d'ensemble de votre organisation : nombre d'événements (publiés et à venir), bénévoles inscrits, taux de remplissage global (places occupées sur places disponibles) et répartition des membres (total, avec email, sans email : ces derniers ne peuvent pas recevoir d'invitations).

---

## Créer un événement

**`/admin/events/new`**

| Champ | Description |
|-------|-------------|
| Titre | Nom affiché publiquement |
| Slug | Identifiant URL (`festival-2025`) — généré automatiquement, modifiable |
| Dates | Date de début et de fin de l'événement |
| Lieu | Affiché sur la page publique |
| Description | Texte libre (usage interne) |
| Instructions publiques | Message visible en haut de la page d'inscription |
| Message de confirmation | Texte affiché sur la page de succès après inscription |

L'événement est créé en **brouillon** (`draft`) — il n'est pas visible du public tant qu'il n'est pas publié.

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
| Âge minimum (optionnel) | Condition d'âge pour ce poste (ex. : `18` pour un poste avec permis de conduire). Affiché en info sur le planning public ; vérifié à l'inscription — voir « Âge minimum sur un poste » ci-dessous. |

#### Horaires et nuit

L'horloge va de `00:00` à `23:59` : on ne saisit jamais `24:00`, `25:00` ou `26:00`, l'horloge repart à zéro après minuit.

- **Créneau qui passe minuit** : saisissez une heure de fin plus petite que le début, par exemple `22:00` à `02:00`. Il est affiché « 22h–02h +1 » sur le planning.
- **Créneau qui commence après minuit** : il appartient au jour suivant. Créez-le à la date du lendemain, à `00:00`, `01:00`, etc.
- Un créneau qui se termine exactement à minuit s'écrit avec `00:00` comme fin (`22:00` à `00:00`).
- Les heures invalides (`26:00`, `-2:30`, `12:75`) sont refusées avec un message. Sur le planning administrateur, glisser une barre ne permet pas de sortir de la journée.

### Activer la liste d'attente

Cochez **Activer la liste d'attente** dans le formulaire du créneau (ou dans le popover de la timeline admin). Quand le créneau est complet, les bénévoles peuvent s'y inscrire ; une place libérée déclenche automatiquement l'envoi d'un email à la première personne en attente, avec un lien de confirmation valable **24 heures**. Passé ce délai sans réponse, la place est proposée à la personne suivante.

La vue des inscriptions (`/admin/events/[id]/registrations`) affiche les bénévoles en attente (`En attente`) et ceux à qui une place a été proposée (`Offerte`).

### Réordonner les postes

Le bouton **Réordonner les postes** ouvre un panneau glisser-déposer. L'ordre défini ici s'applique à la timeline admin **et** à la page publique.

### Âge minimum sur un poste

Un poste peut exiger un âge minimum (majorité, permis de conduire, qualification…). Une fois renseigné dans le formulaire du créneau, il est affiché en petit sur le planning public (ex. « 18+ »). Le créneau reste sélectionnable — l'âge du bénévole n'est pas connu avant qu'il remplisse le formulaire — mais l'inscription lui demande alors sa date de naissance et est refusée si la condition n'est pas remplie.

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
- Depuis la page des inscriptions, le bouton **Rendre responsable** sur une ligne propose directement le poste de ce créneau

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

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**.

L'événement devient alors visible à l'URL :

```
https://[slug-organisation].benevol.app/[slug-evenement]
```

Le slug de l'organisation est un sous-domaine, pas un chemin — chaque organisation a sa propre adresse.

Le lien **Vue publique ↗** apparaît sur la page admin dès que l'événement est publié.

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

Depuis la page principale de l'événement (`/admin/events/[id]`) :
- **Récap global** : créneaux, places totales, inscrits, places restantes
- **Créneaux critiques** : liste des créneaux encore ouverts avec des places disponibles

---

## Journal de l'événement

**`/admin/events/[id]/log`**

L'historique complet de ce qui s'est passé sur un événement : créneaux créés/modifiés, inscriptions, annulations, pages ajoutées, responsables désignés, jalons… Trois modes :

- **Explorer** : liste filtrable par type, action, personne ou période
- **Rejouer** : reconstitue l'état d'un créneau ou d'une inscription à un instant donné
- **Récit** : raconte en une phrase la suite des événements liés (ex. une annulation qui déclenche une offre de liste d'attente)

Le contenu des pages personnalisées et les coordonnées des bénévoles n'apparaissent jamais dans le journal — seuls les champs modifiés sont indiqués.

---

## Gérer les membres

**`/admin/members`**

Le répertoire des membres est le pool de bénévoles connus de votre organisation.

- **Ajouter** un membre : prénom, nom, email, téléphone, tags, notes internes
- **Modifier** ou désactiver un membre existant
- **Importer** des membres en masse : bouton **Importer CSV/Excel** (fichiers `.csv` ou `.xlsx`). Les colonnes sont reconnues par leur intitulé (prénom, nom, email, téléphone, tags ; par exemple `prenom`, `courriel`, `mobile`, `groupes`). Plusieurs tags dans une cellule se séparent par `,`, `;` ou `|`. Le résultat indique le nombre de membres créés, mis à jour et ignorés ; les lignes en erreur sont listées avec leur numéro (50 au maximum affichées).
- **Rechercher** par texte libre ou filtrer par tag
- **Trier** par prénom ou par nom : cliquer sur l'en-tête de colonne (croissant → décroissant → reset)

---

## Inviter des membres à un événement

**`/admin/events/[id]/invitations`**

Les invitations permettent d'envoyer des emails personnalisés aux membres de votre liste, avec un lien pré-rempli vers la page d'inscription.

### Envoyer des invitations

1. Cliquer sur **+ Inviter des membres**
2. Sélectionner les membres par nom ou par tag
3. Optionnel : ajouter un message personnalisé (visible dans l'email)
4. Cliquer sur **Envoyer les invitations**

Chaque membre reçoit un email avec un lien unique qui pré-remplit son prénom, nom, email et téléphone sur la page d'inscription.

### Suivre l'état des invitations

Le tableau affiche pour chaque membre invité :
- **✅ Inscrit** — avec le ou les créneaux choisis
- **⏳ Pas encore répondu**

Les compteurs en haut récapitulent : total invités · inscrits · sans réponse.

### Relancer les non-inscrits

Le bouton **Relancer les non-inscrits** envoie un rappel à tous les membres invités qui ne sont pas encore inscrits. Un message personnalisé optionnel peut être ajouté.

---

## Communications bénévoles

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

### Export PDF (impression)

- **3 sections** : Planning (Gantt par jour), Récap par poste, Liste des bénévoles
- Cliquer sur **Imprimer / Enregistrer en PDF**

---

## QR code

Depuis la page de l'événement → **QR code**, télécharger le QR code de la page publique de l'événement (formats PNG ou SVG). Pratique pour l'affichage en salle ou sur une affiche.

---

## Gérer l'équipe admin

**`/admin/settings/admins`**

- **Liste** des administrateurs de votre organisation (actifs et invitations en attente)
- **Inviter** un nouvel admin : saisir son nom et email → un email d'invitation avec lien d'activation est envoyé (lien valable 7 jours)
- **Retrait** d'un admin (impossible de se retirer soi-même ou de retirer le dernier admin actif)

---

## Journal d'activité de l'organisation

**`/admin/settings/activity`**

Liste chronologique et filtrable des changements sur les membres et les comptes admin (création, modification, désactivation d'un membre ; invitation, retrait d'un compte admin). Indépendant du journal par événement — les membres et comptes admin appartiennent à l'organisation, pas à un événement précis.

---

## Titre de la page publique

**`/admin/settings/admins`** → section **Titre de la page publique**

Le titre affiché en haut de la page publique de vos événements (l'adresse de votre organisation, sans nom d'événement). Par défaut : « Bénévoles ». Saisissez le texte de votre choix (2 à 100 caractères) puis **Enregistrer** ; le même texte devient le titre de l'onglet du navigateur. Le nom de l'organisation reste affiché juste au-dessus. **Rétablir « Bénévoles »** revient au titre par défaut. Ce titre ne s'applique pas aux pages d'événement, qui gardent le titre de l'événement.

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
Le bloc **Créneaux critiques** sur la page de l'événement liste en direct tous les créneaux encore ouverts avec des places libres, tous postes confondus — pas besoin d'éplucher le planning entier la veille pour repérer ce qui manque.

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
