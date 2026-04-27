import { parse } from "csv-parse/sync"
import ExcelJS from "exceljs"

export type ParsedMemberRow = {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  tags?: string[]
}

export type ImportError = { line: number; reason: string }
export type ImportPreview = {
  rows: ParsedMemberRow[]
  errors: ImportError[]
  detectedColumns: Record<string, string | null> // canonical -> source header
}

const HEADER_ALIASES: Record<keyof ParsedMemberRow, string[]> = {
  firstName: ["firstname", "first_name", "first name", "prenom", "prénom", "first"],
  lastName: ["lastname", "last_name", "last name", "nom", "famille", "last", "name", "nom de famille"],
  email: ["email", "e-mail", "mail", "courriel", "adresse email", "adresse mail"],
  phone: ["phone", "telephone", "téléphone", "tel", "mobile", "portable", "numero", "numéro"],
  tags: ["tags", "tag", "labels", "label", "groupes", "categories", "catégories"],
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim()
}

function detectColumns(headers: string[]): Record<string, string | null> {
  const detected: Record<string, string | null> = {
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    tags: null,
  }
  const normalizedHeaders = headers.map((h) => normalize(h))

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.some((a) => normalize(a) === normalizedHeaders[i])) {
        detected[canonical] = headers[i]
        break
      }
    }
  }
  return detected
}

function parseTagsValue(value: string): string[] {
  if (!value) return []
  return value
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function rowToMember(
  row: Record<string, string>,
  detected: Record<string, string | null>,
  lineNumber: number,
): { ok: true; member: ParsedMemberRow } | { ok: false; error: ImportError } {
  const get = (key: string) => {
    const sourceHeader = detected[key]
    return sourceHeader ? (row[sourceHeader] ?? "").toString().trim() : ""
  }

  const firstName = get("firstName")
  const lastName = get("lastName")

  if (!firstName && !lastName) {
    return { ok: false, error: { line: lineNumber, reason: "Prénom et nom manquants" } }
  }
  if (!firstName) {
    return { ok: false, error: { line: lineNumber, reason: "Prénom manquant" } }
  }
  if (!lastName) {
    return { ok: false, error: { line: lineNumber, reason: "Nom manquant" } }
  }

  const email = get("email") || undefined
  const phone = get("phone") || undefined
  const tags = parseTagsValue(get("tags"))

  if (email && !email.includes("@")) {
    return { ok: false, error: { line: lineNumber, reason: `Email invalide : ${email}` } }
  }

  return {
    ok: true,
    member: {
      firstName,
      lastName,
      email,
      phone,
      tags: tags.length > 0 ? tags : undefined,
    },
  }
}

export function parseCsv(content: string | Buffer): ImportPreview {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]

  if (records.length === 0) {
    return { rows: [], errors: [], detectedColumns: {} }
  }

  const detected = detectColumns(Object.keys(records[0]))
  const rows: ParsedMemberRow[] = []
  const errors: ImportError[] = []

  records.forEach((row, idx) => {
    const result = rowToMember(row, detected, idx + 2) // +2: header + 1-indexed
    if (result.ok) rows.push(result.member)
    else errors.push(result.error)
  })

  return { rows, errors, detectedColumns: detected }
}

export async function parseXlsx(buffer: Buffer): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return { rows: [], errors: [], detectedColumns: {} }

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? ""))
  })
  if (headers.length === 0) return { rows: [], errors: [], detectedColumns: {} }

  const detected = detectColumns(headers)
  const rows: ParsedMemberRow[] = []
  const errors: ImportError[] = []

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return // skip header
    const data: Record<string, string> = {}
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1)
      data[h] = cell.value == null ? "" : String(cell.value)
    })
    const result = rowToMember(data, detected, rowNumber)
    if (result.ok) rows.push(result.member)
    else errors.push(result.error)
  })

  return { rows, errors, detectedColumns: detected }
}
