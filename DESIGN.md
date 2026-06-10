---
name: Benevol
description: Outil communautaire de gestion de bénévoles pour événements
colors:
  action-blue: "#2563eb"
  action-blue-deep: "#1d4ed8"
  action-blue-tint: "#eff6ff"
  ink-primary: "#111827"
  ink-secondary: "#1f2937"
  ink-muted: "#4b5563"
  ink-subtle: "#6b7280"
  ink-ghost: "#9ca3af"
  surface-page: "#f9fafb"
  surface-card: "#ffffff"
  surface-hover: "#f3f4f6"
  border-default: "#e5e7eb"
  border-input: "#d1d5db"
  status-active-bg: "#dcfce7"
  status-active-text: "#15803d"
  status-full-bg: "#dbeafe"
  status-full-text: "#1d4ed8"
  status-cancelled-bg: "#fee2e2"
  status-cancelled-text: "#b91c1c"
  status-waiting-bg: "#fef3c7"
  status-waiting-text: "#92400e"
  status-offered-bg: "#ede9fe"
  status-offered-text: "#3730a3"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-deep}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Benevol

## 1. Overview

**Creative North Star: "Le carnet de terrain"**

Benevol est un outil qu'on sort sous la pression d'un événement : à 7h du matin le jour J, sur téléphone, avec des bénévoles qui arrivent en retard. Ce n'est pas une interface qu'on contemple — c'est un outil qu'on consulte vite et qu'on pose. Chaque décision visuelle part de cette scène : l'information doit être lisible d'un coup d'œil, les actions doivent être immédiatement trouvables, et rien ne doit se mettre entre l'organisateur et sa réponse.

Le système est délibérément sobre. La couleur est réservée à l'action et au statut, jamais à la décoration. La typographie est le système sans-serif natif du navigateur — choisir une police web serait ajouter un chargement pour zéro gain expressif sur une interface de gestion. L'espacement crée le rythme ; les bords arrondis signalent la douceur sans chercher à être mignons.

Ce système s'interdit explicitement l'esthétique SaaS corporate : pas de hero-metrics, pas de gradient en arrière-plan, pas de dark mode obsidien pour faire « dev-centric », pas de motion qui distrait. Le design s'efface. Le travail des organisateurs et des bénévoles passe devant.

**Key Characteristics:**
- Hiérarchie forte, densité contrôlée
- Chrome minimal — les bordures font le travail des ombres
- Couleur = action + statut, jamais décoration
- Radius généreux (12–16px) sans être ludique
- Système sans-serif natif : pas de chargement web font pour une interface utilitaire

## 2. Colors: La Palette Carnet

Un bleu d'action unique sur fond blanc/gris très clair. Les couleurs sémantiques de statut sont les seules exceptions au principe de sobriété.

### Primary
- **Bleu Décision** (`#2563eb`): La seule couleur vraiment « vivante » du système. Réservée aux boutons primaires, liens actifs, indicateurs de focus, état sélectionné. Sa rareté est sa puissance : si tout est bleu, rien ne l'est.

### Secondary
- **Bleu Décision Profond** (`#1d4ed8`): État hover/active du bleu primaire. Jamais utilisé en état de repos.
- **Bleu Décision Teinté** (`#eff6ff`): Fond très doux pour les états sélectionnés ou les encadrés info. À utiliser avec parcimonie.

### Neutral
- **Encre Principale** (`#111827`): Titres, en-têtes de section, valeurs importantes dans les tableaux.
- **Encre Secondaire** (`#1f2937`): Noms, labels de champs, contenu de formulaire.
- **Encre Atténuée** (`#4b5563`): Corps de texte, descriptions, labels secondaires.
- **Encre Subtile** (`#6b7280`): Métadonnées, sources, horodatages, notes.
- **Encre Fantôme** (`#9ca3af`): Placeholders, états désactivés, indicateurs de tri inactifs.
- **Page** (`#f9fafb`): Fond de page. Gris très légèrement teinté, jamais pur blanc.
- **Carte** (`#ffffff`): Surface des cartes, formulaires, tableaux. Blanc pur pour différencier du fond page.
- **Hover** (`#f3f4f6`): Fond de ligne au survol, état hover des items de liste.
- **Bordure** (`#e5e7eb`): Séparateurs de cartes, divisions de tableaux, cadres de section.
- **Bordure Input** (`#d1d5db`): Bord des champs de saisie à l'état de repos.

### Semantic Status Colors
Les badges de statut utilisent des combinaisons fond clair / texte foncé dans la même teinte. Chaque statut a une paire dédiée ; mélanger les paires est interdit.

- Actif / Publié / Ouvert : `#dcfce7` / `#15803d`
- Complet : `#dbeafe` / `#1d4ed8`
- Annulé / Erreur : `#fee2e2` / `#b91c1c`
- Liste d'attente : `#fef3c7` / `#92400e`
- Place proposée : `#ede9fe` / `#3730a3`
- Brouillon / Fermé : `#f3f4f6` / `#4b5563`

**La Règle du Bleu Unique.** `#2563eb` est la seule couleur d'action dans l'interface. Tous les boutons primaires, tous les focus rings, tous les liens — même bleu. Introduire un deuxième bleu ou une autre couleur d'action crée de l'ambiguïté sur ce qui est cliquable.

## 3. Typography: Le Système Natif

**Display + Body + Label Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Pas de web font. Le navigateur charge sa meilleure police système. Sur macOS : SF Pro. Sur Windows : Segoe UI. Sur Android : Roboto. Résultat : interface perçue comme native, temps de chargement nul, lisibilité optimale à toutes les densités de pixel.

**Caractère de la typographie:** Sans-serif propre, légèrement géométrique selon la plateforme, toujours lisible. La hiérarchie est créée par le poids et la taille, jamais par les majuscules décoratives ni le letter-spacing exagéré.

### Hierarchy
- **Display** (700, clamp(1.5rem → 2rem), lh 1.2, ls -0.02em): Titres de page, titres d'événements dans les en-têtes. Pas de titres display sur l'interface admin courante.
- **Headline** (600, 1.25rem, lh 1.4): Titres de section, noms d'événements dans les listes, en-têtes de formulaire.
- **Title** (600, 1rem, lh 1.5): Noms de champs importants, titres de cartes, labels de navigation actifs.
- **Body** (400, 0.875rem, lh 1.6): Contenu principal, descriptions, texte de formulaire. Max 65–75ch sur les blocs de texte prose.
- **Label** (500, 0.75rem, lh 1.4, ls 0em): Labels de badges, étiquettes de métadonnées, headers de colonnes de tableau, texte dans les chips. Jamais uppercase par défaut.

**La Règle No-Caps.** Pas de lettres majuscules décoratives (UPPERCASE avec letter-spacing) sur les labels. C'est le signal le plus immédiatement lisible d'une interface SaaS générique. Si un label doit avoir de l'autorité, c'est par le poids (font-weight: 600), pas par la casse.

## 4. Elevation: Plat par Défaut

Le système est plat. La profondeur est communiquée par la couleur de fond (blanc de carte sur gris de page) et les bordures (1px `#e5e7eb`), pas par des ombres. Une ombre légère (`shadow-sm`) peut apparaître au survol d'une carte cliquable pour signaler l'interactivité — c'est la seule exception.

### Shadow Vocabulary
- **Ombre de Survol** (`0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`): Carte cliquable au hover uniquement. Disparaît en dehors de l'état survol.
- **Focus Ring** (`0 0 0 2px rgba(59,130,246,0.2)`): Sur tous les inputs et boutons en focus. Combine avec `border-color: #2563eb`.

**La Règle Plat-par-Défaut.** Les surfaces sont plates au repos. Les ombres ne décrivent pas la hiérarchie ; elles décrivent l'interactivité. Si un élément n'est pas cliquable, il ne reçoit jamais d'ombre, quelle que soit son importance visuelle.

## 5. Components

### Buttons
Tous les boutons ont des coins arrondis complets (`border-radius: 9999px`) — pill shape. Ce choix crée une séparation visuelle nette entre les boutons (action) et les cartes/inputs (contenu).

- **Primaire:** `bg #2563eb`, `text #fff`, `padding: 12px 24px`, `font-size: 0.875rem`, `font-weight: 600`. Hover: `bg #1d4ed8`, transition 150ms ease.
- **Secondaire/Ghost:** `border: 1px solid #2563eb`, `text #2563eb`, `bg transparent`. Hover: `bg #eff6ff`.
- **Texte (danger):** `text #b91c1c`, pas de fond, pas de bord. Uniquement pour actions destructives dans des tableaux.
- **Petit (inline):** `font-size: 0.75rem`, `padding: 4px 12px`. Utilisé dans les lignes de tableau et les popovers.

### Badges / Status Chips
Pills compactes avec radius full. Fond teinté + texte sombre dans la même teinte (voir les paires de couleurs sémantiques). `font-size: 0.75rem`, `font-weight: 500`, `padding: 2px 8px`.

**La Règle des Paires de Statut.** Chaque statut a une paire fond/texte figée. Ne jamais mélanger fond vert avec texte orange. Ne jamais utiliser `text-white` sur un fond de statut — le contraste n'est jamais garanti sur les pastels.

### Cards / Containers
- **Radius:** 16px (`rounded-2xl`)
- **Fond:** blanc pur (`#fff`)
- **Bordure:** `1px solid #e5e7eb`
- **Pas d'ombre au repos**
- **Padding interne:** 20–24px (`p-5` / `p-6`)
- **Hover (si cliquable):** `border-color: #bfdbfe`, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`, transition 150ms

Pas de cartes imbriquées. Si un contenu doit être distingué à l'intérieur d'une carte, utiliser un fond `#f9fafb` et une bordure, pas une carte dans une carte.

### Inputs / Fields
- **Classe globale `.input`:** `border: 1px solid #d1d5db`, `border-radius: 12px`, `padding: 8px 12px`, `font-size: 0.875rem`, `background: white`
- **Focus:** `border-color: #2563eb`, `box-shadow: 0 0 0 2px rgba(59,130,246,0.2)`, pas d'outline natif
- **Erreur:** `border-color: #ef4444` (rouge-500), message d'erreur en `text-red-700` sous le champ
- **Désactivé:** `background: #f9fafb`, `color: #6b7280`, `cursor: not-allowed`
- **Label au-dessus:** `font-size: 0.75rem`, `font-weight: 500`, `color: #4b5563`, `margin-bottom: 4px`

### Navigation (Admin)
- **Structure:** `bg white`, `border-bottom: 1px solid #e5e7eb`, `padding: 12px 16px`
- **Items actifs:** `text #111827`, `font-weight: 600`
- **Items inactifs:** `text #6b7280`, hover: `text #374151`
- **Mobile:** hamburger/drawer sur écrans étroits

### Signature Component: Timeline Gantt
La timeline Gantt (inscription bénévole + vue admin) est le composant le plus complexe et le plus identitaire du système.

- **Barres de rôles:** couleurs déterministes basées sur le nom du rôle (8 teintes : indigo, cyan, lime, rose, fuchsia, sky, emerald, yellow). Pas de couleur arbitraire — le hash du nom détermine la teinte, garantissant la cohérence entre sessions.
- **Scale horizontale:** calculée dynamiquement depuis le créneau le plus large. Responsive horizontal-scroll sur mobile.
- **Barres de spectacles:** fond semi-transparent dans la timeline, non interactives.
- **Créneaux sélectionnés:** intensité de couleur augmentée + `ring` de sélection.
- **Créneaux en conflit:** grisés (`opacity: 0.4`), non sélectionnables.

## 6. Do's and Don'ts

### Do:
- **Do** utiliser `#2563eb` comme seule couleur d'action — sa rareté est sa puissance.
- **Do** différencier fond de page (`#f9fafb`) et fond de carte (`#fff`) pour créer de la profondeur sans ombre.
- **Do** utiliser `border-radius: 9999px` (pill) pour les boutons et `border-radius: 16px` pour les cartes — les deux formes existent simultanément et ne se confondent jamais.
- **Do** placer `scope="col"` sur tous les `<th>` de tableaux de données (WCAG 1.3.1).
- **Do** ajouter `aria-hidden="true"` sur les SVG décoratifs à l'intérieur de boutons avec du texte visible.
- **Do** garder les labels de badges en sentence case — jamais UPPERCASE.
- **Do** tester les contrastes des badges : les paires statut fond/texte sont validées AA ; ne pas en introduire de nouvelles sans vérification.

### Don't:
- **Don't** ajouter un deuxième bleu ou une deuxième couleur d'action. Benevol n'est pas un SaaS corporate avec un palette de marque étendue.
- **Don't** utiliser des ombres au repos sur les cartes. Flat-par-défaut. L'ombre signale l'interactivité, pas la hiérarchie.
- **Don't** imbriquer des cartes. Un composant fond blanc à l'intérieur d'un composant fond blanc — réécrire avec un `bg-gray-50` et une bordure à la place.
- **Don't** utiliser `border-left` ou `border-right` épais comme accent de couleur sur des cartes ou items de liste. C'est un anti-pattern visuel interdit (side-stripe border).
- **Don't** créer de gradient text (`background-clip: text`). Zéro sens dans une interface utilitaire.
- **Don't** mettre de kicker uppercase au-dessus de chaque section ("ÉVÉNEMENTS", "MEMBRES", "PARAMÈTRES"). Si une section a besoin d'un en-tête, c'est un `<h2>` en weight 600.
- **Don't** copier l'esthétique Salesforce / Monday.com : metrics en gros chiffres, palette bleu-gris, jargon de conversion. Benevol organise des bénévoles, pas des pipelines commerciaux.
- **Don't** introduire de web font pour l'interface admin. La police système est la bonne réponse : native, rapide, lisible. Si un jour une web font est utilisée, ce sera uniquement sur la landing page.
- **Don't** utiliser des animations qui distraient de la tâche. Motion = retour d'état uniquement (transitions 150ms ease, focus ring, hover). Pas de scroll-driven animations, pas d'entrées orchestrées sur les dashboards.
