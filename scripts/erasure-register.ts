// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Operator tool for the erasure register (#516). Restoring a backup brings back the personal data
 * of every member erased since that backup was taken: export the register BEFORE restoring, then
 * replay it on the restored database. See docs/rgpd/procedure-effacement.md.
 *
 * Export the register (one JSON line per erasure, no personal data) from the live database:
 *   DATABASE_URL=… npx tsx scripts/erasure-register.ts export > register.jsonl
 *
 * Replay it on the restored database, with the app's own AUTH_SECRET (address hashes) and
 * TOKEN_ENCRYPTION_KEY. Dry run by default: prints what it would do, touches nothing. Also accepts
 * raw application logs (lines with "member.erased"), when the live database is lost:
 *   DATABASE_URL=… AUTH_SECRET=… npx tsx scripts/erasure-register.ts replay register.jsonl
 *   DATABASE_URL=… AUTH_SECRET=… TOKEN_ENCRYPTION_KEY=… npx tsx scripts/erasure-register.ts replay register.jsonl --yes
 */

import fs from "node:fs"
import { prisma } from "../src/lib/prisma"
import { parseRegisterLines } from "../src/lib/member-erasure-register"
import { exportErasureRegister, replayErasureRegister } from "../src/lib/member-erasure-replay"

function usage(): never {
  console.error("Usage: erasure-register.ts export | replay <file> [--yes]")
  process.exit(1)
}

async function exportRegister() {
  const lines = await exportErasureRegister(prisma)
  for (const line of lines) console.log(line)
  console.error(`${lines.length} erasure(s) exported.`)
}

async function replay(file: string, apply: boolean) {
  const { lines, rejected } = parseRegisterLines(fs.readFileSync(file, "utf-8"))
  if (rejected > 0) console.error(`${rejected} malformed line(s) ignored.`)
  // Validated at import by src/lib/env.ts (the erasure itself needs it too): it must be the app's
  // own value, or the address hashes won't match.
  const report = await replayErasureRegister(prisma, lines, { apply, secret: process.env.AUTH_SECRET! })
  for (const line of report.log) console.log(line)
  console.log(apply
    ? `Done: ${report.erased} erased, ${report.alreadyErased} already erased, ${report.notFound} not found.`
    : `Dry run, nothing changed: ${report.wouldErase} to erase, ${report.alreadyErased} already erased, ${report.notFound} not found. Re-run with --yes to apply.`)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.")
    process.exit(1)
  }
  const [command, ...rest] = process.argv.slice(2)
  try {
    if (command === "export") await exportRegister()
    else if (command === "replay") {
      const file = rest.find((a) => !a.startsWith("--"))
      if (!file) usage()
      await replay(file, rest.includes("--yes"))
    } else usage()
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
