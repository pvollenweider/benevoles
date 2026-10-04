// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Operator tool for #542: after a leak, invalidate every volunteer-facing link of an
 * organization or an event by giving each row a fresh token, optionally resending the new link.
 *
 * Dry run by default — prints what would change, touches nothing:
 *   DATABASE_URL=… npx tsx scripts/regenerate-links.ts --org <slug>
 *   DATABASE_URL=… npx tsx scripts/regenerate-links.ts --event <id>
 *
 * Apply for real, and resend the new links:
 *   DATABASE_URL=… TOKEN_ENCRYPTION_KEY=… npx tsx scripts/regenerate-links.ts --org <slug> --yes --resend
 *
 * See docs/rgpd/procedure-violation.md for when to run this.
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { countLinksInScope, regenerateLinks, type LinkScope } from "../src/lib/link-regeneration"
import { logOrgEvent, SYSTEM_ACTOR } from "../src/lib/org-log"
import { logEvent } from "../src/lib/event-log"

function parseArgs(argv: string[]) {
  const args = { org: undefined as string | undefined, event: undefined as string | undefined, yes: false, resend: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--org") args.org = argv[++i]
    else if (a === "--event") args.event = argv[++i]
    else if (a === "--yes") args.yes = true
    else if (a === "--resend") args.resend = true
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(1)
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.org && !args.event) {
    console.error("Refusing to run without a scope: pass --org <slug> or --event <id>.")
    process.exit(1)
  }
  if (args.org && args.event) {
    console.error("Pass only one of --org or --event, not both.")
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.")
    process.exit(1)
  }
  // Mirrors how the app seals tokens (src/lib/token-vault.ts): without a key, a fresh token is
  // stored in clear (…Legacy) — acceptable in dev, not right after a leak in production.
  if (process.env.NODE_ENV === "production" && !process.env.TOKEN_ENCRYPTION_KEY) {
    console.error("TOKEN_ENCRYPTION_KEY is required in production: without it, new tokens would be stored in clear.")
    process.exit(1)
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

  try {
    let scope: LinkScope
    let logLabel: string
    if (args.org) {
      const org = await prisma.organization.findUnique({ where: { slug: args.org }, select: { id: true, slug: true } })
      if (!org) {
        console.error(`No organization with slug "${args.org}".`)
        process.exit(1)
      }
      scope = { organizationId: org.id }
      logLabel = `organization "${org.slug}"`
    } else {
      const event = await prisma.event.findUnique({ where: { id: args.event }, select: { id: true, title: true } })
      if (!event) {
        console.error(`No event with id "${args.event}".`)
        process.exit(1)
      }
      scope = { eventId: event.id }
      logLabel = `event "${event.title}" (${event.id})`
    }

    if (!args.yes) {
      const counts = await countLinksInScope(prisma, scope)
      console.log(`Dry run for ${logLabel} — nothing was changed.`)
      console.log(`Would regenerate: ${counts.registrations} registration link(s), ${counts.leaders} leader link(s), ${counts.invites} invite link(s).`)
      if (args.resend) console.log("--resend has no effect on a dry run.")
      console.log("Re-run with --yes to apply.")
      return
    }

    const result = await regenerateLinks(prisma, scope, { resend: args.resend })
    console.log(`Regenerated links for ${logLabel}.`)
    console.log(`Registrations: ${result.counts.registrations}, leaders: ${result.counts.leaders}, invites: ${result.counts.invites}.`)
    if (result.resend) {
      console.log(`Resend — registrations: sent ${result.resend.registrations.sent}, failed ${result.resend.registrations.failed}, skipped ${result.resend.registrations.skipped}.`)
      console.log(`Resend — leaders: sent ${result.resend.leaders.sent}, failed ${result.resend.leaders.failed}, skipped ${result.resend.leaders.skipped}.`)
      console.log(`Resend — invites: sent ${result.resend.invites.sent}, failed ${result.resend.invites.failed}, skipped ${result.resend.invites.skipped}.`)
    }

    // Traceable without revealing tokens or addresses: counts only.
    const changes = {
      registrations: { from: null, to: result.counts.registrations },
      leaders: { from: null, to: result.counts.leaders },
      invites: { from: null, to: result.counts.invites },
    }
    if ("organizationId" in scope) {
      await logOrgEvent({
        organizationId: scope.organizationId,
        actor: SYSTEM_ACTOR,
        action: "organization.links_regenerated",
        entityType: "Organization",
        entityId: scope.organizationId,
        changes,
      })
    } else {
      await logEvent({
        eventId: scope.eventId,
        actor: SYSTEM_ACTOR,
        action: "event.links_regenerated",
        entityType: "Event",
        entityId: scope.eventId,
        changes,
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
