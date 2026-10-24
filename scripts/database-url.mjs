#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Builds the PostgreSQL URL from the same variables the postgres container reads (POSTGRES_USER,
// POSTGRES_PASSWORD, POSTGRES_DB) plus POSTGRES_HOST and POSTGRES_PORT, each part percent-encoded:
// a password with @ : / ? # % or spaces gives the same credentials to the database and to the app.
// Used by docker-entrypoint.sh when DATABASE_URL is not set (docker-compose.yml); an explicit
// DATABASE_URL (Kubernetes) is never touched. Prints the URL on stdout, never anything else.
// Plain Node, no dependency: the production image has no tsx and no dev dependencies.
import { pathToFileURL } from "node:url"

export function databaseUrlFromParts(env) {
  const password = env.POSTGRES_PASSWORD ?? ""
  if (password === "") throw new Error("POSTGRES_PASSWORD is empty")
  const user = env.POSTGRES_USER || "benevoles"
  const host = env.POSTGRES_HOST || "postgres"
  const port = env.POSTGRES_PORT || "5432"
  const database = env.POSTGRES_DB || "benevoles"
  if (!/^\d+$/.test(port)) throw new Error("POSTGRES_PORT is not a number")
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error("POSTGRES_HOST is not a host name")
  const enc = encodeURIComponent
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}?schema=public`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.stdout.write(databaseUrlFromParts(process.env))
  } catch (e) {
    // The message names the variable, never its value.
    console.error(`database-url: ${e instanceof Error ? e.message : "invalid configuration"}`)
    process.exit(1)
  }
}
