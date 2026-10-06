// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Render every generated document page. Rendering alone does not claim visual approval. */
import { execFile } from "node:child_process"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)

async function main() {
  const directory = path.resolve(process.argv[2] ?? "")
  const allowed = ["volunteer-badges", "event-reports"].map(slug => path.resolve(`videos/output/${slug}/documents`))
  if (!allowed.includes(directory)) throw new Error("Only the dedicated video document folders are allowed")
  const results = []
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".pdf")).sort()) {
    const pdf = path.join(directory, file)
    const { stdout } = await exec("pdfinfo", [pdf])
    const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1])
    if (!pages) throw new Error(`No pages: ${file}`)
    const folder = path.join(directory, "rendered", file.slice(0, -4))
    await mkdir(folder, { recursive: true })
    await exec("pdftoppm", ["-r", "100", "-png", pdf, path.join(folder, "page")], { maxBuffer: 1024 * 1024 })
    const images = (await readdir(folder)).filter(name => /^page-\d+\.png$/.test(name)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    if (images.length !== pages) throw new Error(`Rendered page count differs: ${file}`)
    results.push({ pdf, pages, images: images.map(name => path.join(folder, name)), visualReview: false })
  }
  if (!results.length) throw new Error("No generated PDF to review")
  await writeFile(path.join(directory, "pdf-render-index.json"), JSON.stringify({ renderedAt: new Date().toISOString(), note: "Every page rendered; human/model visual review and pagination checks still required", results }, null, 2))
  console.log(JSON.stringify(results.map(r => ({ pdf: r.pdf, pages: r.pages })), null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
