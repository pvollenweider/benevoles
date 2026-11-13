// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env")
    const { assertProductionSecrets } = await import("./lib/production-guards")
    assertProductionSecrets()
    await import("../sentry.server.config")

    // First super admin of a self-hosted instance (#1334), after the guards and Sentry so a
    // failure is reported. Dynamic imports keep Prisma out of the edge and client graphs, and
    // nothing here may keep the server from starting: the module and this catch both log and
    // report instead of throwing. The runner reads process.env, where isHostedDeployment() also
    // reads HOSTED_SERVICE (env.ts does not carry every optional runtime variable).
    try {
      const { bootstrapSuperAdmin } = await import("./lib/admin-bootstrap")
      const { prisma } = await import("./lib/prisma")
      await bootstrapSuperAdmin(process.env, prisma)
    } catch (error) {
      console.error(
        "❌ Bootstrap du super admin impossible au démarrage :",
        error instanceof Error ? error.message : error,
      )
      try {
        const { reportError } = await import("./lib/report-error")
        reportError("admin.bootstrap")(error)
      } catch (reportingError) {
        console.error(
          "❌ Signalement du bootstrap du super admin impossible :",
          reportingError instanceof Error ? reportingError.message : reportingError,
        )
      }
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}

// Captures all unhandled server-side request errors (requires @sentry/nextjs >= 8.28.0)
export const onRequestError = Sentry.captureRequestError
