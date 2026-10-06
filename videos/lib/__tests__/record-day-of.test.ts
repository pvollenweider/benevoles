// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { validateDayOfFixture } from "../record-day-of"
const fixture = { eventId: "video-dayof-event-demo", registrationId: "video-dayof-registration-zoe", volunteerName: "Zoé Exemple", volunteerEmail: "zoe@example.org", phone: "079 000 00 01", runningShiftId: "video-dayof-shift-running", upcomingShiftId: "video-dayof-shift-upcoming", earlierShiftId: "video-dayof-shift-earlier", nightShiftId: "video-dayof-shift-night", roleSearch: "Accueil", accentSearch: "zoe", expectedAccentName: "Zoé Exemple" }
test("Jour J requires dedicated fixture, distinct real temporal cases and fictional contact", () => {
  validateDayOfFixture(fixture)
  for (const change of [{ eventId: "production" }, { registrationId: "real" }, { nightShiftId: fixture.runningShiftId }, { volunteerEmail: "real@gmail.com" }, { phone: "0791234567" }, { accentSearch: "" }]) assert.throws(() => validateDayOfFixture({ ...fixture, ...change }))
})
