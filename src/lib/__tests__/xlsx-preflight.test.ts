// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { crc32, deflateRawSync } from "node:zlib"
import ExcelJS from "exceljs"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import { countCellsAndRows, preflightXlsx, XLSX_LIMITS, type XlsxLimits } from "../xlsx-preflight"
import { analyseImport } from "../member-import-server"
import type { OrgScopedPrisma } from "../prisma-org"

type Entry = { name: string; data: Buffer; method?: 0 | 8; declaredSize?: number; flags?: number }

/** Minimal ZIP writer, so tests can lie about sizes the way a crafted upload would. */
function zip(entries: Entry[], opts: { declaredCount?: number; zip64?: boolean; prefix?: number } = {}): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const method = e.method ?? 8
    const body = method === 8 ? deflateRawSync(e.data) : e.data
    const name = Buffer.from(e.name)
    const size = e.declaredSize ?? e.data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(e.flags ?? 0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc32(e.data), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const extra = Buffer.alloc(opts.zip64 ? 28 : 0)
    if (opts.zip64) {
      extra.writeUInt16LE(0x0001, 0)
      extra.writeUInt16LE(24, 2)
      extra.writeBigUInt64LE(BigInt(size), 4)
      extra.writeBigUInt64LE(BigInt(body.length), 12)
      extra.writeBigUInt64LE(BigInt(offset), 20)
    }
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(e.flags ?? 0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc32(e.data), 16)
    central.writeUInt32LE(opts.zip64 ? 0xffffffff : body.length, 20)
    central.writeUInt32LE(opts.zip64 ? 0xffffffff : size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(extra.length, 30)
    central.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name, extra)
    offset += local.length + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const count = opts.declaredCount ?? entries.length
  const tail: Buffer[] = []
  if (opts.zip64) {
    const record = Buffer.alloc(56)
    record.writeUInt32LE(0x06064b50, 0)
    record.writeBigUInt64LE(BigInt(44), 4)
    record.writeUInt16LE(45, 12)
    record.writeUInt16LE(45, 14)
    record.writeBigUInt64LE(BigInt(count), 24)
    record.writeBigUInt64LE(BigInt(count), 32)
    record.writeBigUInt64LE(BigInt(cd.length), 40)
    record.writeBigUInt64LE(BigInt(offset), 48)
    const locator = Buffer.alloc(20)
    locator.writeUInt32LE(0x07064b50, 0)
    locator.writeBigUInt64LE(BigInt(offset + cd.length), 8)
    locator.writeUInt32LE(1, 16)
    tail.push(record, locator)
  }
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : count, 8)
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : count, 10)
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : cd.length, 12)
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 16)
  return Buffer.concat([Buffer.alloc(opts.prefix ?? 0, 0x20), ...locals, cd, ...tail, eocd])
}

async function realWorkbook(lines = 1): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Membres")
  ws.addRow(["Prénom", "Nom", "E-mail", "Téléphone", "Tags", "Adresse", "NPA", "Ville", "Pays", "Notes"])
  for (let i = 0; i < lines; i++) {
    ws.addRow([`Prénom ${i}`, `Nom ${i}`, `membre${i}@example.com`, "+41 79 123 45 67", "bar, montage", `Rue ${i}`, "1000", "Lausanne", "Suisse", "Disponible le week-end"])
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** The entries of a real workbook, to rebuild it in another ZIP layout. */
async function entriesOf(workbook: Buffer): Promise<Entry[]> {
  const archive = await JSZip.loadAsync(workbook)
  return Promise.all(Object.values(archive.files).filter((f) => !f.dir).map(async (f) => ({ name: f.name, data: await f.async("nodebuffer") })))
}

async function excelLoads(workbook: Buffer): Promise<number> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(workbook as unknown as ArrayBuffer)
  return wb.worksheets[0]?.rowCount ?? 0
}

const MB = 1024 * 1024
const small: XlsxLimits = { maxEntries: 10, maxEntryBytes: 1000, maxTotalBytes: 10_000, maxCells: 100, maxRows: 100 }

describe("preflightXlsx", () => {
  it("accepts a workbook written by ExcelJS", async () => {
    expect(preflightXlsx(await realWorkbook()).ok).toBe(true)
  })

  it("accepts a full 5,000-line, 10-column member workbook", async () => {
    expect(preflightXlsx(await realWorkbook(5000)).ok).toBe(true)
  })

  it("accepts 5,000 members with long notes (inflated text above the old 4 MB cap)", async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Membres")
    ws.addRow(["Prénom", "Nom", "E-mail", "Notes"])
    for (let i = 0; i < 5000; i++) ws.addRow([`P${i}`, `N${i}`, `m${i}@example.com`, `${i} ${"x".repeat(1000)}`])
    expect(preflightXlsx(Buffer.from(await wb.xlsx.writeBuffer())).ok).toBe(true)
  })

  it("accepts the ZIP layouts ExcelJS reads: ZIP64, prepended bytes, archive comment", async () => {
    const entries = await entriesOf(await realWorkbook(3))
    const zip64 = zip(entries, { zip64: true })
    expect(await excelLoads(zip64)).toBe(4)
    expect(preflightXlsx(zip64).ok).toBe(true)

    const prefixed = zip(entries, { prefix: 6 })
    expect(await excelLoads(prefixed)).toBe(4)
    expect(preflightXlsx(prefixed).ok).toBe(true)

    const plain = zip(entries)
    const commented = Buffer.concat([plain, Buffer.from("commentaire")])
    commented.writeUInt16LE(11, plain.length - 2)
    expect(await excelLoads(commented)).toBe(4)
    expect(preflightXlsx(commented).ok).toBe(true)
  })

  it("rejects a ZIP64 bomb whose 64-bit sizes lie", () => {
    const bomb = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(30 * MB), declaredSize: 1024 }], { zip64: true })
    expect(preflightXlsx(bomb)).toEqual({ ok: false, reason: "too-large" })
  })

  it("accepts stored and deflated entries whose sizes are honest", () => {
    const result = preflightXlsx(zip([
      { name: "a.xml", data: Buffer.from("<a/>"), method: 0 },
      { name: "b.xml", data: Buffer.from("<b>".repeat(100)) },
    ]))
    expect(result).toEqual({ ok: true, entries: 2, totalBytes: 4 + 300 })
  })

  it("rejects a small bomb that lies about its uncompressed size (regression #1043)", () => {
    // About 30 KB on disk, 30 MB once inflated, declared as 1 KB.
    const bomb = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(30 * MB), declaredSize: 1024 }])
    expect(bomb.length).toBeLessThan(100 * 1024)
    expect(preflightXlsx(bomb)).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects an honest entry declared above the per-entry cap", () => {
    const big = zip([{ name: "sheet.xml", data: Buffer.alloc(XLSX_LIMITS.maxEntryBytes + 1) }])
    expect(preflightXlsx(big)).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects entries that together exceed the total cap", () => {
    const limits = { ...small, maxTotalBytes: 1500 }
    const archive = zip([
      { name: "a", data: Buffer.alloc(800) },
      { name: "b", data: Buffer.alloc(800) },
    ])
    expect(preflightXlsx(archive, limits)).toEqual({ ok: false, reason: "too-large" })
    expect(preflightXlsx(archive, { ...limits, maxTotalBytes: 1600 }).ok).toBe(true)
  })

  it("rejects too many entries", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}`, data: Buffer.from("x") }))
    expect(preflightXlsx(zip(entries), small)).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects a sheet of tiny cells that fits the byte caps (ExcelJS memory per cell)", () => {
    // About 100 KB on disk and 4 MB inflated, but 250,000 cells.
    const cells = "<c><v>1</v></c>".repeat(10)
    const rows = Array.from({ length: 25_000 }, () => `<row>${cells}</row>`).join("")
    const sheet = Buffer.from(`<worksheet><sheetData>${rows}</sheetData></worksheet>`)
    expect(sheet.length).toBeLessThan(XLSX_LIMITS.maxEntryBytes)
    expect(preflightXlsx(zip([{ name: "xl/worksheets/sheet1.xml", data: sheet }]))).toEqual({ ok: false, reason: "too-large" })
  })

  it("caps cells and rows across every entry, whatever its name", () => {
    const limits = { ...small, maxEntryBytes: 10_000 }
    const sheet = (n: number) => Buffer.from(`<sheetData>${"<row r=\"1\"><c r=\"A1\"/></row>".repeat(n)}</sheetData>`)
    expect(preflightXlsx(zip([{ name: "xl/worksheets/sheet1.xml", data: sheet(60) }, { name: "a.bin", data: sheet(40) }]), limits).ok).toBe(true)
    expect(preflightXlsx(zip([{ name: "xl/worksheets/sheet1.xml", data: sheet(60) }, { name: "a.bin", data: sheet(41) }]), limits)).toEqual({ ok: false, reason: "too-large" })
  })

  it("checks every central header that follows, whatever the declared count (as JSZip does)", () => {
    const entries = [{ name: "a", data: Buffer.from("x") }, { name: "b", data: Buffer.alloc(2000) }]
    expect(preflightXlsx(zip(entries, { declaredCount: 1 }), small)).toEqual({ ok: false, reason: "too-large" })
    expect(preflightXlsx(zip(entries.slice(0, 1), { declaredCount: 2 }), small).ok).toBe(true)
  })

  it("rejects an entry that inflates to less than declared", () => {
    expect(preflightXlsx(zip([{ name: "a", data: Buffer.from("hello"), declaredSize: 50 }]))).toEqual({ ok: false, reason: "malformed" })
  })

  it("rejects malformed and unsupported archives", () => {
    const good = zip([{ name: "a", data: Buffer.from("hello") }])
    expect(preflightXlsx(Buffer.from("prenom,nom\nAlice,Martin"))).toEqual({ ok: false, reason: "malformed" })
    expect(preflightXlsx(good.subarray(0, good.length - 5))).toEqual({ ok: false, reason: "malformed" })
    expect(preflightXlsx(zip([{ name: "a", data: Buffer.from("x"), flags: 1 }]))).toEqual({ ok: false, reason: "malformed" })
    const corrupt = Buffer.from(good)
    corrupt.writeUInt32LE(0xdeadbeef, 0) // local header signature
    expect(preflightXlsx(corrupt)).toEqual({ ok: false, reason: "malformed" })
    expect(preflightXlsx(zip([]))).toEqual({ ok: false, reason: "malformed" })
  })
})

describe("countCellsAndRows", () => {
  it("counts cell and row opening tags, self-closing included", () => {
    const xml = Buffer.from('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"/></row>\n<row\tr="2"/><cols><col min="1"/></cols><c:chart/><rowBreaks/></sheetData>')
    expect(countCellsAndRows(xml)).toEqual({ cells: 2, rows: 2 })
  })
})

describe("analyseImport with a zip bomb", () => {
  it("answers 413 in French before ExcelJS or the database is reached", async () => {
    const bomb = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(30 * MB), declaredSize: 1024 }])
    const file = new File([new Uint8Array(bomb)], "membres.xlsx")
    const db = new Proxy({}, { get: () => { throw new Error("database must not be reached") } }) as unknown as OrgScopedPrisma
    const result = await analyseImport(file, db, "org-1", "skip")
    expect(result).toEqual({ ok: false, status: 413, error: expect.stringContaining("décompressé") })
  })
})
