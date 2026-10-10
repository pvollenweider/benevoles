// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { FeedbackSummaryRow } from "./video-feedback"
import type { SortLabel, SortValue } from "./table-sort"

/**
 * The sortable columns of the super admin tables (#820) and each row's sort key. The sort
 * itself is `sortRows` (src/lib/table-sort.ts).
 */

// --- Organisations ---------------------------------------------------------------------------

export const ORG_SORT_COLS = ["nom", "slug", "etat", "creation", "evenements", "admins", "membres"] as const
export type OrgSortCol = (typeof ORG_SORT_COLS)[number]

export const ORG_SORT_LABELS: Record<OrgSortCol, SortLabel> = {
  nom: "nom",
  slug: "slug",
  etat: { name: "état", asc: "des actives aux suspendues", desc: "des suspendues aux actives" },
  creation: { name: "date de création", asc: "de la plus ancienne à la plus récente", desc: "de la plus récente à la plus ancienne" },
  evenements: "événements",
  admins: "admins",
  membres: "membres",
}

export type OrgRow = {
  name: string
  slug: string
  active: boolean
  suspendedAt: string | null
  publicationApprovedAt?: string | null
  outboundEmailApprovedAt?: string | null
  createdAt: string
  _count: { events: number; admins: number; volunteers: number }
}

export type OrgState = "active" | "pending" | "deactivated" | "suspended"

/** What the « État » column says, in the order a sort by state follows. */
export const ORG_STATE_LABELS: Record<OrgState, string> = {
  active: "Active",
  pending: "En attente de validation",
  deactivated: "Désactivée",
  suspended: "Suspendue",
}
const ORG_STATE_RANK: Record<OrgState, number> = { active: 0, pending: 1, deactivated: 2, suspended: 3 }

/** An organisation's state: suspended (#810) or deactivated, or active and waiting for validation, or active. */
export function orgState(org: Pick<OrgRow, "active" | "suspendedAt" | "publicationApprovedAt" | "outboundEmailApprovedAt">): OrgState {
  if (!org.active) return org.suspendedAt ? "suspended" : "deactivated"
  if (org.publicationApprovedAt === null || org.outboundEmailApprovedAt === null) return "pending"
  return "active"
}

export function orgSortKey(org: OrgRow, col: OrgSortCol): SortValue {
  switch (col) {
    case "nom": return org.name
    case "slug": return org.slug
    case "etat": return ORG_STATE_RANK[orgState(org)]
    case "creation": return org.createdAt
    case "evenements": return org._count.events
    case "admins": return org._count.admins
    case "membres": return org._count.volunteers
  }
}

// --- Video feedback --------------------------------------------------------------------------

export const VIDEO_SORT_COLS = ["video", "revision", "oui", "non", "total", "utile"] as const
export type VideoSortCol = (typeof VIDEO_SORT_COLS)[number]

export const VIDEO_SORT_LABELS: Record<VideoSortCol, SortLabel> = {
  video: "vidéo",
  revision: "révision",
  oui: "oui",
  non: "non",
  total: "total",
  utile: "pourcentage utile",
}

/** Share of « Oui », rounded to the unit; null without any answer (not 0 %: nobody said no). */
export function usefulPercent(row: Pick<FeedbackSummaryRow, "yes" | "total">): number | null {
  return row.total === 0 ? null : Math.round((row.yes / row.total) * 100)
}

export function videoSortKey(row: FeedbackSummaryRow, col: VideoSortCol): SortValue {
  switch (col) {
    // A video no longer in the catalogue has no title: last, as on the page.
    case "video": return row.title
    case "revision": return row.revision
    case "oui": return row.yes
    case "non": return row.no
    case "total": return row.total
    // The exact share, not the rounded one shown: 2 of 3 comes after 66 of 100.
    case "utile": return row.total === 0 ? null : row.yes / row.total
  }
}
