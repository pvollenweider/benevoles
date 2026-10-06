// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertHoursCsv, assertHoursScenario, type HoursScenario } from "./record-volunteer-hours"
import type { ProductBuild } from "./product-build"
import { test } from "vitest"

test("record-volunteer-hours guards", async () => {

  const product = { commit: "a".repeat(40), buildId: "test-only", productSourceSha256: "b".repeat(64) } as ProductBuild
  const rows = [
    ["prior", "aline", "may", "2026-05-02", "active", "open", 240, true],
    ["morning", "aline", "september", "2026-09-12", "active", "open", 120, true],
    ["afternoon", "aline", "september", "2026-09-12", "active", "open", 120, false],
    ["benoit", "benoit", "september", "2026-09-12", "active", "open", 120, false],
    ["cancelled-shift", "aline", "september", "2026-09-12", "active", "cancelled", 120, true],
    ["cancelled-registration", "aline", "september", "2026-09-12", "cancelled", "open", 120, false],
    ["waiting", "aline", "september", "2026-09-12", "waiting", "open", 120, false],
    ["future", "aline", "future", "2026-11-28", "active", "open", 240, false],
  ] as const
  const fixture = (): HoursScenario => ({
    organizationId: "video-hours", organizationName: "Formation — heures et attestations", organizationSlug: "formation-heures", product: { ...product },
    members: [["aline", "Aline", 480, 360], ["benoit", "Benoît", 120, 0], ["clara", "Clara", 0, 0]].map(([id, name, planned, attested]) => ({ id: `video-hours-${id}`, firstName: String(name), lastName: "Exemple", email: `video.hours.${id}@example.org`, plannedMinutes: Number(planned), attestedMinutes: Number(attested) })),
    rows: rows.map(([id, member, event, date, status, shiftStatus, minutes, checked]) => ({ id: `video-hours-registration-${id}`, volunteerId: `video-hours-${member}`, eventId: `video-hours-event-${event}`, localDate: date, status, shiftStatus, minutes, checkedInAt: checked ? `${date}T08:00:00Z` : null })),
    confirmedSummary: { distinct: 2, firstTime: 1, returning: 1, confirmed: 3, withPresence: 1, plannedMinutes: 360, attestedMinutes: 120 },
  })
  const now = new Date("2026-10-06T12:00:00Z")
  assertHoursScenario(fixture(), product, now)
  for (const mutate of [
    (s: HoursScenario) => { s.organizationId = "default" },
    (s: HoursScenario) => { s.product.commit = "c".repeat(40) },
    (s: HoursScenario) => { s.members[0].attestedMinutes = 480 },
    (s: HoursScenario) => { s.rows[0].volunteerId = "foreign-member" },
    (s: HoursScenario) => { s.rows[4].shiftStatus = "active" },
    (s: HoursScenario) => { s.rows[7].localDate = "2026-09-12" },
    (s: HoursScenario) => { s.confirmedSummary.distinct = 3 },
  ]) {
    const changed = fixture(); mutate(changed)
    assert.throws(() => assertHoursScenario(changed, product, now))
  }
  assert.throws(() => assertHoursScenario(fixture(), product, new Date("2026-12-01T12:00:00Z")))
  const header = "Prénom;Nom;Événements;Créneaux;Heures planifiées;Heures attestées\r\n"
  const base = "Aline;Exemple;1;2;4;2\r\nBenoît;Exemple;1;1;2;0\r\n"
  const total = "Total;;;3;6;2\r\n"
  assertHoursCsv(`\uFEFF${header}${base}${total}`, false)
  assertHoursCsv(`${header}${base}Clara;Exemple;0;0;0;0\r\n${total}`, true)
  assert.throws(() => assertHoursCsv(`${header}${base}${total}`.replace("4;2", "6;4"), false))
  assert.throws(() => assertHoursCsv(`${header}${base}${total}contact@example.org`, false))
  assert.throws(() => assertHoursCsv(`${header}${base}${total}`, true))
})
