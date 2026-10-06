// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Readable cues. Timing is proportional to spoken words, not a forced-alignment claim. */
export function readableCaptions(text: string, startMs: number, durationMs: number) {
  if (!(durationMs > 0) || startMs < 0) throw new Error("Invalid caption interval")
  const words = text.trim().split(/\s+/).filter(Boolean)
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
