# Guide administrateur

Ce guide couvre l'utilisation quotidienne de l'interface d'administration : créer un événement, configurer les créneaux, inviter des membres, suivre les inscriptions et exporter les données.

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

---

## Configurer les créneaux

**`/admin/events/[id]/shifts`**

Un créneau correspond à un poste de bénévolat sur une plage horaire précise.

### Ajouter un créneau

| Champ | Description |
|-------|-------------|
| Poste (rôle) | Intitulé générique (ex. : `Accueil`). Les créneaux du même rôle sont regroupés sur la même ligne du planning. |
| Libellé | Intitulé spécifique (ex. : `Entrée principale`). Laisser vide si identique au rôle. |
| Date | Jour du créneau |
| Horaires | Heure de début et de fin, de `00:00` à `23:59` |
| Capacité | Nombre maximum de bénévoles |
| Statut | `Ouvert`, `Complet`, `Fermé`, `Annulé` |

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

---

## Configurer le programme des spectacles

Dans la page d'édition de l'événement (**`/admin/events/[id]/edit`**), section **Programme des spectacles**.

Chaque entrée définit une plage horaire qui apparaît en fond coloré sur la timeline, permettant aux bénévoles de visualiser quand ils travaillent par rapport aux spectacles.

Champs : **Nom du spectacle**, **Date**, **Heure de début**, **Heure de fin**.

---

## Publier un événement

Depuis la page de l'événement (`/admin/events/[id]`), cliquer sur **Publier**.

L'événement devient alors visible à l'URL :

```
https://[site]/[slug-organisation]/[slug-evenement]
```

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

Depuis la page principale de l'événement (`/admin/events/[id]`) :
- **Récap global** : créneaux, places totales, inscrits, places restantes
- **Créneaux critiques** : liste des créneaux encore ouverts avec des places disponibles

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
