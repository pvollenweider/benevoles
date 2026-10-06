// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Readable cues. Timing is proportional to spoken words, not a forced-alignment claim. */
/** Display only: never changes the spoken transcript or its source-audit identity. */
export function captionDisplayText(text: string): string {
  const numbers: Record<string, number> = { zéro: 0, une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, dixsept: 17, dixhuit: 18, dixneuf: 19, vingt: 20, vingtetun: 21, vingtdeux: 22, vingttrois: 23, vingtquatre: 24, vingtcinq: 25, vingtsix: 26, vingtsept: 27, vingthuit: 28, vingtneuf: 29, trente: 30, trenteetun: 31 }
  const value = (word: string) => numbers[word.toLocaleLowerCase("fr").replace(/[\s-]/g, "")]
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
  // Limit numeric substitution to explicit date/time syntax, not free prose.
  const numeral = "(?:vingt(?:[- ](?:et[- ]un|deux|trois|quatre|cinq|six|sept|huit|neuf))?|trente(?:[- ]et[- ]un)?|dix(?:[- ](?:sept|huit|neuf))?|quatorze|quinze|seize|treize|douze|onze|zéro|une?|deux|trois|quatre|cinq|six|sept|huit|neuf)"
  let result = text.replace(new RegExp(`\\b(${numeral}) (${months.join("|")}) (deux mille vingt(?:[- ](?:six|sept|huit|neuf))?|20\\d{2})\\b`, "gi"), (full, day: string, month: string, year: string) => {
    const d = value(day), m = months.indexOf(month.toLowerCase()) + 1
    const y = /^20\d{2}$/.test(year) ? Number(year) : 2020 + (value(year.replace(/^deux mille vingt[- ]?/i, "")) ?? 0)
    return d === undefined ? full : `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
  })
  result = result.replace(new RegExp(`\\b(${numeral}) heures?(?: (trente|quinze))?\\b`, "gi"), (full, hour: string, minutes?: string) => {
    const h = value(hour), m = minutes ? value(minutes) : undefined
    return h === undefined || h > 24 ? full : `${h} h${m === undefined ? "" : ` ${String(m).padStart(2, "0")}`}`
  })
  return result
}

export function readableCaptions(text: string, startMs: number, durationMs: number) {
  if (!(durationMs > 0) || startMs < 0) throw new Error("Invalid caption interval")
  const words = captionDisplayText(text).trim().split(/\s+/).filter(Boolean)
  if (!words.length || words.some(word => word.length > 42)) throw new Error("Caption text contains an empty or overlong word")
  const maxWords = Math.max(1, Math.floor(words.length * 6_800 / durationMs))
  const blocks: { text: string; words: number }[] = []
  let cursor = 0
  while (cursor < words.length) {
    const lines = [""]
    let count = 0
    while (cursor < words.length && count < maxWords) {
      const word = words[cursor]
      const line = lines.at(-1)!
      if (line.length + (line ? 1 : 0) + word.length > 42) {
        if (lines.length === 2) break
        lines.push("")
      }
      const last = lines.length - 1
      lines[last] += `${lines[last] ? " " : ""}${word}`
      cursor++; count++
    }
    blocks.push({ text: lines.join("\n"), words: count })
  }
  let consumed = 0
  return blocks.map(block => {
    const beginning = startMs + Math.round(durationMs * consumed / words.length)
    consumed += block.words
    const end = startMs + Math.round(durationMs * consumed / words.length)
    if (end - beginning > 7_000) throw new Error("Narration too slow for readable seven-second captions; needs manual alignment")
    return { startMs: beginning, endMs: end, text: block.text }
  })
}
