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
 * too. Server only (node:zlib).
 */
import { inflateRawSync } from "node:zlib"

export type XlsxLimits = { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number; maxCells: number; maxRows: number }

/**
 * A 5,000-line import (MAX_IMPORT_LINES) of up to 20 columns fits, with room for formatted empty
 * rows below the data. Cells and rows are summed over every worksheet, since ExcelJS loads them all.
 */
export const XLSX_LIMITS: XlsxLimits = {
  maxEntries: 1000,
  maxEntryBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxCells: 5001 * 20,
  maxRows: 20_000,
}

export type XlsxPreflightResult = { ok: true; entries: number; totalBytes: number } | { ok: false; reason: "malformed" | "too-large" }

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const EOCD_MIN = 22
const CENTRAL_MIN = 46
const LOCAL_MIN = 30
const MAX_COMMENT = 0xffff

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

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT)
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG && i + EOCD_MIN + buf.readUInt16LE(i + 20) === buf.length) return i
  }
  return -1
}

export function preflightXlsx(buf: Buffer, limits: XlsxLimits = XLSX_LIMITS): XlsxPreflightResult {
  if (buf.length < EOCD_MIN) return malformed
  const eocd = findEocd(buf)
  if (eocd < 0) return malformed

  const disk = buf.readUInt16LE(eocd + 4)
  const cdDisk = buf.readUInt16LE(eocd + 6)
  const diskEntries = buf.readUInt16LE(eocd + 8)
  const entries = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  // Multi-disk and ZIP64 archives are never produced by spreadsheet software: refuse them.
  if (disk !== 0 || cdDisk !== 0 || diskEntries !== entries) return malformed
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return malformed
  if (entries === 0) return malformed
  if (entries > limits.maxEntries) return tooLarge
  if (cdOffset + cdSize !== eocd) return malformed

  let declaredTotal = 0
  let actualTotal = 0
  let cells = 0
  let rows = 0
  let pos = cdOffset
  let count = 0
  while (pos < eocd) {
    if (pos + CENTRAL_MIN > eocd || buf.readUInt32LE(pos) !== CENTRAL_SIG) return malformed
    if (++count > entries) return malformed
    const flags = buf.readUInt16LE(pos + 8)
    const method = buf.readUInt16LE(pos + 10)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const size = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const next = pos + CENTRAL_MIN + nameLen + extraLen + commentLen
    if (next > eocd) return malformed
    if (flags & 0x0001) return malformed // encrypted
    if (method !== 0 && method !== 8) return malformed // only stored and deflate
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) return malformed

    if (size > limits.maxEntryBytes) return tooLarge
    declaredTotal += size
    if (declaredTotal > limits.maxTotalBytes) return tooLarge

    if (localOffset + LOCAL_MIN > cdOffset || buf.readUInt32LE(localOffset) !== LOCAL_SIG) return malformed
    const dataStart = localOffset + LOCAL_MIN + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    const dataEnd = dataStart + compressedSize
    if (dataEnd > cdOffset) return malformed
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
  if (pos !== eocd || count !== entries) return malformed
  return { ok: true, entries, totalBytes: actualTotal }
}
