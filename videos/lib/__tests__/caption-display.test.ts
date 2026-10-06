import { test } from "vitest"
import assert from "node:assert/strict"
import { captionDisplayText, readableCaptions } from "../captions"
test("display dates and hours in French without touching ordinary prose", () => {
  assert.equal(captionDisplayText("le vingt-huit novembre deux mille vingt-six, à onze heures trente"), "le 28/11/2026, à 11 h 30")
  assert.equal(captionDisplayText("de dix heures à vingt-deux heures"), "de 10 h à 22 h")
  assert.equal(captionDisplayText("deux personnes, trente jours, un email"), "deux personnes, trente jours, un email")
})
test("normalized captions remain two lines and retain scene bounds", () => {
  const cues = readableCaptions("Le quatorze novembre deux mille vingt-six, de onze heures à douze heures trente, retrouvons le programme de notre association.", 1000, 12000)
  assert.equal(cues[0].startMs, 1000); assert.equal(cues.at(-1)!.endMs, 13000)
  assert(cues.every(c => c.text.split("\n").length <= 2 && c.text.split("\n").every(line => line.length <= 42)))
})
