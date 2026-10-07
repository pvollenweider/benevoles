// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sends the rendered videos (videos/output/<slug>/<slug>.mp4, .vtt, .txt, and the posters
 * <slug>.jpg and <slug>-og.jpg from videos/tools/posters.ts) to the media server
 * behind https://medias.benevol.app (k8s/media.yaml): only new or changed files, by SHA-256.
 *
 *   npm run video:publish -- --context <kube-context> [--apply] [ID …]
 *
 * Without --apply it only prints the plan. The kube context is required on purpose: the command
 * writes to the production cluster. Nothing is ever deleted on the server.
 */
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { catalogEntry, loadCatalog, outputRoot } from "../lib/manifest"
import { parseSha256Sum, planPublish, publishedFiles } from "../lib/publish-plan"

const NAMESPACE = "benevoles"
const TARGET = "deploy/benevoles-media"
const MEDIA_ROOT = "/usr/share/nginx/html"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const contextIndex = args.indexOf("--context")
const context = contextIndex >= 0 ? args[contextIndex + 1] : undefined
const ids = args.filter((a, i) => !a.startsWith("--") && i !== contextIndex + 1)

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")))
  })
}

function kubectl(kubeArgs: string[], input?: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("kubectl", ["--context", context!, "-n", NAMESPACE, ...kubeArgs], { stdio: [input ? "pipe" : "ignore", "pipe", "inherit"] })
    let out = ""
    child.stdout?.on("data", (d) => (out += d))
    if (input && child.stdin) input.pipe(child.stdin)
    child.on("error", reject)
    child.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`kubectl ${kubeArgs[0]} exited with ${code}`))))
  })
}

async function main() {
  if (!context) {
    console.error("Indiquez le contexte kubectl du cluster de production : --context <nom> (voir `kubectl config get-contexts`).")
    process.exit(2)
  }
  const catalog = await loadCatalog()
  const entries = ids.length ? await Promise.all(ids.map((id) => catalogEntry(id))) : catalog.videos
  const local = new Map<string, string>()
  const missing: string[] = []
  for (const entry of entries) {
    for (const file of publishedFiles(entry.manifest)) {
      const full = path.join(outputRoot, file)
      if (existsSync(full)) local.set(file, await sha256(full))
      else missing.push(file)
    }
  }

  // Checksums of what the server already has. A kubectl failure (wrong context, media server not
  // deployed yet) stops here: treating it as an empty server would resend everything.
  let remoteOut: string
  try {
    remoteOut = await kubectl(["exec", TARGET, "--", "sh", "-c", `cd ${MEDIA_ROOT} && find . -type f \\( -name '*.mp4' -o -name '*.vtt' -o -name '*.txt' -o -name '*.jpg' \\) -exec sha256sum {} + ; true`])
  } catch {
    console.error(`Serveur de médias injoignable avec le contexte « ${context} » : vérifiez le contexte, et que k8s/media.yaml est appliqué (kubectl -n ${NAMESPACE} get ${TARGET}).`)
    process.exit(1)
  }
  const plan = planPublish(local, parseSha256Sum(remoteOut))

  console.log(`Contexte ${context}, ${TARGET} (${NAMESPACE})`)
  console.log(`À envoyer (${plan.upload.length}) :`)
  for (const f of plan.upload) console.log(`  + ${f}`)
  console.log(`Inchangés : ${plan.unchanged.length}`)
  if (missing.length) console.log(`Pas encore rendus localement (ignorés) : ${missing.length}\n${missing.map((f) => `  - ${f}`).join("\n")}`)
  if (plan.extra.length) console.log(`Présents seulement sur le serveur (laissés tels quels) : ${plan.extra.length}`)

  if (!apply) {
    if (plan.upload.length) console.log("\nAperçu seulement. Relancez avec --apply (make video-publish APPLY=1) pour envoyer.")
    return
  }
  if (!plan.upload.length) {
    console.log("Rien à envoyer.")
    return
  }
  const tar = spawn("tar", ["-cf", "-", "-C", outputRoot, ...plan.upload], { stdio: ["ignore", "pipe", "inherit"] })
  await kubectl(["exec", "-i", TARGET, "--", "tar", "-xf", "-", "-C", MEDIA_ROOT], tar.stdout)
  console.log(`Envoyé : ${plan.upload.length} fichier(s).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
