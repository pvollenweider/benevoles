// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, rename, stat, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
/** Preserve prior raw evidence even when a rehearsal was started without a manual archive. */
export async function archiveCapture(directory: string): Promise<string | null> {
  try { await stat(path.join(directory, "capture.webm")) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  const destination = path.join(directory, `previous-capture-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`)
  await mkdir(destination)
  const moved: string[] = []
  for (const file of ["capture.webm", "timeline.json"]) {
    try { await rename(path.join(directory, file), path.join(destination, file)); moved.push(file) }
    catch (error) { if (file !== "timeline.json" || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  await writeFile(path.join(destination, "archive-proof.json"), JSON.stringify({ archivedAt: new Date().toISOString(), moved, note: "Prior raw capture and matching timeline moved before recording; audio and fixture preparation left in place." }, null, 2) + "\n")
  return destination
}
