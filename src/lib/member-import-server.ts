// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server half of the member import (#464): reads the uploaded file, plans it against the
 * organisation's members, and hashes both the file and the plan. Used by the preview and by the
 * confirmed import, so they can only disagree when the file or the members changed. Nothing is
 * stored: the file lives only in the request.
 */
import { createHash } from "node:crypto"
import type { OrgScopedPrisma } from "./prisma-org"
import { parseCsv, parseXlsx } from "./csv-import"
import { MAX_IMPORT_BYTES, MAX_IMPORT_LINES, planDigest, planImport, type ImportPlan, type OnDuplicate } from "./member-import-plan"

export type ImportAnalysis = {
  plan: ImportPlan
  fileHash: string
  planHash: string
  detectedColumns: Record<string, string | null>
  totalParsed: number
}

export type AnalysisResult = { ok: true; analysis: ImportAnalysis } | { ok: false; status: number; error: string }

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex")

export async function analyseImport(file: unknown, db: OrgScopedPrisma, organizationId: string, onDuplicate: OnDuplicate): Promise<AnalysisResult> {
  if (!(file instanceof File)) return { ok: false, status: 400, error: "Fichier manquant" }
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, status: 413, error: "Fichier trop volumineux : 2 Mo au plus." }

  const buffer = Buffer.from(await file.arrayBuffer())
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

  let parsed
  try {
    parsed = isXlsx ? await parseXlsx(buffer) : parseCsv(buffer)
  } catch {
    // No detail logged: the parser error can quote the file's content.
    console.error("Member import parse error")
    return { ok: false, status: 400, error: "Impossible de lire le fichier : vérifiez qu'il s'agit d'un CSV ou d'un .xlsx." }
  }
  if (parsed.rows.length === 0 && parsed.errors.length === 0) return { ok: false, status: 400, error: "Le fichier est vide" }
  if (parsed.rows.length + parsed.errors.length > MAX_IMPORT_LINES) {
    return { ok: false, status: 413, error: `Trop de lignes : ${MAX_IMPORT_LINES} au plus par import.` }
  }

  const existing = await db.volunteer.findMany({
    where: { organizationId, email: { not: null } },
    select: { id: true, email: true, tags: true },
  })
  const plan = planImport(parsed, existing, onDuplicate)
  return {
    ok: true,
    analysis: {
      plan,
      fileHash: sha256(buffer),
      planHash: sha256(planDigest(plan, onDuplicate)),
      detectedColumns: parsed.detectedColumns,
      totalParsed: parsed.rows.length,
    },
  }
}
