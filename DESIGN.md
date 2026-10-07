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
  status-offered-bg: "#f3e8ff"
  status-offered-text: "#6b21a8"
  status-archived-bg: "#fef9c3"
  status-archived-text: "#a16207"
  status-requested-bg: "#fef3c7"
  status-requested-text: "#78350f"
  status-refused-bg: "#f3f4f6"
  status-refused-text: "#374151"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
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
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-deep}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
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

Benevol est un outil qu'on sort sous la pression d'un événement : à 7h du matin le jour J, sur téléphone, avec des bénévoles qui arrivent en retard. Ce n'est pas une interface qu'on contemple, c'est un outil qu'on consulte vite et qu'on pose. Chaque décision visuelle part de cette scène : l'information doit être lisible d'un coup d'œil, les actions doivent être immédiatement trouvables, et rien ne doit se mettre entre l'organisateur et sa réponse.

Le système est délibérément sobre. La couleur est réservée à l'action et au statut, jamais à la décoration. La typographie est le système sans-serif natif du navigateur : choisir une police web serait ajouter un chargement pour zéro gain expressif sur une interface de gestion. L'espacement crée le rythme ; les bords arrondis signalent la douceur sans chercher à être mignons.

Ce système s'interdit explicitement l'esthétique SaaS corporate : pas de hero-metrics, pas de gradient en arrière-plan, pas de dark mode obsidien pour faire « dev-centric », pas de motion qui distrait. Le design s'efface. Le travail des organisateurs et des bénévoles passe devant.

**Key Characteristics:**
- Hiérarchie forte, densité contrôlée
- Chrome minimal : les bordures font le travail des ombres
- Couleur = action + statut, jamais décoration
- Radius généreux (12–16px) sans être ludique
- Système sans-serif natif : pas de chargement web font pour une interface utilitaire

## 2. Colors: La Palette Carnet

Un bleu d'action unique sur fond blanc/gris très clair. Les couleurs sémantiques de statut et les couleurs des postes sont les seules exceptions au principe de sobriété.

### Primary
- **Bleu Décision** (`#2563eb`): La seule couleur vraiment « vivante » du système. Réservée aux boutons primaires, liens actifs, indicateurs de focus, état sélectionné. Sa rareté est sa puissance : si tout est bleu, rien ne l'est.

### Secondary
- **Bleu Décision Profond** (`#1d4ed8`): État hover/active du bleu primaire, et contour de focus par défaut des boutons. Jamais utilisé comme fond au repos.
- **Bleu Décision Teinté** (`#eff6ff`): Fond très doux pour les états sélectionnés ou les encadrés info. À utiliser avec parcimonie.

### Neutral
- **Encre Principale** (`#111827`): Titres, en-têtes de section, valeurs importantes dans les tableaux.
- **Encre Secondaire** (`#1f2937`): Noms, labels de champs, contenu de formulaire.
- **Encre Atténuée** (`#4b5563`): Corps de texte, descriptions, labels secondaires.
- **Encre Subtile** (`#6b7280`): Métadonnées, sources, horodatages, notes.
- **Encre Fantôme** (`#9ca3af`): Éléments décoratifs et états désactivés uniquement (2,54:1 sur blanc, sous le seuil AA de 4,5:1). Jamais pour du texte porteur d'information, ni pour un placeholder : utiliser Encre Subtile (`#6b7280`, 4,83:1 sur blanc) ; sur fond `#f3f4f6` ou plus foncé, Encre Atténuée.
- **Page** (`#f9fafb`): Fond de page. Gris très légèrement teinté, jamais pur blanc.
- **Carte** (`#ffffff`): Surface des cartes, formulaires, tableaux. Blanc pur pour différencier du fond page.
- **Hover** (`#f3f4f6`): Fond de ligne au survol, état hover des items de liste.
- **Bordure** (`#e5e7eb`): Séparateurs de cartes, divisions de tableaux, cadres de section.
- **Bordure Input** (`#d1d5db`): Bord des champs de saisie à l'état de repos.

### Semantic Status Colors
Les badges de statut (`StatusBadge`) utilisent des combinaisons fond clair / texte foncé dans la même teinte. Chaque statut a une paire dédiée ; mélanger les paires est interdit.

- Actif / Publié / Ouvert : `#dcfce7` / `#15803d`
- Complet : `#dbeafe` / `#1d4ed8`
- Annulé / Erreur : `#fee2e2` / `#b91c1c`
- Liste d'attente : `#fef3c7` / `#92400e`
- Demande à traiter : `#fef3c7` / `#78350f`
- Place proposée : `#f3e8ff` / `#6b21a8`
- Archivé : `#fef9c3` / `#a16207`
- Brouillon / Fermé : `#f3f4f6` / `#4b5563`
- Refusée : `#f3f4f6` / `#374151`

**La Règle du Bleu Unique.** `#2563eb` est la seule couleur d'action dans l'interface. Tous les boutons primaires, tous les liens, tous les focus sur fond clair : même bleu (le `#1d4ed8` des boutons et le `#3b82f6` des champs en sont les variantes de focus, voir §4). Introduire un deuxième bleu ou une autre couleur d'action crée de l'ambiguïté sur ce qui est cliquable.

**Exceptions.** La couleur d'accent d'un événement (`src/lib/event-accent.ts`) colore le bandeau de sa page publique : même palette fermée que les postes, texte blanc, AA ; le focus y prend la couleur de l'accent. Les pages de contenu (`/doc`, `/fonctionnalites`, `/accessibilite`) ont un thème sombre, par classe `dark` sur `<html>`, qui suit le système ou le choix du lecteur. La page introuvable (404) suit le système seul (`data-color-scheme="system"`, sans script). Aucune autre surface n'utilise `dark:`.

**Pas d'information par la couleur seule.** Le lien actif est souligné, un créneau réservé a un cadenas et le mot « Réservé », un créneau complet est hachuré.

## 3. Typography: Le Système Natif

**Display + Body + Label Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Pas de web font. Le navigateur charge sa meilleure police système. Sur macOS : SF Pro. Sur Windows : Segoe UI. Sur Android : Roboto. Résultat : interface perçue comme native, temps de chargement nul, lisibilité optimale à toutes les densités de pixel.

**Caractère de la typographie:** Sans-serif propre, légèrement géométrique selon la plateforme, toujours lisible. La hiérarchie est créée par le poids et la taille, jamais par les majuscules décoratives ni le letter-spacing exagéré.

### Hierarchy
Conventions du code (classes Tailwind) :

- **Titre de page** (`<h1>`, `text-xl font-bold`, 1.25rem, 700): Titres de page, admin et public. `text-2xl` (1.5rem) sur quelques pages (connexion et mot de passe, page d'un événement et fiche d'un membre dans l'administration, accueil). Pas de taille fluide (`clamp`), sauf le titre de la page introuvable (404), moment de marque : `clamp()` jusqu'à 5,5rem, `font-extrabold`, interlettrage -0,035em, `text-wrap: balance`.
- **Titre de section** (`<h2>`, `text-sm font-semibold`, 0.875rem, 600, `text-gray-700` ou `text-gray-900`): Titres de section et de carte. `text-lg font-semibold` pour les rares sections qui ouvrent une page longue. La hiérarchie passe par le poids, pas par la taille.
- **Body** (400, `text-sm` 0.875rem, lh 1.6): Contenu principal, descriptions, texte de formulaire. Max 65–75ch sur les blocs de texte prose.
- **Texte de la documentation** (`/doc`, `DOC_PROSE_CLASS` dans `src/components/public/DocFrame.tsx`) : page de lecture, plus grande que l'interface. Corps `text-base` (1rem) `text-gray-700`, interligne 1.75 sans unité, paragraphes et éléments de liste en `max-width: 70ch` (jamais une largeur fixe) ; `<h1>` `text-3xl`, `<h2>` `text-2xl`, `<h3>` `text-xl`, `<h4>` `text-lg`, tous semibold et coupés (`break-words`) plutôt que de déborder ; aucune hauteur fixe ; liens soulignés. Les autres pages de contenu gardent leur recette (`CONTENT_PROSE_CLASS`).
- **Label de champ** (`block text-sm font-medium text-gray-700 mb-1`): au-dessus du champ. `text-xs font-medium text-gray-600` dans les formulaires denses.
- **Label de badge / métadonnée** (500, `text-xs` 0.75rem): Badges, étiquettes de métadonnées, en-têtes de colonnes, chips. Jamais uppercase.

**La Règle No-Caps.** Pas de lettres majuscules décoratives (UPPERCASE avec letter-spacing) sur les labels. C'est le signal le plus immédiatement lisible d'une interface SaaS générique. Si un label doit avoir de l'autorité, c'est par le poids (font-weight: 600), pas par la casse.

## 4. Elevation: Plat par Défaut

Le système est plat. La profondeur est communiquée par la couleur de fond (blanc de carte sur gris de page) et les bordures (1px `#e5e7eb`), pas par des ombres. Une ombre légère (`shadow-sm`) peut apparaître au survol d'une carte cliquable pour signaler l'interactivité : c'est la seule exception.

### Shadow Vocabulary
- **Ombre de Survol** (`0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`): Carte cliquable au hover uniquement. Disparaît en dehors de l'état survol.

### Focus
Le focus n'est pas une ombre : c'est un contour opaque, d'au moins 3:1 contre le fond (WCAG 1.4.11).

- **Contrôles** : `outline: 2px solid` décalé de 2px (`focus-visible:outline-2 outline-offset-2 outline-blue-600`, `#2563eb`) sur fond clair. Les boutons ont par défaut `#1d4ed8` (`globals.css`, dans `@layer base` pour qu'une classe `focus-visible:outline-*` puisse le remplacer). Sur un bandeau coloré, la couleur de focus de l'accent (`focus-visible:outline-white`).
- **Champs `.input`** : `border-color: #3b82f6` et `box-shadow: 0 0 0 2px #3b82f6` (opaque), pas d'outline natif. En couleurs forcées (`@media (forced-colors: active)`, thèmes de contraste Windows), `outline: 2px solid transparent; outline-offset: 2px` : l'ombre y est supprimée, le contour transparent est repeint dans la couleur système.
- **Contraste élevé (couleurs forcées)** : une ombre (`ring-*`, `shadow-*`, `box-shadow`) n'y est pas affichée. Règle : `outline-none`, quel que soit son préfixe (`focus:`, `focus-visible:`, aucun), n'est permis que sur une cible focalisée par le code, avec `tabIndex={-1}` (titre de page, `<main>`, paragraphe de résultat) ; partout ailleurs, `outline-hidden`. `outline-hidden` ne change rien en affichage normal et laisse en couleurs forcées un contour transparent que le système repeint. Les cibles `tabIndex={-1}` sont la seule exception parce qu'elles ne reçoivent jamais le focus clavier, seulement un focus posé par le code après une action : ce ne sont pas des contrôles, et un cadre autour du titre à chaque changement de page serait du bruit. Exception : une cible focalisée par le code qui affiche un anneau `focus-visible:ring-*` en affichage normal (paragraphes de résultat de l'import) prend aussi `focus-visible:outline-hidden`, pour garder un repère en couleurs forcées. Garde-fou : `src/__tests__/a11y/focus-outline-forced-colors.test.ts` (source) et `e2e/forced-colors-focus.spec.ts` (rendu sous Chromium).
- **Retour du focus** : quand un formulaire ou un panneau en ligne se ferme, le focus revient sur le bouton qui l'a ouvert, ou, s'il n'est plus affiché, sur le premier repli prévu (`src/lib/focus-return.ts` : la cible et ses replis dans l'ordre, chacun vérifié présent et visible au moment du retour), jamais sur `<body>`. Un contrôle qui garde le focus pendant une requête prend `aria-disabled` (et `aria-disabled:opacity-50`), pas `disabled` : un bouton `disabled` perd le focus.

**La Règle Plat-par-Défaut.** Les surfaces sont plates au repos. Les ombres ne décrivent pas la hiérarchie ; elles décrivent l'interactivité. Si un élément n'est pas cliquable, il ne reçoit jamais d'ombre, quelle que soit son importance visuelle.

## 5. Components

### Buttons
Convention du code : les boutons ont des coins arrondis de 12px (`rounded-xl`), comme les champs ; les cartes sont en 16px (`rounded-2xl`). La forme pill (`rounded-full`) est réservée aux badges et à quelques petits boutons isolés.

- **Primaire:** `bg #2563eb`, `text #fff`, `rounded-xl`, `px-4 py-2` (8px 16px), `text-sm font-medium`. Hover: `bg #1d4ed8` (`hover:bg-blue-700`), transition 150ms ease.
- **CTA pleine largeur** (page publique, étape d'inscription) : `rounded-2xl py-4 text-base font-semibold`.
- **Secondaire/Ghost:** `border: 1px solid #2563eb`, `text #2563eb`, `bg transparent`. Hover: `bg #eff6ff`.
- **Texte (danger):** `text #b91c1c`, pas de fond, pas de bord. Uniquement pour actions destructives dans des tableaux.
- **Petit (inline):** `text-xs`, `px-3 py-1.5`. Utilisé dans les lignes de tableau et les popovers.
- **Désactivé:** `disabled:opacity-50`, jamais la seule indication d'un état (le libellé ou un texte voisin dit pourquoi).
- **Groupe de boutons accolés** (choix Frise / Liste) : un groupe de boutons accolés n'a pas d'`overflow-hidden` (il couperait le contour de focus) : arrondir les boutons d'extrémité (`first:rounded-l-* last:rounded-r-*`). L'état d'un bouton bascule (`aria-pressed`) se marque en couleurs forcées par `forced-colors:aria-pressed:bg-[Highlight]`, sans `text-[HighlightText]` : Chromium y peint une plaque `Canvas` derrière le texte, et `HighlightText`, souvent identique ou proche de `Canvas` (émulation Chromium, thèmes Noir / Blanc), rendrait le libellé invisible ; le texte garde donc `CanvasText`.

### Badges / Status Chips
Pills compactes avec radius full. Fond teinté + texte sombre dans la même teinte (voir les paires de couleurs sémantiques). `font-size: 0.75rem`, `font-weight: 500`, `padding: 2px 8px`.

**La Règle des Paires de Statut.** Chaque statut a une paire fond/texte figée. Ne jamais mélanger fond vert avec texte orange. Ne jamais utiliser `text-white` sur un fond de statut : le contraste n'est jamais garanti sur les pastels.

### Cards / Containers
- **Radius:** 16px (`rounded-2xl`), 12px (`rounded-xl`) pour les cartes denses
- **Fond:** blanc pur (`#fff`)
- **Bordure:** `1px solid #e5e7eb`
- **Pas d'ombre au repos**
- **Padding interne:** 20–24px (`p-5` / `p-6`)
- **Hover (si cliquable):** `border-color: #bfdbfe`, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`, transition 150ms

Pas de cartes imbriquées. Si un contenu doit être distingué à l'intérieur d'une carte, utiliser un fond `#f9fafb` et une bordure, pas une carte dans une carte.

### Inputs / Fields
- **Classe globale `.input`:** `border: 1px solid #d1d5db`, `border-radius: 12px`, `padding: 8px 12px`, `font-size: 0.875rem`, `background: white`
- **Focus:** voir §4 (`border-color: #3b82f6`, `box-shadow: 0 0 0 2px #3b82f6`)
- **Erreur:** bordure rouge (`!border-red-600`) et message d'erreur en `text-red-700` sous le champ
- **Désactivé:** pas de style dédié dans `globals.css` ; ne pas compter sur la seule couleur
- **Label au-dessus:** `block text-sm font-medium text-gray-700 mb-1`
- **Champ obligatoire:** astérisque visible masqué aux lecteurs d'écran, `<span aria-hidden="true">*</span>` dans le label, et `required` sur le champ (`aria-required` sur un contrôle personnalisé, comme le choix du créneau) : c'est l'état du champ qui fait dire « obligatoire », sans « étoile ». Le « (obligatoire) » en `sr-only` ajouté après l'astérisque (`MemberFormModals.tsx`) est l'ancienne variante.

### Choix d'une couleur
Pastilles de la palette fermée (`RoleColorPicker`, `src/components/admin/shifts/RoleSettings.tsx`) : boutons bascule (`aria-pressed`) nommés par la couleur, sans `title`, de 32 px (au moins 24 px, 2.5.8), la couleur dans un enfant `aria-hidden`. Le choix est marqué par un bord (`border-2`, `border-0` sinon) et une coche SVG blanche, jamais par un seul anneau (`ring`, une ombre qu'ignorent les couleurs forcées). En couleurs forcées, les pastilles gardent leur couleur (`forced-color-adjust-none`), seulement sur les enfants non focalisables, pour que le contour de focus du bouton reste repeint par le système ; le bord est repeint, la coche reste blanche sur la couleur. Le bouton « Automatique » choisi affiche « ✓ » (`aria-hidden`) et un bord de 2 px. Même règle pour le bouton de couleur d'un poste : cible de 24 px autour du point de 16 px, contour de focus explicite.

### Fenêtres
`ModalShell` (`src/components/admin/ModalShell.tsx`) : `role="dialog"` ou `alertdialog`, `aria-modal`, nommée par son titre, Échap ferme, focus piégé, placé dans la fenêtre à l'ouverture et rendu au déclencheur à la fermeture. Le piège ne compte que ce que Tab atteint (ni élément masqué, `inert`, `aria-hidden`, désactivé ou en `tabindex="-1"`, un arrêt par groupe de boutons radio) et ramène dans la fenêtre un focus resté dehors. Le déclencheur est l'élément focalisé à l'ouverture, ou le dernier contrôle touché ou cliqué (y compris activé par VoiceOver sur iOS ou un contacteur) quand Safari a laissé le focus sur `<body>` ou `<main>`. Avec deux fenêtres ouvertes, seule la plus récente gère Tab et Échap. À la fermeture, le focus ne lui revient que si personne d'autre ne l'a déplacé : le parent qui place le focus ailleurs l'emporte. Prop `busy` pendant une requête : « Fermer » reste focalisable (`aria-disabled`), et ni lui, ni Échap, ni le fond ne ferment. `ConfirmActionModal` pour les confirmations. Un parent qui place lui-même le focus à la fermeture le fait dans un `useLayoutEffect` (ou avec `flushSync` puis `focus()`) : il passe avant le retour au déclencheur, sans focus intermédiaire.

### Lien d'évitement
`SkipLink` (« Aller au contenu »), premier élément focalisable, vers `<main id="main" tabIndex={-1}>`, sur toute page où un en-tête à liens ou une navigation précède le contenu : administration, espace super admin, pages de contenu (`ContentShell`), pages légales, page publique d'un événement (l'en-tête, avec le titre et la session, reste une bannière hors du `<main>`). L'aperçu d'un événement est déjà dans le `<main>` de l'administration : ni second lien, ni second `<main>`. Pas de lien d'évitement là où aucun en-tête de site ni bannière ne précède le contenu (au plus un lien de retour dans le contenu) : page introuvable (404), page personnelle, confirmation d'inscription, liste d'attente, responsable de secteur, désabonnement, pages d'information d'un événement, accueil d'une organisation ; leur contenu est dans un `<main>` (voir `docs/accessibilite.md`). Sous WebKit, toucher un bouton qui ne prend pas le focus le donne au `<main tabIndex={-1}>` : `ModalShell` le gère pour toutes ses fenêtres (déclencheur pris au dernier toucher, focus rendu seulement s'il est resté sur `<body>` ou `<main>`, #585). Le code qui rend le focus après un changement traite `<main>` comme `<body>` (`isFocusDropped` dans `src/lib/focus-return.ts`), comme le panneau « Gérer les postes ».

### Page de décision (`/fonctionnalites`)
`src/components/public/FeaturesPage.tsx`, dans le cadre large de `ContentShell` (`layout="doc"`), la page dessine son propre `<main>`. Ouverture en deux colonnes à partir de `lg` : petit libellé « Fonctionnalités » (un seul sur la page, en `text-blue-700`, ni majuscules ni interlettrage), `<h1>` `text-4xl sm:text-5xl font-extrabold`, ouverture en `text-lg sm:text-xl`, bouton principal en pilule (`rounded-full bg-blue-700`, texte blanc ; `bg-blue-300` texte `gray-950` en sombre) et lien secondaire souligné ; à droite l'affiche du produit et le lecteur sur place. Puis un bandeau « Sur cette page » (`<nav>` nommée par son `<h2>`, liens soulignés), et les sections séparées d'un filet, texte et affiche en alternance (6/6 colonnes à partir de `lg`, empilés au-dessous : texte d'abord). Corps 16 px, interligne 1.75, lignes plafonnées à 65ch (`FEATURES_PROSE_CLASS`). Les étapes reprennent le motif de l'accueil (gros chiffre décoratif `aria-hidden`, « Étape n : » pour les lecteurs d'écran). L'encadré « Bénévole ? » est une citation dessinée en boîte teintée à bordure de 1 px sur tout le tour, sans guillemets ni italique, jamais un filet latéral. Affiches en `<img>` avec largeur et hauteur réelles (pas de saut de mise en page), chargées en différé sauf la première.

### Navigation (Admin)
- **Structure:** `<nav>` `bg white`, `border-bottom: 1px solid #e5e7eb`, `px-4`, barre `h-14`, jamais sur deux lignes
- **Lien actif:** `text-blue-600 font-medium`, souligné (`underline decoration-2 underline-offset-4`), `aria-current="page"`
- **Liens inactifs:** `text-gray-500`, hover: `text-gray-800`
- **Mobile (sous `md`):** bouton « Menu » (☰/✕, `aria-expanded`, `aria-controls`) qui déplie la liste des liens dans un panneau sous la barre ; pas de tiroir, pas de `role="menu"`

### Signature Component: Timeline Gantt
La timeline Gantt (inscription bénévole + vue admin) est le composant le plus complexe et le plus identitaire du système.

- **Barres de postes:** couleur choisie par l'organisateur dans une palette fermée de 16 teintes (`COLOR_OPTIONS`, `src/lib/roles.tsx`), toutes AA avec texte blanc ; à défaut, teinte déduite d'un mot-clé du nom (billetterie, buvette, loge, photo, vidéo, montage, démontage, préparation), puis d'un hachage du nom sur 8 teintes (indigo, cyan, lime, rose, fuchsia, sky, emerald, yellow). Jamais de couleur libre.
- **Échelle horizontale:** couvre la journée, de l'heure pleine avant le premier début à l'heure pleine après la dernière fin (spectacles compris). Fluide entre 36 px/h (en dessous, défilement horizontal, comme sur téléphone) et 120 px/h. Chaque barre fait au moins 24 px de large (taille de cible AA).
- **Spectacles:** bandes pleine hauteur `bg-indigo-50` bordées `indigo-100`, non interactives, avec une ligne de libellés.
- **Créneaux sélectionnés:** teinte plus foncée + `ring-2` de sélection.
- **Créneaux indisponibles** (conflit, réservé, fermé) : teinte claire du poste (`bg-*-100`), texte `gray-700`, bouton désactivé.
- **Complet sans liste d'attente:** fond blanc hachuré. **Complet avec liste d'attente:** hachures claires sur la couleur du poste.
- **Créneaux déjà pris** (inscription confirmée, demande envoyée, liste d'attente, place proposée) : couleur par défaut du poste, sans effet de survol, sans anneau ni hachures, avec un ✓ cerclé (distinct du ✓ simple de la sélection) ; la ligne sous la barre commence par « Ton créneau », « Demande envoyée », « En liste d'attente » ou « Place proposée ». Bouton désactivé, sans `aria-pressed`, nommé « Bar 10h–12h : inscription confirmée » (ou « demande envoyée, en attente de validation », « en liste d'attente », « place proposée, à accepter sur ta page personnelle »). Un créneau déjà pris l'emporte sur sélectionné, complet, liste d'attente, conflit et réservé. Les textes des barres viennent de `src/lib/public-timeline.ts`.
- **Couleurs forcées:** chaque barre porte `border border-transparent`, que le système repeint sur les quatre côtés quand il remplace le fond par `Canvas` ; la bordure gauche en style en ligne la remplace à gauche. La barre sélectionnée prend `forced-colors:aria-pressed:bg-[Highlight]`, sans `text-[HighlightText]` (même raison que pour les groupes de boutons accolés).
- **Focus:** l'enveloppe de chaque barre porte `focus-within:z-20`, au-dessus de la colonne des postes (`z-10`) et des barres voisines, pour que leur contour de focus ne soit jamais masqué. Aucun élément entre la colonne des postes et les barres ne doit créer de contexte d'empilement (`transform`, `opacity`, `filter`, `z-index`), sinon la règle ne joue plus.

## 6. Do's and Don'ts

### Do:
- **Do** utiliser `#2563eb` comme seule couleur d'action : sa rareté est sa puissance.
- **Do** différencier fond de page (`#f9fafb`) et fond de carte (`#fff`) pour créer de la profondeur sans ombre.
- **Do** utiliser `rounded-xl` (12px) pour les boutons et les champs, `rounded-2xl` (16px) pour les cartes, `rounded-full` pour les badges.
- **Do** placer `scope="col"` sur tous les `<th>` de tableaux de données (WCAG 1.3.1).
- **Do** ajouter `aria-hidden="true"` sur les SVG décoratifs à l'intérieur de boutons avec du texte visible.
- **Do** garder les labels de badges en sentence case, jamais UPPERCASE.
- **Do** tester les contrastes des badges : les paires statut fond/texte sont validées AA ; ne pas en introduire de nouvelles sans vérification.

### Don't:
- **Don't** ajouter un deuxième bleu ou une deuxième couleur d'action. Benevol n'est pas un SaaS corporate avec une palette de marque étendue.
- **Don't** utiliser des ombres au repos sur les cartes. Flat-par-défaut. L'ombre signale l'interactivité, pas la hiérarchie.
- **Don't** imbriquer des cartes. Un composant fond blanc à l'intérieur d'un composant fond blanc : réécrire avec un `bg-gray-50` et une bordure à la place.
- **Don't** utiliser `border-left` ou `border-right` épais comme accent de couleur sur des cartes ou items de liste. C'est un anti-pattern visuel interdit (side-stripe border).
- **Don't** créer de gradient text (`background-clip: text`). Zéro sens dans une interface utilitaire.
- **Don't** mettre de kicker uppercase au-dessus de chaque section ("ÉVÉNEMENTS", "MEMBRES", "PARAMÈTRES"). Si une section a besoin d'un en-tête, c'est un `<h2>` en weight 600.
- **Don't** copier l'esthétique Salesforce / Monday.com : metrics en gros chiffres, palette bleu-gris, jargon de conversion. Benevol organise des bénévoles, pas des pipelines commerciaux.
- **Don't** introduire de web font pour l'interface admin. La police système est la bonne réponse : native, rapide, lisible. Si un jour une web font est utilisée, ce sera uniquement sur la landing page.
- **Don't** utiliser des animations qui distraient de la tâche. Motion = retour d'état uniquement (transitions 150ms ease, focus ring, hover), et tout mouvement (défilement doux, effet d'échelle, rotation) passe par `motion-safe:`. Pas de scroll-driven animations, pas d'entrées orchestrées sur les dashboards. Seule animation décorative : la pluie de la page introuvable (404), qui n'accompagne aucune tâche, toujours sous `motion-safe:`.

## 7. Écarts connus du code

Ces règles restent la cible ; le code s'en écarte encore aux endroits suivants, à corriger :

- **Règle No-Caps** : `prose-th:uppercase prose-th:tracking-wider` sur les en-têtes de tableaux des pages de contenu (`ContentShell.tsx`) et des pages légales (`legal/layout.tsx`).
- **Ombres au repos** : CTA collant de la page publique en `shadow-xl` (`EventPageClient.tsx`), toasts et menus déroulants en `shadow-lg`.
- **Forme des boutons** : une douzaine de boutons primaires en `rounded-full` et quelques-uns en `rounded-lg`, hors convention `rounded-xl`.
- **Mouvement non gardé** : glissement du bouton de l'interrupteur de la charte (`OrgCharterForm.tsx`, `transition` avec `translate-x-5`), que le garde-fou `src/__tests__/a11y/motion-safe.test.ts` ne détecte pas encore.
