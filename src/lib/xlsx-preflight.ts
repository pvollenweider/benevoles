// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ZIP preflight for uploaded .xlsx files (#1043). ExcelJS inflates every entry in memory before
 * the import can count rows, so a 2 MB workbook could expand to gigabytes. This walks the central
 * directory, caps the entry count and the declared sizes, then inflates every entry against a byte
 * budget: declared sizes come from the uploader, so only the real output counts. Each entry must
 * inflate to exactly its declared size, which is what ExcelJS will then inflate from the same
 * central directory. ExcelJS also builds one object per cell and row, which costs far more than
 * the XML (a 10 MB sheet of tiny cells took about 350 MB of memory), so cells and rows are counted
 * too. At these caps, the worst cases measured add about 130 MB each (all cells and rows, or all
 * text). Server only (node:zlib).
 */
import { inflateRawSync } from "node:zlib"

export type XlsxLimits = { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number; maxCells: number; maxRows: number }

/**
 * A 5,000-line import (MAX_IMPORT_LINES) of 24 columns fits, with long notes and room for formatted
 * empty rows below the data. Cells and rows are summed over every worksheet, since ExcelJS loads
 * them all; they bound ExcelJS's memory, while the byte caps bound the inflated text.
 */
export const XLSX_LIMITS: XlsxLimits = {
  maxEntries: 1000,
  maxEntryBytes: 12 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
  maxCells: 120_000,
  maxRows: 50_000,
}

export type XlsxPreflightResult = { ok: true; entries: number; totalBytes: number } | { ok: false; reason: "malformed" | "too-large" }

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const ZIP64_LOCATOR_SIG = 0x07064b50
const ZIP64_EOCD_SIG = 0x06064b50
const CENTRAL_MIN = 46
const LOCAL_MIN = 30

const isTagEnd = (b: number | undefined) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x2f || b === 0x3e

/** Counts `<c` and `<row` opening tags, the elements ExcelJS turns into cells and rows. */
export function countCellsAndRows(xml: Buffer): { cells: number; rows: number } {
  let cells = 0
  let rows = 0
  for (let i = xml.indexOf(0x3c); i !== -1; i = xml.indexOf(0x3c, i + 1)) {
    if (xml[i + 1] === 0x63 && isTagEnd(xml[i + 2])) cells++
    else if (xml[i + 1] === 0x72 && xml[i + 2] === 0x6f && xml[i + 3] === 0x77 && isTagEnd(xml[i + 4])) rows++
  }
  return { cells, rows }
}

const malformed: XlsxPreflightResult = { ok: false, reason: "malformed" }
const tooLarge: XlsxPreflightResult = { ok: false, reason: "too-large" }

class Malformed extends Error {}

/** Bounds-checked little-endian reads: any read past the end means the archive is malformed. */
function u16(buf: Buffer, at: number): number {
  if (at < 0 || at + 2 > buf.length) throw new Malformed()
  return buf.readUInt16LE(at)
}
function u32(buf: Buffer, at: number): number {
  if (at < 0 || at + 4 > buf.length) throw new Malformed()
  return buf.readUInt32LE(at)
}
function u64(buf: Buffer, at: number): number {
  if (at < 0 || at + 8 > buf.length) throw new Malformed()
  const value = buf.readBigUInt64LE(at)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Malformed()
  return Number(value)
}

function lastIndexOfSignature(buf: Buffer, sig: number): number {
  for (let i = buf.length - 4; i >= 0; i--) if (buf.readUInt32LE(i) === sig) return i
  return -1
}

type CentralDirectory = { start: number; records: number; zero: number }

/**
 * Locates the central directory the way JSZip (ExcelJS's unzipper) does, so the entries checked
 * here are the ones ExcelJS will inflate: last end-of-central-directory signature, ZIP64 records
 * when a field is saturated, and an offset correction for bytes prepended to the archive.
 */
function locateCentralDirectory(buf: Buffer): CentralDirectory {
  const eocd = lastIndexOfSignature(buf, EOCD_SIG)
  if (eocd < 0) throw new Malformed()
  const disk = u16(buf, eocd + 4)
  const cdDisk = u16(buf, eocd + 6)
  const diskRecords = u16(buf, eocd + 8)
  let records = u16(buf, eocd + 10)
  let cdSize = u32(buf, eocd + 12)
  let cdOffset = u32(buf, eocd + 16)
  let expectedEnd: number

  const zip64 = disk === 0xffff || cdDisk === 0xffff || diskRecords === 0xffff || records === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff
  if (zip64) {
    const locator = lastIndexOfSignature(buf, ZIP64_LOCATOR_SIG)
    if (locator < 0) throw new Malformed()
    let record = u64(buf, locator + 8)
    if (record + 4 > buf.length || buf.readUInt32LE(record) !== ZIP64_EOCD_SIG) {
      record = lastIndexOfSignature(buf, ZIP64_EOCD_SIG)
      if (record < 0) throw new Malformed()
    }
    const recordSize = u64(buf, record + 4)
    records = u64(buf, record + 32)
    cdSize = u64(buf, record + 40)
    cdOffset = u64(buf, record + 48)
    expectedEnd = cdOffset + cdSize + 20 + 12 + recordSize
  } else {
    expectedEnd = cdOffset + cdSize
  }
  const extraBytes = eocd - expectedEnd
  if (extraBytes < 0) throw new Malformed()
  // JSZip keeps the declared offsets when a central header sits at the end record's position,
  // which cannot happen since that position holds the end record's own signature.
  return { start: cdOffset + extraBytes, records, zero: extraBytes }
}

/** Reads a ZIP64 extended information field (0x0001) the way JSZip does: last one wins. */
function zip64Extra(buf: Buffer, from: number, length: number): number | null {
  const end = from + length
  let found: number | null = null
  let at = from
  while (at + 4 < end) {
    const id = u16(buf, at)
    const size = u16(buf, at + 2)
    if (id === 0x0001) found = at + 4
    at += 4 + size
  }
  if (end > buf.length) throw new Malformed()
  return found
}

function inspect(buf: Buffer, limits: XlsxLimits): XlsxPreflightResult {
  const cd = locateCentralDirectory(buf)

  let declaredTotal = 0
  let actualTotal = 0
  let cells = 0
  let rows = 0
  let entries = 0
  // Like JSZip, read central headers for as long as their signature follows: their declared
  // count is only a hint, and the entries actually read are the ones that get inflated.
  for (let pos = cd.start; pos + 4 <= buf.length && buf.readUInt32LE(pos) === CENTRAL_SIG; ) {
    if (++entries > limits.maxEntries) return tooLarge
    const flags = u16(buf, pos + 8)
    const method = u16(buf, pos + 10)
    let compressedSize = u32(buf, pos + 20)
    let size = u32(buf, pos + 24)
    const nameLen = u16(buf, pos + 28)
    const extraLen = u16(buf, pos + 30)
    const commentLen = u16(buf, pos + 32)
    let localOffset = u32(buf, pos + 42)
    const next = pos + CENTRAL_MIN + nameLen + extraLen + commentLen
    if (next > buf.length) return malformed

    let extra = zip64Extra(buf, pos + CENTRAL_MIN + nameLen, extraLen)
    if (extra !== null) {
      if (size === 0xffffffff) { size = u64(buf, extra); extra += 8 }
      if (compressedSize === 0xffffffff) { compressedSize = u64(buf, extra); extra += 8 }
      if (localOffset === 0xffffffff) localOffset = u64(buf, extra)
    }

    if (flags & 0x0001) return malformed // encrypted: JSZip refuses it too
    if (method !== 0 && method !== 8) return malformed // only stored and deflate
    if (size > limits.maxEntryBytes) return tooLarge
    declaredTotal += size
    if (declaredTotal > limits.maxTotalBytes) return tooLarge

    const local = localOffset + cd.zero
    if (u32(buf, local) !== LOCAL_SIG) return malformed
    const dataStart = local + LOCAL_MIN + u16(buf, local + 26) + u16(buf, local + 28)
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buf.length) return malformed
    const data = buf.subarray(dataStart, dataEnd)

    let content: Buffer
    if (method === 0) {
      content = data
    } else {
      // The budget is the declared size: an entry that inflates past it lies about its size.
      try {
        content = inflateRawSync(data, { maxOutputLength: Math.max(1, size) })
      } catch (err) {
        return err instanceof RangeError ? tooLarge : malformed
      }
    }
    if (content.length !== size) return malformed
    actualTotal += content.length
    if (actualTotal > limits.maxTotalBytes) return tooLarge
    // Every entry is counted, not only xl/worksheets/: the name ExcelJS sees can come from a
    // Unicode extra field instead of the one read here.
    const counted = countCellsAndRows(content)
    cells += counted.cells
    rows += counted.rows
    if (cells > limits.maxCells || rows > limits.maxRows) return tooLarge
    pos = next
  }
  if (entries === 0) return malformed
  return { ok: true, entries, totalBytes: actualTotal }
}

export function preflightXlsx(buf: Buffer, limits: XlsxLimits = XLSX_LIMITS): XlsxPreflightResult {
  try {
    return inspect(buf, limits)
  } catch (err) {
    if (err instanceof Malformed) return malformed
    throw err
  }
}
