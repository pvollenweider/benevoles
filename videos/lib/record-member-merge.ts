// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "node:crypto"
import type { Locator, Page } from "playwright"
import { verifyProductBuild } from "./product-build"

type Member = {
  id: string; organizationId: string; firstName: string; lastName: string
  email: string | null; phone: string | null; active: boolean
  mergedIntoId: string | null; tags: string[]; notes: string | null
  availabilityNote: string | null; availabilityPeriods: string[]; birthDate: string | null
}
/** Tokens remain in memory. Evidence returned below contains fingerprints only. */
export type MergePersonalLink = { entityId: string; kind: "registration" | "invitation"; apiUrl: string; expectedAfterStatus?: 200 | 404 }
export type MemberMergeBefore = {
  databaseUrl: string; organizationId: "video-member-merge"; sessionRole: "owner"
  keep: Member; absorb: Member; organizationMembers: Member[]
  questionConflictIds: string[]; invitationConflictEventIds: string[]
  movedRegistrationIds: string[]; movedInvitationIds: string[]
  oldMovedLinks: MergePersonalLink[]
}
export type MemberMergeAfter = {
  keep: Member; absorb: Member
  registrationOwners: Array<{ id: string; volunteerId: string }>
  invitationOwners: Array<{ id: string; volunteerId: string }>
  newMovedLinks: MergePersonalLink[]
  cancelledRegistrationIds?: string[]
}
export type MemberMergeRecordingOptions = {
  page: Page; baseUrl: string
  /** Callbacks must read the actual isolated fixture/database, never return canned assertions. */
  readBefore: () => Promise<MemberMergeBefore>
  readAfter: () => Promise<MemberMergeAfter>
  scene: (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
  settle: (page: Page) => Promise<void>
  tap: (page: Page, target: Locator) => Promise<void>
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Member merge recording: ${message}`)
}
const syntheticEmail = (email: string | null) => typeof email === "string" && /^[a-z0-9._+-]+@example\.org$/i.test(email)
const safeId = (id: string) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex")

export function validateMergeLink(link: MergePersonalLink, baseUrl: string): URL {
  const base = new URL(baseUrl)
  const url = new URL(link.apiUrl, base)
  check(url.origin === base.origin && !url.username && !url.password, "personal link must stay on the dedicated local server")
  const prefix = link.kind === "registration" ? "/api/public/registrations/" : "/api/public/member-invite/"
  check(url.pathname.startsWith(prefix) && /^[a-zA-Z0-9_-]{16,}$/.test(url.pathname.slice(prefix.length)), "expected a read-only personal lookup, not a mutation or calendar URL")
  check(!url.search && !url.hash && safeId(link.entityId), "invalid personal lookup identity")
  return url
}

export function validateMemberMergeBefore(before: MemberMergeBefore, baseUrl: string): void {
  const local = new URL(baseUrl)
  check(local.protocol === "http:" && !local.username && !local.password && ["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) && Number(local.port) >= 43100 && Number(local.port) <= 43110, "dedicated local capture server required")
  const database = new URL(before.databaseUrl)
  check(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.port === "45433" && database.pathname === "/benevoles_video", "isolated video database required")
  check(before.organizationId === "video-member-merge" && before.sessionRole === "owner", "exact fictional organization and owner session required")
  check(before.keep.id !== before.absorb.id && [before.keep, before.absorb].every(member => /^video-member-merge-[a-zA-Z0-9_-]+$/.test(member.id)), "two dedicated, distinct merge fixture members required")
  check(before.organizationMembers.length === 2 && before.organizationMembers.every(member => member.organizationId === "video-member-merge" && syntheticEmail(member.email)), "organization contains a non-synthetic member")
  for (const member of [before.keep, before.absorb]) {
    check(member.organizationId === "video-member-merge" && member.active && member.mergedIntoId === null && syntheticEmail(member.email) && member.firstName.trim() && member.lastName.trim(), "merge source is not an active owned synthetic fixture")
    const live = before.organizationMembers.find(candidate => candidate.id === member.id)
    check(live && Object.keys(member).every(key => JSON.stringify(live[key as keyof Member]) === JSON.stringify(member[key as keyof Member])), "merge source is absent or differs from live organization snapshot")
  }
  check(before.keep.email !== before.absorb.email, "fixture needs a real email field difference")
  check(Boolean(before.keep.notes?.trim()) && Boolean(before.absorb.notes?.trim()) && before.keep.notes !== before.absorb.notes, "fixture needs two actual internal notes to concatenate")
  check(before.questionConflictIds.length >= 1 && before.invitationConflictEventIds.length >= 1, "fixture must demonstrate both blocking answer and invitation choices")
  for (const ids of [before.questionConflictIds, before.invitationConflictEventIds, before.movedRegistrationIds, before.movedInvitationIds]) check(ids.every(safeId) && new Set(ids).size === ids.length, "invalid or repeated fixture entity IDs")
  check(before.movedRegistrationIds.length >= 1 && before.movedInvitationIds.length >= 1, "fixture must actually move registrations and invitations")
  const expected = [...before.movedRegistrationIds.map(id => `registration:${id}`), ...before.movedInvitationIds.map(id => `invitation:${id}`)].sort()
  check(JSON.stringify(before.oldMovedLinks.map(link => `${link.kind}:${link.entityId}`).sort()) === JSON.stringify(expected), "all actual moved personal links must be captured before the merge")
  for (const link of before.oldMovedLinks) validateMergeLink(link, baseUrl)
}

export function validateMemberMergeAfter(before: MemberMergeBefore, after: MemberMergeAfter, baseUrl: string) {
  check(after.keep.id === before.keep.id && after.keep.organizationId === "video-member-merge" && after.keep.active && after.keep.email === before.keep.email, "wrong retained profile or email after merge")
  if (before.keep.phone !== before.absorb.phone) check(after.keep.phone === before.absorb.phone, "selected absorbed phone was not retained")
  const absorbed = after.absorb
  check(absorbed.id === before.absorb.id && absorbed.organizationId === "video-member-merge" && !absorbed.active && absorbed.mergedIntoId === before.keep.id, "absorbed profile was not actually deactivated")
  check(absorbed.email === null && absorbed.phone === null && absorbed.notes === null && absorbed.birthDate === null && absorbed.availabilityNote === null && absorbed.tags.length === 0 && absorbed.availabilityPeriods.length === 0, "absorbed personal data was not cleared")
  // The persisted tombstone uses no original name (its exact marker is product-owned).
  check(absorbed.firstName === "" && absorbed.lastName === "", "absorbed name still contains personal identity")
  check(after.keep.notes?.includes(before.keep.notes!) && after.keep.notes.includes(before.absorb.notes!), "both selected internal notes were not retained")
  check([...new Set([...before.keep.tags, ...before.absorb.tags])].every(tag => after.keep.tags.includes(tag)), "merged tags were not reunited")
  check([...new Set([...before.keep.availabilityPeriods, ...before.absorb.availabilityPeriods])].every(period => after.keep.availabilityPeriods.includes(period)), "merged availability periods were not reunited")
  for (const [ids, owners] of [[before.movedRegistrationIds, after.registrationOwners], [before.movedInvitationIds, after.invitationOwners]] as const) {
    for (const id of ids) check(owners.some(owner => owner.id === id && owner.volunteerId === before.keep.id), "moved entity is not owned by retained member")
  }
  check(after.newMovedLinks.length === before.oldMovedLinks.length, "regenerated personal links are missing")
  return before.oldMovedLinks.map(old => {
    const fresh = after.newMovedLinks.find(link => link.kind === old.kind && link.entityId === old.entityId)
    check(fresh && fresh.apiUrl !== old.apiUrl, "personal link was not regenerated")
    validateMergeLink(fresh, baseUrl)
    check((fresh.expectedAfterStatus ?? 200) === (old.expectedAfterStatus ?? 200), "personal link changed its expected post-merge state")
    if (old.expectedAfterStatus === 404) check(old.kind === "registration" && after.cancelledRegistrationIds?.includes(old.entityId), "invalid new link is allowed only for an actual cancelled same-slot registration")
    return { kind: old.kind, entityId: old.entityId, oldLinkSha256: fingerprint(old.apiUrl), newLinkSha256: fingerprint(fresh.apiUrl) }
  })
}

/** Actual product interactions only. No synthetic UI, direct mutations or fixture creation. */
export async function recordMemberMerge(options: MemberMergeRecordingOptions) {
  const { page, baseUrl, scene, settle, tap } = options
  const productBuild = await verifyProductBuild(baseUrl)
  const before = await options.readBefore()
  validateMemberMergeBefore(before, baseUrl)
  // Verify old URLs really work before touching the irreversible confirmation.
  for (const link of before.oldMovedLinks) {
    const response = await page.request.get(validateMergeLink(link, baseUrl).href)
    check(response.status() === 200, "an old personal link was not valid before the demonstration")
    const body = await response.json()
    check((link.kind === "registration" ? body.volunteer?.email : body.member?.email) === before.absorb.email, "old personal link does not belong to the actual absorbed fixture")
    if (link.kind === "registration") check(body.registrations?.some((registration: { id: string; editToken: string }) => registration.id === link.entityId && registration.editToken === validateMergeLink(link, baseUrl).pathname.split("/").at(-1)), "old registration lookup points to a different row")
  }
  const name = `${before.keep.firstName} ${before.keep.lastName}`
  const absorbedName = `${before.absorb.firstName} ${before.absorb.lastName}`
  await scene("duplicates", async at => {
    await page.goto(`${baseUrl}/admin/members`); await settle(page)
    const duplicates = page.getByRole("link", { name: /^Doublons possibles \(/ })
    await duplicates.waitFor()
    await at(0.20); await tap(page, duplicates)
    await page.getByRole("heading", { name: "Doublons possibles", exact: true }).waitFor()
    const pair = page.locator("li").filter({ has: page.locator(`a[href="/admin/members/${before.keep.id}/merge?with=${before.absorb.id}"]`) }).filter({ hasText: `${name} et ${absorbedName}` })
    // Only the outer pair list item has this link. Do not take an unrelated namesake.
    check(await pair.count() === 1, "expected pair absent or reversed; retained member must match the actual Compare link")
    await pair.scrollIntoViewIfNeeded()
    await at(0.43); await tap(page, pair.getByRole("link", { name: /^Comparer et fusionner/ }))
    await page.getByRole("heading", { name: `Aperçu de la fusion avec ${absorbedName}`, exact: true }).waitFor()
    await at(0.60); await page.goBack(); await settle(page)
    await page.getByRole("heading", { name: "Doublons possibles", exact: true }).waitFor()
    await at(0.72); await tap(page, pair.getByRole("button", { name: /^Ignorer la paire/ }))
    await page.getByText("Aucune paire possible en double pour l'instant.", { exact: true }).waitFor()
    // Dismissing a suggestion is not a merge: read the actual fixture again to prove both
    // records and their personal links still exist unchanged before the next entry point.
    const untouched = await options.readBefore()
    validateMemberMergeBefore(untouched, baseUrl)
    check(untouched.keep.email === before.keep.email && untouched.absorb.email === before.absorb.email, "ignoring the pair unexpectedly changed member profiles")
  })
  await scene("compare", async at => {
    await page.goto(`${baseUrl}/admin/members/${before.keep.id}`); await settle(page)
    await page.getByRole("heading", { name: `Activité de ${name}`, exact: true }).waitFor()
    // The accessible name includes the real sr-only suffix “(doublon confirmé)”.
    // Bind the action to this precise retained member, not another namesake link.
    const manualMerge = page.getByRole("link", { name: "Fusionner avec un autre membre (doublon confirmé)", exact: true })
    check(await manualMerge.getAttribute("href") === `/admin/members/${before.keep.id}/merge`, "manual merge entry must retain the expected member")
    await at(0.34); await tap(page, manualMerge)
    await page.getByRole("heading", { name: `Fusionner ${name}`, exact: true }).waitFor()
    const search = page.getByLabel("Rechercher un membre par nom ou email", { exact: true })
    await at(0.46); await tap(page, search)
    await search.pressSequentially(before.absorb.email!, { delay: 95 })
    await at(0.60); await tap(page, page.getByRole("button", { name: "Chercher", exact: true }))
    const result = page.locator("#member-merge-panel li").filter({ hasText: before.absorb.email! })
    await result.waitFor()
    check(await result.count() === 1, "search must identify the precise absorbed synthetic email")
    await at(0.67); await tap(page, result.getByRole("button", { name: /^Fusionner avec cette fiche/ }))
    await page.getByRole("heading", { name: `Aperçu de la fusion avec ${absorbedName}`, exact: true }).waitFor()
    await at(0.83); await page.getByRole("group", { name: "Champs du profil à conserver", exact: true }).scrollIntoViewIfNeeded()
    const email = page.getByRole("group", { name: "Email", exact: true })
    await email.getByRole("radio", { name: `Garder « ${before.keep.email} » (${name})`, exact: true }).waitFor()
  })
  const waitPreview = async () => {
    // The status region repeats this message; target only the visible loading paragraph.
    await page.locator("#member-merge-panel p").filter({ hasText: /^Mise à jour de l'aperçu…$/ }).waitFor({ state: "hidden" })
    await page.getByRole("button", { name: "Fusionner les deux fiches", exact: true }).waitFor()
  }
  await scene("fields", async at => {
    const email = page.getByRole("group", { name: "Email", exact: true })
    await at(0.12); await tap(page, email.getByRole("radio", { name: `Garder « ${before.keep.email} » (${name})`, exact: true }))
    await waitPreview()
    if (before.keep.phone !== before.absorb.phone) {
      await at(0.28)
      await tap(page, page.getByRole("group", { name: "Téléphone", exact: true }).getByRole("radio", { name: `Prendre « ${before.absorb.phone ?? "(vide)"} » (${absorbedName})`, exact: true }))
      await waitPreview()
    }
    await at(0.47); await tap(page, page.getByRole("radio", { name: "Mettre les deux notes à la suite", exact: true }))
    await waitPreview()
    await at(0.72); await page.getByRole("table", { name: "Nombre de lignes concernées par la fusion, par type", exact: true }).scrollIntoViewIfNeeded()
  })
  await scene("conflicts", async at => {
    await page.getByRole("heading", { name: "Points à vérifier", exact: true }).scrollIntoViewIfNeeded()
    const merge = page.getByRole("button", { name: "Fusionner les deux fiches", exact: true })
    check(await merge.getAttribute("aria-disabled") === "true", "fixture did not produce actual blocking choices")
    await at(0.68)
    for (const id of before.questionConflictIds) {
      const radio = page.locator(`input[type="radio"][name="answer-${id}"]`).locator("..").filter({ hasText: "Prendre la réponse de la fiche absorbée" }).getByRole("radio")
      await tap(page, radio)
      check(await radio.isChecked(), "answer choice was not actually selected")
      await waitPreview()
    }
    await at(0.80)
    for (const id of before.invitationConflictEventIds) {
      const radio = page.locator(`input[type="radio"][name="invite-${id}"]`).locator("..").filter({ hasText: "Prendre l'invitation de la fiche absorbée" }).getByRole("radio")
      await tap(page, radio)
      check(await radio.isChecked(), "invitation choice was not actually selected")
      await waitPreview()
    }
    check(await merge.getAttribute("aria-disabled") !== "true", "blocking conflicts remain after explicit choices")
  })
  await scene("confirm", async at => {
    const sendLinks = page.getByRole("checkbox", { name: "Envoyer les nouveaux liens personnels à l'adresse conservée", exact: true })
    await sendLinks.scrollIntoViewIfNeeded()
    // Show the real option without claiming an email was sent; this demonstration sends none.
    await at(0.08); await tap(page, sendLinks)
    check(await sendLinks.isChecked(), "new-link email option did not turn on")
    await waitPreview()
    await at(0.23); await tap(page, sendLinks)
    check(!(await sendLinks.isChecked()), "demonstration must not send email unexpectedly")
    await waitPreview()
    await at(0.42); await page.getByRole("heading", { name: "Résumé avant confirmation", exact: true }).scrollIntoViewIfNeeded()
    await at(0.74); await tap(page, page.getByRole("button", { name: "Fusionner les deux fiches", exact: true }))
    const confirmation = page.getByRole("alertdialog", { name: "Confirmer la fusion", exact: true })
    await confirmation.waitFor()
    await at(0.90); await tap(page, confirmation.getByRole("button", { name: "Confirmer la fusion", exact: true }))
    await page.getByRole("heading", { name: "Fusion effectuée", exact: true }).waitFor()
  })
  const after = await options.readAfter()
  const links = validateMemberMergeAfter(before, after, baseUrl)
  await scene("result", async at => {
    await page.getByRole("heading", { name: "Fusion effectuée", exact: true }).scrollIntoViewIfNeeded()
    await at(0.27); await tap(page, page.getByRole("link", { name: `Retour à la fiche de ${name}`, exact: true }))
    await settle(page)
    await at(0.37); await page.goto(`${baseUrl}/admin/members?q=${encodeURIComponent(before.keep.email!)}`); await settle(page)
    check(await page.locator("tbody tr").filter({ hasText: before.keep.email! }).count() === 1, "retained member not unique in the real members list")
    await at(0.58); await page.goto(`${baseUrl}/admin/members/${before.keep.id}`); await settle(page)
    await page.getByRole("heading", { name: `Activité de ${name}`, exact: true }).waitFor()
  })
  const linkChecks: Array<{ kind: string; entityId: string; oldStatus: number; newStatus: number }> = []
  await scene("links", async at => {
    // Real lookups prove invalidation. No raw personal token is returned in recording evidence.
    for (const old of before.oldMovedLinks) {
      const fresh = after.newMovedLinks.find(link => link.kind === old.kind && link.entityId === old.entityId)!
      const oldResponse = await page.request.get(validateMergeLink(old, baseUrl).href)
      const newResponse = await page.request.get(validateMergeLink(fresh, baseUrl).href)
      check([404, 410].includes(oldResponse.status()) && newResponse.status() === (fresh.expectedAfterStatus ?? 200), "old/new personal lookup statuses do not prove regeneration")
      if ((fresh.expectedAfterStatus ?? 200) === 200) {
        const body = await newResponse.json()
        check((fresh.kind === "registration" ? body.volunteer?.email : body.member?.email) === before.keep.email, "regenerated link does not belong to the retained member")
        if (fresh.kind === "registration") check(body.registrations?.some((registration: { id: string; editToken: string }) => registration.id === fresh.entityId && registration.editToken === validateMergeLink(fresh, baseUrl).pathname.split("/").at(-1)), "regenerated registration link points to a different row")
      }
      linkChecks.push({ kind: old.kind, entityId: old.entityId, oldStatus: oldResponse.status(), newStatus: newResponse.status() })
    }
    const oldRegistration = before.oldMovedLinks.find(link => link.kind === "registration" && (link.expectedAfterStatus ?? 200) === 200)!
    const token = validateMergeLink(oldRegistration, baseUrl).pathname.split("/").at(-1)!
    await at(0.12); await page.goto(`${baseUrl}/my/${token}`); await settle(page)
    await page.getByRole("heading", { name: "Ce lien ne fonctionne pas", exact: true }).waitFor()
    const newRegistration = after.newMovedLinks.find(link => link.entityId === oldRegistration.entityId && link.kind === "registration")!
    const newToken = validateMergeLink(newRegistration, baseUrl).pathname.split("/").at(-1)!
    await at(0.33); await page.goto(`${baseUrl}/my/${newToken}`); await settle(page)
    await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).waitFor()
    await page.getByRole("region", { name: "Tous mes créneaux", exact: true }).waitFor()
  })
  return { productBuild, keepId: before.keep.id, absorbId: before.absorb.id, linkFingerprints: links, linkChecks, emailsSent: false }
}
