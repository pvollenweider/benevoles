// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { verifyProductBuild } from "../lib/product-build"
import { loadAccessibilityNativeEvidence } from "../lib/accessibility-native-evidence"
const exec = promisify(execFile)
const [kind, name, seconds] = process.argv.slice(2)
if (!["reader", "zoom"].includes(kind) || !/^[a-z0-9-]{8,80}$/.test(name ?? "") || !Number.isFinite(Number(seconds)) || Number(seconds) < 5 || Number(seconds) > 180) throw new Error("Usage: capture-accessibility-native.ts reader|zoom unique-name seconds")
const root = path.resolve("videos/output/accessibility-keyboard-display/native")
const prefix = path.join(root, name)
const scratch = await mkdtemp("/tmp/benevoles-native-proof-")
// Compile BEFORE the freshness check, so compile latency cannot consume its window.
const binary = path.join(scratch, "capture")
await exec("swiftc", ["-module-cache-path", path.join(scratch, "cache"), "videos/tools/native-accessibility-capture.swift", "-o", binary])
const current = await verifyProductBuild("http://localhost:43102")
const product = { commit: current.commit, buildId: current.buildId, productSourceSha256: current.productSourceSha256, verifiedAt: new Date().toISOString(), verification: "at-capture-start" }
const proof = path.join(scratch, "product.json")
await writeFile(proof, JSON.stringify(product), { mode: 0o600, flag: "wx" })
await new Promise<void>((resolve, reject) => {
  const child = spawn(binary, [prefix, "Un planning accessible — démonstration", seconds, "com.apple.Safari"], { stdio: "inherit", env: { ...process.env, VIDEO_NATIVE_PRODUCT_PROOF: proof, VIDEO_NATIVE_KIND: kind, VIDEO_NATIVE_LOCALE: "fr-FR" } })
  child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Native capture failed (${code})`)))
})
const file = `${prefix}.json`
const evidence = JSON.parse(await readFile(file, "utf8"))
for (const track of [evidence.video, ...(kind === "reader" ? [evidence.audio] : [])]) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", track.path])
  track.durationMs = Number(stdout.trim()) * 1000
}
if (kind === "reader") {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostdin", "-i", evidence.audio.path, "-vn", "-af", "volumedetect", "-f", "null", "-"], { maxBuffer: 2 * 1024 * 1024 })
  evidence.audioMeasurement = { sha256: evidence.audio.sha256, meanDb: Number(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]), maxDb: Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]) }
} else {
  // The operator must record actual browser-menu screenshots DURING this take.
  // This sidecar is not a substitute for zoom interaction or a generated label.
  const observations = JSON.parse(await readFile(`${prefix}.zoom-observations.json`, "utf8"))
  evidence.zoomObservations = await Promise.all(observations.map(async (o: { percent: number; capturedAt: string; path: string }) => {
    const atMs = Date.parse(o.capturedAt) - Date.parse(evidence.captureStartedAt)
    if (![200, 400].includes(o.percent) || !Number.isFinite(atMs) || atMs < 0 || atMs >= evidence.video.durationMs || !path.resolve(o.path).startsWith(root + path.sep)) throw new Error("Zoom observation must belong to this actual capture")
    return { percent: o.percent, atMs, method: "native-browser-menu", screenshot: { path: path.resolve(o.path), sha256: createHash("sha256").update(await readFile(o.path)).digest("hex") } }
  }))
}
await writeFile(file, JSON.stringify(evidence, null, 2))
await loadAccessibilityNativeEvidence(file, { nativeRoot: root, currentProduct: current })
console.log(`Native evidence validated: ${file}`)
