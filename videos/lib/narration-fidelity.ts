// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

const normalized = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\be-mail\b/g, "email").replace(/[^a-z0-9]+/g, " ").trim()

function wordDistance(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]))
    row = next
  }
  return row[b.length]
}

/** Review substantially misplaced beginnings/endings even in a long, low-WER chapter. */
export function mismatchedNarrationEdges(expected: string, recognized: string): string[] {
  const reference = normalized(expected).split(" ").filter(Boolean)
  const heard = normalized(recognized).split(" ").filter(Boolean)
  const length = Math.min(8, reference.length)
  if (!length) return ["empty reference"]
  const tolerance = Math.floor(length * 0.375)
  return [
    ...(wordDistance(reference.slice(0, length), heard.slice(0, length)) > tolerance ? ["opening words displaced or missing"] : []),
    ...(wordDistance(reference.slice(-length), heard.slice(-length)) > tolerance ? ["ending words displaced or missing"] : []),
  ]
}

/** A small word-error rate can conceal a stage direction spoken by the TTS. */
export function unexpectedPauseInstructions(expected: string, recognized: string): string[] {
  const reference = ` ${normalized(expected)} `
  const heard = ` ${normalized(recognized)} `
  return ["un petit instant s il vous plait", "je passe", "courte pause", "short pause"]
    .filter(phrase => heard.includes(` ${phrase} `) && !reference.includes(` ${phrase} `))
}
