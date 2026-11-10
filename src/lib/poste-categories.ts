// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ColorKey } from "./roles"

/**
 * Poste families (#poste-categories): a poste is a free-text name (`Shift.roleName`), so its
 * default colour is read from the name instead of being drawn at random. Each family names a
 * `ColorKey` from the closed palette of `COLOR_OPTIONS` (all checked for WCAG AA with white
 * text); an organiser's explicit `Shift.colorKey` still wins (see `getBarClasses` /
 * `getRoleAccent`).
 *
 * Pure module, no Prisma import: client components use it too.
 *
 * Matching: lower case, accents removed, spaces collapsed. A keyword only matches at the start
 * of a word (never inside one), and a three-letter keyword or shorter must be a whole word or
 * its plural, so « bar » matches « Bar » and « Bars » but not « Barbecue », « Barbe à papa » or
 * « Barrières ». Longer keywords may carry a suffix, so « Crêpes » matches « crêpe » and
 * « Sonorisation » matches « sono ». Some keywords are whole words only: « loge » matches
 * « Loge » and « Loges », never « logement ».
 *
 * Some keywords are weak: they describe the action rather than the type of poste
 * (« Préparation », « Stand », « Service »…). A strong keyword anywhere in the name wins over a
 * weak one, even later, so « Préparation des crêpes » is Restauration; weak keywords only decide
 * when no strong keyword matches, so « Préparation » is Installation and « Stand » is Vente.
 *
 * When several families match (« Accueil / buvette », « Installation buvette »), the keyword
 * whose match starts first in the name wins. At the same start, the longest keyword wins, so
 * « Contrôle des accès » is Sécurité (not Accueil via « contrôle ») and « Courses » is
 * Logistique (not Course et sport via « course »).
 */

type PosteCategoryDefinition = {
  key: string
  label: string
  colorKey: ColorKey
  keywords: readonly string[]
  /** Action words: only used when no strong keyword matches anywhere in the name. */
  weakKeywords: readonly string[]
}

export const POSTE_CATEGORIES = [
  {
    key: "accueil",
    label: "Accueil et caisse",
    colorKey: "blue",
    keywords: [
      "accueil", "acceuil", "acueil", "info", "billetterie", "billet", "caisse", "inscription",
      "enregistrement", "ticket", "jeton", "controle", "guichet", "permanence", "pointage",
    ],
    weakKeywords: ["reception", "entree"],
  },
  {
    key: "boissons",
    label: "Boissons",
    colorKey: "amber",
    keywords: [
      "buvette", "bar", "barman", "barmaid", "boisson", "vin", "vin chaud", "cafe", "comptoir",
      "biere", "soda", "jus", "the", "limonade", "sirop", "cocktail", "aperitif", "champagne", "cidre",
    ],
    weakKeywords: [],
  },
  {
    key: "restauration",
    label: "Restauration",
    colorKey: "orange",
    keywords: [
      "cuisine", "cuisinier", "restauration", "resto", "repas", "grill", "barbecue", "frites",
      "crepe", "galette", "gateau", "patisserie", "snack", "sandwich", "soupe", "cantine",
      "burger", "hamburger", "pizza", "dessert", "boulangerie", "traiteur", "food truck",
      "friterie", "cuisson", "precuisson", "gaufre", "cookie", "pop corn", "popcorn", "collation",
      "gouter", "tartiflette", "hot dog", "pates", "churros", "barbe a papa", "sucre sale",
      "gourmandise", "friandise", "bonbon",
    ],
    weakKeywords: ["service"],
  },
  {
    key: "installation",
    label: "Installation",
    colorKey: "teal",
    keywords: [
      "montage", "installation", "mise en place", "decoration", "balisage", "construction",
      "amenagement", "chapiteau", "barnum", "marquage", "signaletique",
    ],
    weakKeywords: ["preparation"],
  },
  {
    key: "demontage",
    label: "Démontage et nettoyage",
    colorKey: "stone",
    keywords: [
      "demontage", "desinstallation", "rangement", "nettoyage", "menage", "plonge", "vaisselle",
      "poubelle", "debarrassage", "proprete", "balayage", "dechet", "recyclage",
    ],
    weakKeywords: [],
  },
  {
    key: "securite",
    label: "Sécurité",
    colorKey: "yellow",
    keywords: [
      "securite", "secu", "surete", "surveillance", "gardiennage", "parking", "circulation",
      "controle des acces", "controle d acces", "service d ordre", "service de securite", "vigile",
      "filtrage", "rondier",
    ],
    weakKeywords: [],
  },
  {
    key: "secours",
    label: "Secours",
    colorKey: "red",
    keywords: [
      "secours", "premiers secours", "premier secours", "premiers soins", "premier soin",
      "infirmerie", "soin", "soins", "poste de secours", "service de secours", "secouriste",
      "secourisme", "samu", "ambulance", "urgence", "croix rouge",
    ],
    weakKeywords: [],
  },
  {
    key: "course",
    label: "Course et sport",
    colorKey: "emerald",
    keywords: [
      "ravitaillement", "ravaitaillement", "signaleur", "dossard", "chrono", "chronometrage",
      "arrivee", "parcours", "juge", "greffe", "greffier", "course", "sport", "marathon", "trail",
      "cyclisme", "cycliste", "echauffement", "podium", "recompense", "classement",
      "ligne d arrivee",
    ],
    weakKeywords: [],
  },
  {
    key: "animation",
    label: "Animation et enfants",
    colorKey: "pink",
    keywords: [
      "animation", "animateur", "animatrice", "enfant", "maquillage", "atelier", "jeu", "jeux",
      "structure gonflable", "chateau gonflable", "loge", "clown", "conte", "ludotheque",
      "garde d enfants", "espace enfants", "initiation", "loisirs creatifs", "mascotte",
      "pere noel", "mere noel", "lutin", "parade",
    ],
    weakKeywords: [],
  },
  {
    key: "vente",
    label: "Vente et stands",
    colorKey: "rose",
    keywords: [
      "vente", "vendeur", "vendeuse", "boutique", "tombola", "emballage", "paquet cadeau",
      "brocante", "braderie", "foire", "marche", "souvenir", "loterie", "lotterie", "cadeau",
      "merchandising", "merch",
    ],
    weakKeywords: ["stand"],
  },
  {
    key: "logistique",
    label: "Logistique",
    colorKey: "cyan",
    keywords: [
      "transport", "logistique", "chargement", "dechargement", "livraison", "courses", "chauffeur",
      "navette", "camion", "manutention", "materiel", "stock", "approvisionnement", "vehicule", "bus",
      "conduite", "ramassage", "mise en rayon", "etiquetage", "packaging", "intendance",
    ],
    weakKeywords: ["distribution"],
  },
  {
    key: "image",
    label: "Image et son",
    colorKey: "violet",
    keywords: [
      "photo", "video", "son", "sono", "sonorisation", "musique", "musicien", "reportage",
      "communication", "audiovisuel", "lumiere", "eclairage", "regie", "regisseur", "micro", "media",
      "photographe", "videaste", "cadreur", "ingenieur du son",
    ],
    weakKeywords: [],
  },
] as const satisfies readonly PosteCategoryDefinition[]

export type PosteCategory = (typeof POSTE_CATEGORIES)[number]

type NameWord = { text: string; start: number }

/** Lower case, accents removed, spaces collapsed. Exported for tests and other pure helpers. */
export function normalizePosteName(name: string): string {
  return name
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** The words of a normalized name, with their character offset (for the first-match rule). */
function wordsOf(normalized: string): NameWord[] {
  return [...normalized.matchAll(/[a-z0-9]+/g)].map((match) => ({ text: match[0], start: match.index ?? 0 }))
}

/** Keywords that must be a whole word (or its plural), even when longer than three letters. */
const WHOLE_WORD_KEYWORDS = new Set(["loge"])

/**
 * One keyword word against one name word: at the start of the word. A short keyword (3 letters
 * or fewer), or a keyword listed as a whole word, must be the whole word or its plural, which
 * keeps « bar » out of « barbecue » and « loge » out of « logement ».
 */
function wordMatches(nameWord: string, keywordWord: string): boolean {
  if (!nameWord.startsWith(keywordWord)) return false
  const rest = nameWord.slice(keywordWord.length)
  if (rest === "") return true
  if (WHOLE_WORD_KEYWORDS.has(keywordWord)) return rest === "s"
  if (keywordWord.length <= 3) return rest === "s" || rest === "x"
  return true
}

/** True when `keywordWords` matches consecutive name words starting at `index`. */
function phraseMatchesAt(words: readonly NameWord[], index: number, keywordWords: readonly NameWord[]): boolean {
  if (index + keywordWords.length > words.length) return false
  return keywordWords.every((keywordWord, offset) => wordMatches(words[index + offset].text, keywordWord.text))
}

type KeywordMatch = { category: PosteCategory; start: number; length: number }

/**
 * The best strong (or weak) keyword match. The first keyword encountered in the name wins; at
 * the same position, the longest keyword wins.
 */
function bestKeywordMatch(words: readonly NameWord[], weak: boolean): KeywordMatch | null {
  let best: KeywordMatch | null = null
  for (const category of POSTE_CATEGORIES) {
    for (const keyword of weak ? category.weakKeywords : category.keywords) {
      const keywordWords = wordsOf(normalizePosteName(keyword))
      if (keywordWords.length === 0) continue
      for (let index = 0; index < words.length; index++) {
        if (!phraseMatchesAt(words, index, keywordWords)) continue
        const candidate = {
          category,
          start: words[index].start,
          length: keywordWords.reduce((total, word) => total + word.text.length, 0),
        }
        if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.length > best.length)) {
          best = candidate
        }
        break
      }
    }
  }
  return best
}

/**
 * The family of a poste name, or null when no keyword matches. The first strong keyword
 * encountered in the name wins; weak keywords only count when no strong keyword matches.
 */
export function posteCategory(name: string): PosteCategory | null {
  const normalized = normalizePosteName(name)
  if (!normalized) return null
  const words = wordsOf(normalized)
  const strong = bestKeywordMatch(words, false)
  if (strong) return strong.category
  return bestKeywordMatch(words, true)?.category ?? null
}
