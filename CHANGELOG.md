# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.0.0-beta.2] — 2026-04-26

### Ajouté

- **Réordonnancement des postes** : panneau glisser-déposer dans la gestion des créneaux pour changer l'ordre des lignes dans les timelines admin et publique ; persisté via le champ `displayOrder` sur les créneaux (API `POST /api/admin/events/[id]/reorder-roles`)
- **Navigation créneaux → inscriptions** : bouton « Voir les inscriptions → » dans le popover de chaque créneau ; la page d'inscriptions s'ouvre pré-filtrée sur le créneau et le rôle correspondants
- **Détection de conflits contextuelle à l'ajout manuel** : le message d'avertissement n'apparaît que si le créneau sélectionné dans le formulaire est déjà pris ou en conflit horaire avec les inscriptions existantes du bénévole identifié par son email

### Amélioré

- **Affichage des places libres** : les barres de la timeline admin affichent désormais `X/Y · Z libre(s)` ; la vue liste montre une sous-ligne colorée (vert = places disponibles, orange = complet)
- **Saisie des horaires** : les champs Début/Fin acceptent une saisie partielle (`9` → `09:00`, `14:3` → `14:30`, `21` → `21:00`)
- **Ordre des rôles** : les deux timelines (admin et publique) respectent le `displayOrder` des créneaux pour l'ordre des lignes de rôle

### Corrigé

- Le champ `displayOrder` est désormais transmis depuis l'API publique jusqu'au composant `DayTimeline`, garantissant que l'ordre admin se reflète côté bénévole

---

## [1.0.0-beta.1] — 2026-04-24

Première version bêta publique. Toutes les fonctionnalités de base sont stables.

### Fonctionnalités

- **Timeline publique** : planning Gantt interactif par jour avec scroll horizontal sur mobile
  - Positionnement pixel-exact avec échelle dynamique (calculée à partir du créneau le plus large)
  - Sélection multi-créneaux, détection de conflits en temps réel, affichage du statut
  - Bandes colorées en fond pour le programme des spectacles
- **Inscription bénévole** : formulaire avec validation, consentement, session persistante via `localStorage`
- **Gestion personnelle** (`/my/[token]`) : consultation et annulation de ses inscriptions
- **Interface admin** : CRUD complet des événements, créneaux et programme des spectacles
  - Publication / dépublication en un clic
  - Pré-sélection automatique du créneau filtré lors d'un ajout manuel
  - Suivi des inscriptions en temps réel
- **Exports** : Excel (`.xlsx`) et PDF avec Gantt + tableaux récapitulatifs
- **Emails** : confirmation bénévole + notification admin optionnelle (SMTP Nodemailer)
- **Auth admin** : NextAuth v5, credentials, session sécurisée
- **CI/CD** : GitHub Actions → build Docker → déploiement Kubernetes automatique

### Infrastructure

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4
- PostgreSQL 16 + Prisma 7 (driver `@prisma/adapter-pg`)
- Node.js 22 requis
- Déploiement Docker Compose et Kubernetes (manifestes inclus)
- Init container pour migrations automatiques au démarrage

### Corrections notables

- Scroll horizontal mobile : passage d'un positionnement en % (qui ne scrollait pas) à des pixels absolus
- Auth derrière reverse proxy : `AUTH_TRUST_HOST` + `AUTH_URL` pour NextAuth v5
- Token Prisma WASM dans l'image Docker standalone
- Contrainte unique `editToken` lors d'inscriptions multi-créneaux

---

## [0.1.0] — 2026-04-10

MVP initial : schéma BDD, page publique, interface admin, exports, CI/CD.
