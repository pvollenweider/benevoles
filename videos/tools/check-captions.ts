import assert from "node:assert/strict"
import { readableCaptions } from "../lib/captions"
import { loadCatalog, loadManifest } from "../lib/manifest"
async function main() {
  const entries = (await loadCatalog()).videos
  let total = 0
  for (const entry of entries) {
    const manifest = await loadManifest(entry.id)
    for (const segment of manifest.segments) {
      const cues = readableCaptions(segment.transcript, 1000, segment.fallbackDurationMs)
      assert.equal(cues[0].startMs, 1000)
      assert.equal(cues.at(-1)!.endMs, 1000 + segment.fallbackDurationMs)
      assert.equal(cues.map(cue => cue.text).join(" ").replace(/\s+/g, " "), segment.transcript.replace(/\s+/g, " ").trim())
      for (const [index, cue] of cues.entries()) {
        assert(cue.endMs - cue.startMs <= 7000 && cue.endMs > cue.startMs)
        assert(cue.text.split("\n").length <= 2)
        assert(cue.text.split("\n").every(line => line.length <= 42))
        if (index) assert.equal(cues[index - 1].endMs, cue.startMs)
        total++
      }
    }
  }
  assert.throws(() => readableCaptions("mot", 0, 8000))
  console.log(`Readable-caption checks passed: ${entries.length} manifests, ${total} cues; timing remains proportional and needs audiovisual review.`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Caption check failed"); process.exitCode = 1 })
