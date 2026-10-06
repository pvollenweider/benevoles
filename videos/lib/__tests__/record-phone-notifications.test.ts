// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { validatePhoneEnvironment, validatePhoneNativeEvidence, validatePhoneReceipts, validatePhoneScope, type PhoneNativeEvidence, type PhoneScope, type PhoneDeliveryReceipt } from "../record-phone-notifications"

const scope: PhoneScope = {
  fixtureId: "video-phone-demo", origin: "http://localhost:43108", deviceId: "demo-device", browser: "Brave demo",
  productCommit: "a".repeat(40), buildId: "demo-build", productSourceSha256: "b".repeat(64),
  humanAuthorization: { confirmed: true, fixtureId: "video-phone-demo", deviceId: "demo-device", origin: "http://localhost:43108", evidenceReference: "trusted-user-authorization" },
}
const media = { file: "/tmp/demo-native.mp4", sha256: "c".repeat(64), nativeCapture: true as const, fixtureOnly: true as const }
const evidence: PhoneNativeEvidence = { ...scope, stage: "active", profileId: "demo-profile", capturedAt: "2026-10-06T12:00:00Z", media: [media], observations: { serverSubscriptionAccepted: true, activeStatusVisible: true } }

test("scope excludes production, owner ports and authorization for a different device", () => {
  validatePhoneScope(scope)
  assert.throws(() => validatePhoneScope({ ...scope, origin: "https://benevol.app" }))
  assert.throws(() => validatePhoneScope({ ...scope, origin: "http://localhost:3101" }))
  assert.throws(() => validatePhoneScope({ ...scope, deviceId: "personal-device" }))
})
test("prerequisite check requires a genuine initially ungranted supported page", () => {
  const initial = { secureContext: true, serviceWorker: true, pushManager: true, permission: "default", buttonVisible: true, activeStatusVisible: false }
  validatePhoneEnvironment(initial)
  for (const modification of [{ secureContext: false }, { pushManager: false }, { permission: "granted" }, { buttonVisible: false }, { activeStatusVisible: true }]) assert.throws(() => validatePhoneEnvironment({ ...initial, ...modification }))
})
test("permission is not activation and activation is not receipt", () => {
  validatePhoneNativeEvidence(scope, evidence)
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, observations: { permission: "granted" } }))
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, stage: "reminders" }))
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, observations: { ...evidence.observations, alreadyGrantedOrMocked: true } }))
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, productCommit: "d".repeat(40) }))
})
test("native refusal, revocation and click each require their actual result", () => {
  validatePhoneNativeEvidence(scope, { ...evidence, stage: "blocked", observations: { realPermissionPrompt: true, permission: "denied", registrationsUnchanged: true } })
  validatePhoneNativeEvidence(scope, { ...evidence, stage: "disable", observations: { permissionRevokedInBrowser: true, registrationsUnchanged: true } })
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, stage: "delivery", observations: { actualSystemNotifications: true, notificationClicked: true } }))
  assert.throws(() => validatePhoneNativeEvidence(scope, { ...evidence, stage: "disable", observations: { permissionRevokedInBrowser: true } }))
})
test("receipts require separate real SMTP and native push evidence for all four sends", () => {
  const receipts: PhoneDeliveryReceipt[] = (["j-2", "j-1", "day-of", "urgent"] as const).map(kind => ({
    ...scope, kind, correlationId: `demo-${kind}`, sentAt: "2026-10-06T12:00:00Z", receivedAt: "2026-10-06T12:00:05Z",
    smtp: { source: "mailpit", messageId: `mail-${kind}`, recipient: "video@example.org", savedMessage: media },
    push: { source: "native-system-notification", notificationTitle: "Rappel fictif", media },
    groupedConfirmedShiftCount: 2, noPendingOrWaitlistedReminder: true,
  }))
  validatePhoneReceipts(scope, receipts)
  assert.throws(() => validatePhoneReceipts(scope, []))
  assert.throws(() => validatePhoneReceipts(scope, receipts.slice(1)))
  assert.throws(() => validatePhoneReceipts(scope, receipts.map((receipt, index) => index ? receipt : { ...receipt, groupedConfirmedShiftCount: 1 })))
  assert.throws(() => validatePhoneReceipts(scope, receipts.map((receipt, index) => index ? receipt : { ...receipt, smtp: { ...receipt.smtp, recipient: "real@gmail.com" } })))
})
