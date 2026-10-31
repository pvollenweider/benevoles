// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Sets the default time zone of the database in DATABASE_URL, or resets it (#1172). CI runs the
// integration suite with the database set to Europe/Zurich: the app forces UTC on its own sessions
// (src/lib/prisma-adapter.ts), and a raw now() compared with a TIMESTAMP column must keep agreeing
// with what Prisma writes on a server that is not in UTC. Reset before the Playwright specs, whose
// helpers open plain `pg` sessions.
//
//   node scripts/ci-database-timezone.mjs Europe/Zurich
//   node scripts/ci-database-timezone.mjs reset
import pg from "pg"

const zone = process.argv[2]
if (!zone || !/^(reset|[A-Za-z_]+(\/[A-Za-z_+-]+)*)$/.test(zone)) {
  console.error("usage: ci-database-timezone.mjs <IANA zone>|reset")
  process.exit(2)
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  const { rows: [{ name }] } = await db.query("SELECT current_database() AS name")
  const ident = `"${name.replaceAll('"', '""')}"`
  if (zone === "reset") await db.query(`ALTER DATABASE ${ident} RESET timezone`)
  else await db.query(`ALTER DATABASE ${ident} SET timezone TO '${zone}'`)
} finally {
  await db.end()
}

// A new plain session sees the new default: the setting is in force for what follows.
const check = new pg.Client({ connectionString: process.env.DATABASE_URL })
await check.connect()
const { rows: [{ tz }] } = await check.query("SELECT current_setting('TimeZone') AS tz")
await check.end()
if (zone !== "reset" && tz !== zone) {
  console.error(`database time zone is ${tz}, expected ${zone}`)
  process.exit(1)
}
console.log(`database default time zone: ${tz}`)
