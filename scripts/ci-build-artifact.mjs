// The Next.js build shared by the CI jobs of one workflow run (E2E shards and Lighthouse, ci.yml).
// The build job writes a manifest next to the build; each job that downloads it recomputes the
// same fields from its own checkout and environment and refuses the build on any difference, so
// the tests never run against a build of other sources, other dependencies or other public
// (inlined) settings, and never fall back to building it themselves.
//
//   node scripts/ci-build-artifact.mjs write  .next/ci-build.json   (build job, after next build)
//   node scripts/ci-build-artifact.mjs verify .next/ci-build.json   (each consumer, after extraction)
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const MANIFEST_VERSION = 1

/**
 * The fields that identify a build: what it was built from and with.
 * @param {{ commit: string, tree: string, lockfile: string, node: string, platform: string,
 *   env: Record<string, string | undefined>, runId: string, buildId: string }} input
 */
export function buildManifest({ commit, tree, lockfile, node, platform, env, runId, buildId }) {
  // NEXT_PUBLIC_* values are inlined into the bundles at build time: the consumer must run with
  // the same ones. Server-only variables are read when the server starts, not part of the build.
  const publicEnv = Object.fromEntries(
    Object.keys(env)
      .filter((k) => k.startsWith("NEXT_PUBLIC_"))
      .sort()
      .map((k) => [k, env[k] ?? ""]),
  )
  return { version: MANIFEST_VERSION, commit, tree, lockfile, node, platform, publicEnv, runId, buildId }
}

const majorOf = (version) => String(version).split(".")[0]

/**
 * Differences between the manifest shipped with the build and the one the consumer computed.
 * `errors` refuse the build; `warnings` are only reported.
 * @param {ReturnType<typeof buildManifest>} shipped
 * @param {ReturnType<typeof buildManifest>} local
 */
export function compareManifests(shipped, local) {
  const errors = []
  const warnings = []
  if (!shipped || shipped.version !== MANIFEST_VERSION) {
    errors.push(`manifest version ${shipped?.version} is not ${MANIFEST_VERSION}`)
    return { errors, warnings }
  }
  // Same workflow run: an artifact from another run (or a re-uploaded one) is not this run's build.
  if (shipped.runId !== local.runId) errors.push(`built in run ${shipped.runId}, not in this run (${local.runId})`)
  // Both the commit and its tree: the commit names the sources, the tree proves the checkout matches.
  if (shipped.commit !== local.commit) errors.push(`built from commit ${shipped.commit}, checkout is ${local.commit}`)
  if (shipped.tree !== local.tree) errors.push(`built from tree ${shipped.tree}, checkout tree is ${local.tree}`)
  // The build links to node_modules (Turbopack's external packages): same lockfile, same packages.
  if (shipped.lockfile !== local.lockfile) errors.push("package-lock.json differs from the one the build used")
  if (shipped.platform !== local.platform) errors.push(`built on ${shipped.platform}, running on ${local.platform}`)
  if (majorOf(shipped.node) !== majorOf(local.node)) errors.push(`built with Node ${shipped.node}, running Node ${local.node}`)
  else if (shipped.node !== local.node) warnings.push(`built with Node ${shipped.node}, running Node ${local.node}`)
  const names = new Set([...Object.keys(shipped.publicEnv ?? {}), ...Object.keys(local.publicEnv ?? {})])
  for (const name of [...names].sort()) {
    if ((shipped.publicEnv?.[name] ?? "") !== (local.publicEnv?.[name] ?? "")) {
      errors.push(`${name} was "${shipped.publicEnv?.[name] ?? ""}" at build time, is "${local.publicEnv?.[name] ?? ""}" here`)
    }
  }
  // The extracted .next is the one the manifest describes, not a leftover or a mix.
  if (shipped.buildId !== local.buildId) errors.push(`.next/BUILD_ID is ${local.buildId}, the manifest describes ${shipped.buildId}`)
  return { errors, warnings }
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

/** The manifest of the current checkout, environment and extracted build. */
export function currentManifest(nextDir = ".next") {
  return buildManifest({
    commit: process.env.GITHUB_SHA || git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    lockfile: createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex"),
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    env: process.env,
    runId: process.env.GITHUB_RUN_ID ?? "local",
    buildId: fs.readFileSync(path.join(nextDir, "BUILD_ID"), "utf8").trim(),
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2)
  if (!["write", "verify"].includes(mode) || !file) {
    console.error("usage: node scripts/ci-build-artifact.mjs write|verify <manifest.json>")
    process.exit(2)
  }
  const local = currentManifest(path.dirname(file))
  if (mode === "write") {
    fs.writeFileSync(file, JSON.stringify(local, null, 2) + "\n")
    console.log(JSON.stringify(local, null, 2))
  } else {
    const shipped = JSON.parse(fs.readFileSync(file, "utf8"))
    const { errors, warnings } = compareManifests(shipped, local)
    for (const w of warnings) console.log(`::warning::Shared build: ${w}`)
    for (const e of errors) console.log(`::error::Shared build refused: ${e}`)
    if (errors.length > 0) process.exit(1)
    console.log(`Shared build ${shipped.buildId} matches commit ${local.commit} (tree ${local.tree}).`)
  }
}
