// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, cp } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { ProductBuild } from "../lib/product-build"
const exec = promisify(execFile)

async function main() {
  const snapshot = path.resolve(process.argv[2] ?? "")
  if (!/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(snapshot)) throw new Error("Explicit temporary video snapshot required")
  const { stdout: revision } = await exec("git", ["rev-parse", "origin/main"])
  const commit = revision.trim()
  const { stdout: remote } = await exec("git", ["ls-remote", "origin", "refs/heads/main"])
  if (remote.split(/\s/)[0] !== commit) throw new Error("Remote main advanced; refresh the target before building")
  const { stdout: tree } = await exec("git", ["ls-tree", "-r", commit], { maxBuffer: 10 * 1024 * 1024 })
  const selected = tree.trim().split("\n").map(line => {
    const [header, file] = line.split("\t")
    return { hash: header.split(" ")[2], file }
  }).filter(item => item.file.startsWith("src/") || item.file.startsWith("public/") || item.file.startsWith("prisma/") || item.file.startsWith("videos/manifests/") || item.file.startsWith("videos/scripts/") || ["videos/catalog.json", "videos/MASTERCLASS_PLAN.md"].includes(item.file) || item.file.endsWith(".md") && !item.file.startsWith("videos/") && !["AGENTS.md", "CLAUDE.md"].includes(item.file) || ["next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs", "prisma.config.ts"].includes(item.file))
  const sourceDigest = createHash("sha256")
  for (const item of selected) {
    const bytes = await readFile(path.join(snapshot, item.file))
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
    if (blob !== item.hash) throw new Error(`Snapshot differs from main: ${item.file}`)
    sourceDigest.update(item.file).update("\0").update(bytes)
  }
  console.log(`Verified ${selected.length} product inputs against main ${commit}; building locally`)
  const { stdout, stderr } = await exec(process.execPath, ["--import", "tsx", "videos/tools/local-production.ts", "build", snapshot], { maxBuffer: 20 * 1024 * 1024, timeout: 600_000 })
  console.log(stdout); if (stderr) console.error(stderr)
  // Match the Docker runner's explicit fs-read sources, absent from Next tracing.
  const runner = path.join(snapshot, ".next/standalone")
  for (const file of ["public", ".next/static", "GUIDE_ADMIN.md", "GUIDE_BENEVOLE.md", "FEATURES.md", "ACCESSIBILITE.md", "videos/catalog.json", "videos/manifests", "videos/scripts", "videos/MASTERCLASS_PLAN.md"]) {
    await cp(path.join(snapshot, file), path.join(runner, file), { recursive: true })
  }
  const buildId = (await readFile(path.join(snapshot, ".next/BUILD_ID"), "utf8")).trim()
  const { stdout: sourceTree } = await exec("git", ["rev-parse", `${commit}^{tree}`])
  const proof: ProductBuild = { commit, sourceTree: sourceTree.trim(), productSourceSha256: sourceDigest.digest("hex"), buildId, snapshot, builtAt: new Date().toISOString() }
  await writeFile(path.join(snapshot, ".video-build.json"), JSON.stringify(proof, null, 2))
  console.log(`Product build proof saved: ${snapshot}/.video-build.json`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Clean main build failed"); process.exitCode = 1 })
