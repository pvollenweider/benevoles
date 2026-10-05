import { describe, it, expect, beforeAll, afterAll } from "vitest"

/**
 * CharterVersion (#569) resolves a Registration's charterAcceptedHash back to the text it was
 * computed from: one row per distinct text an organization has shown, upserted (never
 * overwritten) the first time it's seen. Against a real Postgres: the upsert's "update: {}" must
 * not throw on a race between two concurrent sign-ups hashing the same text, and the
 * (organizationId, hash) unique constraint must not block two different organizations that
 * happen to show the exact same text (e.g. two orgs that both kept the default wording).
 */

import { prisma } from "@/lib/prisma"
import { hashCharterText } from "@/lib/charter-hash"
import { DEFAULT_VOLUNTEER_CHARTER } from "@/lib/volunteer-charter"

const url = process.env.DATABASE_URL
const tag = `int-charterv-${Date.now()}`

describe.skipIf(!url)("CharterVersion upsert (#569)", () => {
  let orgA = ""
  let orgB = ""

  beforeAll(async () => {
    const a = await prisma.organization.create({ data: { name: "Org A", slug: `${tag}-a` } })
    const b = await prisma.organization.create({ data: { name: "Org B", slug: `${tag}-b` } })
    orgA = a.id
    orgB = b.id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("upserts once per distinct text, keeping the first text seen", async () => {
    const hash = hashCharterText(DEFAULT_VOLUNTEER_CHARTER)
    const upsert = () => prisma.charterVersion.upsert({
      where: { organizationId_hash: { organizationId: orgA, hash } },
      create: { organizationId: orgA, hash, text: DEFAULT_VOLUNTEER_CHARTER },
      update: {},
    })

    const first = await upsert()
    const second = await upsert() // simulates a second sign-up racing to the same text
    expect(second.id).toBe(first.id)
    expect(second.firstSeenAt).toEqual(first.firstSeenAt)

    expect(await prisma.charterVersion.count({ where: { organizationId: orgA, hash } })).toBe(1)
  })

  it("two organizations showing the exact same text each get their own row", async () => {
    const text = "Un texte identique, montré par deux organisations différentes."
    const hash = hashCharterText(text)

    await prisma.charterVersion.upsert({
      where: { organizationId_hash: { organizationId: orgA, hash } },
      create: { organizationId: orgA, hash, text },
      update: {},
    })
    await prisma.charterVersion.upsert({
      where: { organizationId_hash: { organizationId: orgB, hash } },
      create: { organizationId: orgB, hash, text },
      update: {},
    })

    const rows = await prisma.charterVersion.findMany({ where: { hash, organizationId: { in: [orgA, orgB] } } })
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.organizationId))).toEqual(new Set([orgA, orgB]))
  })

  it("is deleted when its organization is (cascade, no retention of its own)", async () => {
    const text = "Texte éphémère pour vérifier la suppression en cascade."
    const hash = hashCharterText(text)
    await prisma.charterVersion.create({ data: { organizationId: orgB, hash, text } })

    await prisma.organization.delete({ where: { id: orgB } })
    expect(await prisma.charterVersion.count({ where: { hash } })).toBe(0)

    // orgB no longer exists for the remaining assertions in this file.
    orgB = (await prisma.organization.create({ data: { name: "Org B 2", slug: `${tag}-b2` } })).id
  })
})
