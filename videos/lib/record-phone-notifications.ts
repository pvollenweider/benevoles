// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Native push demonstration contract: no seeding, permissions override, fake notification or send. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import type { Page } from "playwright"

const sha = /^[a-f0-9]{64}$/
export const phoneNativeStages = ["permission", "active", "reminders", "delivery", "blocked", "disable"] as const
export type PhoneNativeStage = typeof phoneNativeStages[number]
export type PhoneScope = {
  fixtureId: string
  origin: string
  deviceId: string
  browser: string
  productCommit: string
  buildId: string
  productSourceSha256: string
  /** Trusted human authorization, not a model's permission decision. */
  humanAuthorization: { confirmed: true; fixtureId: string; deviceId: string; origin: string; evidenceReference: string }
}
export type PhoneEnvironment = {
  secureContext: boolean; serviceWorker: boolean; pushManager: boolean
  permission: string; buttonVisible: boolean; activeStatusVisible: boolean
}
export type PhoneArtifact = { file: string; sha256: string; fixtureOnly: true }
export type PhoneMedia = PhoneArtifact & { nativeCapture: true }
export type PhoneNativeEvidence = {
  stage: PhoneNativeStage; fixtureId: string; deviceId: string; origin: string
  productCommit: string; buildId: string; productSourceSha256: string
  profileId: string; capturedAt: string; media: PhoneMedia[]
  /** Set by observation callbacks only; checked against real media separately by review. */
  observations: {
    realPermissionPrompt?: boolean; permission?: "granted" | "denied"
    serverSubscriptionAccepted?: boolean; activeStatusVisible?: boolean
    actualSystemNotifications?: boolean; notificationClicked?: boolean; correctPersonalPageOpened?: boolean
    permissionRevokedInBrowser?: boolean; registrationsUnchanged?: boolean
    alreadyGrantedOrMocked?: boolean
  }
}
export type PhoneDeliveryReceipt = {
  kind: "j-2" | "j-1" | "day-of" | "urgent"
  fixtureId: string; deviceId: string; origin: string
  correlationId: string; sentAt: string; receivedAt: string
  smtp: { source: "mailpit"; messageId: string; recipient: string; savedMessage: PhoneArtifact }
  push: { source: "native-system-notification"; notificationTitle: string; media: PhoneMedia }
  /** Only J-2/J-1/day-of aggregate the two confirmed same-day registrations. */
  groupedConfirmedShiftCount?: number
  noPendingOrWaitlistedReminder?: boolean
}
export type PhonePreparation = {
  module: "VOLUNTEER_PHONE_NOTIFICATIONS"; captureReady: false
  nativeStages: readonly PhoneNativeStage[]; environment: PhoneEnvironment
  requirements: readonly string[]
}

export function validatePhoneScope(scope: PhoneScope) {
  assert(/^video-phone-[a-z0-9-]+$/.test(scope.fixtureId), "Dedicated fictional phone fixture required")
  const origin = new URL(scope.origin)
  assert.equal(origin.origin, scope.origin, "Origin only, no token/path/query")
  assert(origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || (origin.protocol === "https:" && origin.hostname.endsWith(".test")), "Only isolated local or HTTPS .test demonstration origins")
  assert(!["3100", "3101"].includes(origin.port), "User development ports excluded")
  assert(/^[a-f0-9]{40}$/.test(scope.productCommit) && sha.test(scope.productSourceSha256) && scope.buildId.length > 0, "Current product provenance required")
  assert(scope.deviceId.length > 0 && scope.browser.length > 0)
  const authorization = scope.humanAuthorization
  assert(authorization?.confirmed === true && authorization.fixtureId === scope.fixtureId && authorization.deviceId === scope.deviceId && authorization.origin === scope.origin && authorization.evidenceReference.length > 0, "Human authorization must explicitly cover the real demonstration device, origin and fixture")
}

export function validatePhoneEnvironment(environment: PhoneEnvironment) {
  assert(environment.secureContext && environment.serviceWorker && environment.pushManager, "Actual secure browser with service worker and Push API required")
  assert.equal(environment.permission, "default", "Initial native permission demo requires a fresh ungranted profile")
  assert(environment.buttonVisible && !environment.activeStatusVisible, "Real initial push button required; an active label is not a permission demo")
}

function scoped(scope: PhoneScope, value: { fixtureId: string; deviceId: string; origin: string }) {
  assert(value.fixtureId === scope.fixtureId && value.deviceId === scope.deviceId && value.origin === scope.origin, "Evidence belongs to another fixture, device or origin")
}
function artifactShape(media: PhoneArtifact) {
  assert(media.file.startsWith("/") && sha.test(media.sha256) && media.fixtureOnly === true, "Actual scoped artifact and SHA256 required")
}
function mediaShape(media: PhoneMedia) {
  artifactShape(media)
  assert(media.nativeCapture === true, "Actual native media required")
}
export function validatePhoneNativeEvidence(scope: PhoneScope, evidence: PhoneNativeEvidence) {
  scoped(scope, evidence)
  assert(evidence.productCommit === scope.productCommit && evidence.buildId === scope.buildId && evidence.productSourceSha256 === scope.productSourceSha256, "Native media provenance differs from current product")
  assert(phoneNativeStages.includes(evidence.stage) && evidence.profileId && Number.isFinite(Date.parse(evidence.capturedAt)))
  assert(evidence.media.length > 0, "Native media missing")
  evidence.media.forEach(mediaShape)
  assert(evidence.observations.alreadyGrantedOrMocked !== true, "Pregranted or mocked permission is not a real demonstration")
  const o = evidence.observations
  switch (evidence.stage) {
    case "permission": assert(o.realPermissionPrompt && o.permission === "granted", "Real permission dialog acceptance missing"); break
    case "active": assert(o.serverSubscriptionAccepted && o.activeStatusVisible, "Permission alone is not an accepted server subscription"); break
    case "reminders": assert(o.actualSystemNotifications, "Server success is not native receipt"); break
    case "delivery": assert(o.actualSystemNotifications && o.notificationClicked && o.correctPersonalPageOpened, "Actual receipt and correct notification click destination required"); break
    case "blocked": assert(o.realPermissionPrompt && o.permission === "denied" && o.registrationsUnchanged, "Actual refusal with unchanged registrations required"); break
    case "disable": assert(o.permissionRevokedInBrowser && o.registrationsUnchanged, "Real browser revocation must not cancel registration"); break
  }
}

export function validatePhoneReceipts(scope: PhoneScope, receipts: PhoneDeliveryReceipt[]) {
  assert.equal(receipts.length, 4, "Real SMTP and push evidence required for three reminders and one urgent message")
  assert.equal(new Set(receipts.map(receipt => receipt.kind)).size, 4, "All four delivery kinds required")
  for (const receipt of receipts) {
    scoped(scope, receipt)
    assert(["j-2", "j-1", "day-of", "urgent"].includes(receipt.kind))
    assert(receipt.correlationId && Number.isFinite(Date.parse(receipt.sentAt)) && Date.parse(receipt.receivedAt) >= Date.parse(receipt.sentAt), "Correlated sending and receipt timestamps required")
    assert(receipt.smtp.source === "mailpit" && receipt.smtp.messageId && /^[^@\s]+@example\.org$/.test(receipt.smtp.recipient), "Real Mailpit message for a fictional recipient required")
    assert(receipt.push.source === "native-system-notification" && receipt.push.notificationTitle, "A push provider acknowledgement cannot prove screen receipt")
    artifactShape(receipt.smtp.savedMessage); mediaShape(receipt.push.media)
    if (receipt.kind !== "urgent") assert(receipt.groupedConfirmedShiftCount === 2 && receipt.noPendingOrWaitlistedReminder === true, "Grouped confirmed shifts and exclusion of pending/waitlisted registrations required")
  }
  assert.equal(new Set(receipts.map(receipt => receipt.correlationId)).size, 4, "Separate actual sends required")
}

async function verifyMedia(media: PhoneArtifact) {
  artifactShape(media)
  const bytes = await readFile(media.file)
  assert(bytes.length > 0 && createHash("sha256").update(bytes).digest("hex") === media.sha256, "Evidence artifact missing, empty or replaced")
}

/** Observe an already-open real page; no navigation, subscription, permission or database mutation. */
export async function preparePhoneNotifications(page: Page, scope: PhoneScope): Promise<PhonePreparation> {
  validatePhoneScope(scope)
  const current = new URL(page.url())
  assert(current.origin === scope.origin && /^\/my\/[^/]+$/.test(current.pathname), "A genuine dedicated personal page must already be open")
  const environment = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  }))
  const observed: PhoneEnvironment = {
    ...environment,
    buttonVisible: await page.getByRole("button", { name: "Recevoir des rappels push", exact: true }).isVisible(),
    activeStatusVisible: await page.getByText("Rappels push activés", { exact: true }).isVisible(),
  }
  validatePhoneEnvironment(observed)
  return { module: "VOLUNTEER_PHONE_NOTIFICATIONS", captureReady: false, nativeStages: phoneNativeStages, environment: observed, requirements: [
    "Real CUA native permission acceptance and separate refusal profile; never grantPermissions or API substitution",
    "Accepted fixture subscription, actual J-2/J-1/day-of and urgent notification receipts, separately correlated Mailpit emails",
    "Native notification click opens correct personal page; browser permission revocation leaves registrations intact",
    "Current clean product build proof and final media review; this preparatory module cannot certify delivery",
  ] }
}

/** Native callbacks must use sanctioned CUA controls on the authorized demo device, not browser mocks. */
export async function performPhoneNativeStages(scope: PhoneScope, callbacks: {
  performNative: (stage: PhoneNativeStage, scope: Readonly<PhoneScope>) => Promise<PhoneNativeEvidence>
  collectActualReceipts: () => Promise<PhoneDeliveryReceipt[]>
}) {
  validatePhoneScope(scope)
  const evidence: PhoneNativeEvidence[] = []
  for (const stage of phoneNativeStages) {
    const result = await callbacks.performNative(stage, scope)
    assert.equal(result.stage, stage)
    validatePhoneNativeEvidence(scope, result)
    for (const media of result.media) await verifyMedia(media)
    evidence.push(result)
  }
  assert.notEqual(evidence.find(item => item.stage === "permission")!.profileId, evidence.find(item => item.stage === "blocked")!.profileId, "Refusal requires a separate initially ungranted profile")
  const receipts = await callbacks.collectActualReceipts()
  validatePhoneReceipts(scope, receipts)
  for (const receipt of receipts) { await verifyMedia(receipt.smtp.savedMessage); await verifyMedia(receipt.push.media) }
  return { module: "VOLUNTEER_PHONE_NOTIFICATIONS" as const, status: "native-evidence-collected-review-required" as const, captureReady: false as const, finalDeliveryValidated: false as const, evidence, receipts }
}
