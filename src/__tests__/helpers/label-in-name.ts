/**
 * WCAG 2.5.3 (Label in Name) as axe-core 4.14 checks it (`label-content-name-mismatch`): both
 * texts lowercased, NFKD, parentheticals removed, every character that is not a letter or a
 * number turned into a space; the words of the visible text must appear, in a row, among the
 * words of the accessible name. For unit tests of name builders, next to the E2E axe gate.
 */
function words(text: string): string[] {
  let s = text.toLowerCase().normalize("NFKD")
  for (let prev = ""; prev !== s; ) {
    prev = s
    s = s.replace(/\([^()]*\)/g, "")
  }
  return s
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

export function visibleTextInName(visible: string, name: string): boolean {
  const v = words(visible)
  const n = words(name)
  for (let i = 0; i + v.length <= n.length; i++) {
    if (v.every((w, j) => w === n[i + j])) return true
  }
  return false
}
