# Fonctionnalités

Liste exhaustive des fonctionnalités de l'application.

---

## Côté public (bénévoles)

### Page d'accueil
- Liste des événements publiés avec titre, dates et lieu
- Accès direct à la page d'inscription de chaque événement

### Page d'inscription (`/events/[slug]`)
- Planning visuel par jour sous forme de **timeline Gantt**
  - Regroupement par rôle (une ligne par rôle)
  - Libellé spécifique affiché sous chaque barre lorsqu'il diffère du rôle
  - Bandes colorées en fond représentant le programme des spectacles
  - Séparateurs visuels entre créneaux adjacents du même rôle
- **Sélection multi-créneaux** par clic sur les barres
- **Détection de conflits en temps réel** : les créneaux qui se chevauchent avec une sélection ou une inscription existante sont grisés automatiquement
- Affichage du statut de chaque créneau : ouvert, complet, fermé
- Récapitulatif des créneaux sélectionnés sous le planning
- Bouton d'action fixe en bas d'écran pour passer à l'étape suivante
- Indice de défilement horizontal sur mobile
- Reconnexion automatique à une session existante (via `localStorage`)
  - Affichage du nom du bénévole en haut de page
  - Bouton « Quitter la session »
  - Si le formulaire est soumis et qu'une session existe déjà pour cet email, les créneaux existants sont chargés et les conflits mis en évidence automatiquement

### Formulaire d'inscription
- Champs : prénom, nom, email, téléphone (optionnel), commentaire (optionnel)
- Pré-remplissage automatique si une session est reconnue
- Case de consentement obligatoire
- Validation côté client et côté serveur

### Confirmation et gestion (`/my/[token]`)
- Page de succès avec lien personnel vers la gestion de l'inscription
- Envoi automatique d'un email de confirmation avec récapitulatif des créneaux
- Page de gestion : liste de toutes les inscriptions actives du bénévole pour l'événement
- Annulation individuelle d'un créneau depuis la page de gestion

---

## Côté administrateur (`/admin`)

### Authentification
- Connexion par email + mot de passe (hashé bcrypt)
- Session sécurisée (NextAuth v5)
- Déconnexion

### Gestion des événements
- Création, édition et suppression d'événements
- Champs : titre, slug, dates, lieu, description, instructions publiques, message de confirmation
- **Publication / dépublication** en un clic (statut `draft` / `published`)
- Vue de synthèse par événement : nombre de créneaux, places totales, inscrits, places restantes
- Lien direct vers la vue publique de l'événement

### Programme des spectacles
- Ajout, édition et suppression de plages de spectacles par jour
- Sauvegarde automatique avec délai (debounce)
- Affichage en fond coloré sur la timeline publique et dans les exports

### Gestion des créneaux (`/admin/events/[id]/shifts`)
- Ajout de créneaux avec : rôle, libellé, date, horaires, capacité, statut
- Icônes colorées par rôle (palette prédéfinie avec correspondance automatique)
- Autocomplétion des rôles existants (datalist)
- Modification et suppression de créneaux
- Ordre d'affichage personnalisable
- Changement de statut : ouvert → fermé → complet → annulé

### Suivi des inscriptions (`/admin/events/[id]/registrations`)
- Vue tabulaire : bénévole, créneau, horaires, commentaire, source, date
- Annulation d'une inscription individuelle

### Exports
#### Excel (`.xlsx`)
- Un onglet par jour
- Gantt : rôles × tranches de 30 minutes, noms des bénévoles dans les cellules
- Les créneaux de même `(rôle, libellé)` sont fusionnés sur une seule ligne Gantt
- Plages des spectacles en fond coloré (ligne dédiée sous les créneaux)
- Tableau récapitulatif : rôle, libellé, horaires, capacité, inscrits, liste des bénévoles
- Onglet « Inscriptions » avec toutes les données détaillées
- Bénévoles triés alphabétiquement par prénom, un par ligne

#### PDF (impression navigateur)
- Même structure Gantt + récapitulatif, optimisée A4 paysage
- Plages des spectacles affichées dans le Gantt
- Tableau complet des inscriptions en fin de document
- Bouton « Imprimer / Enregistrer en PDF »

---

## Notifications email

- **Email de confirmation bénévole** : récapitulatif des créneaux inscrits + lien de gestion
- **Notification admin** (optionnelle, configurable) : alerte à chaque nouvelle inscription
- Transport SMTP configurable (tout fournisseur compatible)

---

## Infrastructure

- Next.js App Router avec rendu hybride (SSR + client)
- API REST séparée public / admin
- Base de données PostgreSQL avec Prisma ORM
- Migrations versionnées
- Déploiement Docker (Compose ou image standalone)
- Déploiement Kubernetes avec init container pour les migrations
- CI/CD GitHub Actions : build, push image GHCR, déploiement automatique
