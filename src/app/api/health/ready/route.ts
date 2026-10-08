// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readiness, readyFilePath } from "@/lib/readiness"

// Kubernetes readiness probe (k8s/deployment.yaml): 503 while the pod warms up, then the same
// database check as /api/health. See src/lib/readiness.ts.
export async function GET() {
  const warmedUp = fs.existsSync(/*turbopackIgnore: true*/ readyFilePath(process.env))
  let databaseOk = false
  if (warmedUp) {
    try {
      await prisma.$queryRaw`SELECT 1`
      databaseOk = true
    } catch {
      databaseOk = false
    }
  }
  const { status, body } = readiness(warmedUp, databaseOk)
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}
