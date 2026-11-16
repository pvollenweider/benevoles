// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Test fixtures for the front-desk role (#1142): the accounts of one organisation, one of which
 * is a front-desk account, and what the database would answer to an AdminUser `where`. A site
 * that selects « the administrators » is tested by answering its real query from these rows: the
 * front-desk account must not come back.
 */

export type TeamAccount = {
  id: string
  organizationId: string
  email: string
  name: string
  role: string
  isActive: boolean
  receiveProductUpdates: boolean
  createdAt: Date
  setupTokenHash: string | null
}

const account = (id: string, name: string, email: string, role: string): Omit<TeamAccount, "organizationId"> => ({
  id, name, email, role, isActive: true, receiveProductUpdates: true, createdAt: new Date("2027-01-10T08:00:00Z"), setupTokenHash: null,
})

/** Owner. */
export const ELODIE = account("adm-elodie", "Élodie Rochat", "elodie.rochat@example.org", "admin")
/** Organiser. */
export const SAMI = account("adm-sami", "Sami Haddad", "sami.haddad@example.org", "organizer")
/** Front desk of one event: active, opted in to product updates by the column's default. */
export const COLETTE = account("adm-colette", "Colette Favre", "colette.favre@example.org", "front_desk")

/** The three accounts, as accounts of `organizationId`. */
export const teamOf = (organizationId: string): TeamAccount[] => [ELODIE, SAMI, COLETTE].map((a) => ({ ...a, organizationId }))

type Row = Record<string, unknown>

/** A small Prisma `where`: AND / OR / NOT, equality, null, `in`, `not`, `equals` (optionally case-insensitive). */
export function matchesWhere(row: Row, where: unknown): boolean {
  if (!where) return true
  return Object.entries(where as Row).every(([key, cond]) => {
    if (key === "AND") return (Array.isArray(cond) ? cond : [cond]).every((w) => matchesWhere(row, w))
    if (key === "OR") return (cond as unknown[]).some((w) => matchesWhere(row, w))
    if (key === "NOT") return !matchesWhere(row, cond)
    const value = row[key]
    if (cond === null) return value === null || value === undefined
    if (typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Row
      if ("in" in c) return (c.in as unknown[]).includes(value)
      if ("not" in c) return c.not === null ? value !== null && value !== undefined : value !== c.not
      if ("equals" in c) return c.mode === "insensitive" ? String(value).toLowerCase() === String(c.equals).toLowerCase() : value === c.equals
      throw new Error(`matchesWhere: condition on « ${key} » is not supported by this fixture`)
    }
    return value === cond
  })
}

/** The accounts a query with this `where` returns. */
export const adminsMatching = (where: unknown, accounts: TeamAccount[]): TeamAccount[] => accounts.filter((a) => matchesWhere(a, where))
