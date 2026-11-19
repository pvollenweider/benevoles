// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Categories of message templates (#482, library #1414). The eleven library categories keep the
 * order of the library; « Autres » is the default for a template written by hand and the fallback
 * for a template whose category is unknown (migration 20261122120000). Pure: imported by client
 * components and by the API schema.
 */

export const LIBRARY_CATEGORIES = [
  "Recruter et compléter",
  "Accueil",
  "Infos pratiques",
  "Tenue et matériel",
  "Cadre",
  "Planning",
  "Météo et imprévus",
  "Jour J",
  "Ressources",
  "Après",
  "Activités régulières",
] as const

export const OTHER_CATEGORY = "Autres"
export const TEMPLATE_CATEGORIES = [...LIBRARY_CATEGORIES, OTHER_CATEGORY] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

/** Position of a category in the picker: library order, then « Autres », then anything unknown. */
export function categoryRank(category: string): number {
  const i = (TEMPLATE_CATEGORIES as readonly string[]).indexOf(category)
  return i === -1 ? TEMPLATE_CATEGORIES.length : i
}

/** Templates grouped by category, in the library's order; empty categories are left out. */
export function groupTemplatesByCategory<T extends { category: string }>(templates: readonly T[]): { category: string; items: T[] }[] {
  const byCategory = new Map<string, T[]>()
  for (const template of templates) {
    const category = template.category || OTHER_CATEGORY
    const items = byCategory.get(category)
    if (items) items.push(template)
    else byCategory.set(category, [template])
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b, "fr"))
    .map(([category, items]) => ({ category, items }))
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr")

/**
 * Templates matching every word of a search (name, subject or category, accents and case
 * ignored). An empty search returns everything, in the given order.
 */
export function filterTemplates<T extends { name: string; subject: string; category: string }>(templates: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...templates]
  return templates.filter((template) => {
    const haystack = fold(`${template.name} ${template.subject} ${template.category}`)
    return words.every((word) => haystack.includes(word))
  })
}

/** How many templates the picker shows before offering a search field. */
export const TEMPLATE_SEARCH_THRESHOLD = 8
