// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import type { Locator, Page } from "playwright"

type QuestionKind = "text" | "yesno" | "single" | "multiple"
export const trainingQuestions: { label: string; type: QuestionKind; required: boolean; options: string[] }[] = [
  { label: "Taille de t-shirt", type: "single", required: true, options: ["S", "M", "L", "XL"] },
  { label: "Permis de conduire", type: "yesno", required: true, options: [] },
  { label: "Matériel de transport", type: "multiple", required: false, options: ["Vélo", "Remorque", "Voiture"] },
  { label: "Point de rendez-vous préféré", type: "text", required: false, options: [] },
]
export type QuestionSnapshot = {
  organizationId: string; eventId: string; volunteerEmail: string
  /** Include archived questions; order active ones by actual position. Adapter
   * maps active = archivedAt === null, not a fictional database boolean. */
  questions: { id: string; label: string; type: string; required: boolean; options: string[]; active: boolean }[]
  /** Adapter maps actual EventQuestionAnswer.values to scalar for text/single/
   * yesno and array for multiple; never infer answers from screenshots. */
  answers: { questionId: string; value: string | string[] }[]
  confirmedRegistrationCount: number
}
export function assertQuestionFixture(snapshot: QuestionSnapshot, eventId: string, email: string) {
  assert.equal(snapshot.organizationId, "video-questions")
  assert.equal(snapshot.eventId, eventId)
  assert.equal(snapshot.volunteerEmail, email)
  assert(email.startsWith("video.questions.") && email.endsWith("@example.org"))
  assert(eventId.startsWith("video-questions-"))
}
export function assertAnswer(snapshot: QuestionSnapshot, label: string, expected: string | string[] | undefined) {
  const question = snapshot.questions.find(item => item.label === label)
  assert(question, `Actual stored question ${label} required`)
  const answer = snapshot.answers.find(item => item.questionId === question.id)
  assert.deepEqual(answer?.value, expected, `Stored response differs for ${label}`)
}
export function assertQuestionConfiguration(snapshot: QuestionSnapshot, expectedCount: number) {
  assert.equal(snapshot.questions.filter(q => q.active).length, expectedCount)
  for (const definition of trainingQuestions.slice(0, expectedCount)) {
    const actual = snapshot.questions.find(q => q.label === definition.label && q.active)
    assert(actual, `Missing active question ${definition.label}`)
    assert.equal(actual.type, definition.type); assert.equal(actual.required, definition.required)
    assert.deepEqual(actual.options, definition.options)
  }
}
type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
export type QuestionRecordingOptions = {
  page: Page; base: string; eventId: string; email: string; publicSlug: string
  /** A real seeded invitation for precisely this fixture member, never an invented token. */
  invitationUrl: string
  scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void>
  /** Caller uses loadCurrentVideoPrisma, implements strictly read-only queries
   * scoped to video-questions/eventId/email, including archived questions. */
  readSnapshot: () => Promise<QuestionSnapshot>
  /** Complete real contact/consent UI using the synthetic fixture; does not submit. */
  completeVolunteerForm: (page: Page) => Promise<void>
  evidence: (chapter: string, observed: Record<string, unknown>) => Promise<void>
  /** Show actual isolated Mailpit message for this recipient; verify its real
   * personal link. Must never send externally or substitute an invented email. */
  showConfirmationEmail: (page: Page, recipient: string) => Promise<{ recipient: string; actualPersonalLink: string }>
}

/** Fixture: dedicated published event, zero questions, invited synthetic member,
 * four free non-overlapping shifts (last one previews the retired question). */
export async function recordEventQuestions(options: QuestionRecordingOptions) {
  const { page, base, eventId, email, publicSlug, scene, tap, settle, readSnapshot, completeVolunteerForm, evidence } = options
  assert.equal(base, "http://localhost:43112")
  assert.equal(publicSlug, "atelier-questions")
  const invitation = new URL(options.invitationUrl)
  assert.equal(invitation.origin, base); assert.equal(invitation.pathname, `/${publicSlug}`)
  assert.equal(invitation.searchParams.get("org"), "formation-questions")
  assert(invitation.searchParams.get("token"))
  const read = async () => { const snapshot = await readSnapshot(); assertQuestionFixture(snapshot, eventId, email); return snapshot }
  const initial = await read()
  assert.equal(initial.questions.length, 0, "Prepare owned empty event before capture; never remove unknown questions")
  assert.equal(initial.answers.length, 0)
  assert.equal(initial.confirmedRegistrationCount, 0, "Reset the owned scenario after any rehearsal or partial take")
  const admin = `${base}/admin/events/${eventId}`
  const publicUrl = `${base}/${publicSlug}?org=formation-questions`
  const go = async (url: string) => { await page.goto(url); await settle(page) }
  const write = async (field: Locator, text: string) => { await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(text, { delay: 95 }) }
  const questionForm = () => page.getByRole("form", { name: /^(Nouvelle question|Modifier la question)$/ })
  const mutate = async (method: string, path: string, action: () => Promise<void>, expectedStatus?: number) => {
    const waiting = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === path)
    await action(); const response = await waiting
    if (expectedStatus) assert.equal(response.status(), expectedStatus)
    else assert(response.ok(), `Question operation failed (${response.status()})`)
    return response
  }
  await go(admin)
  await scene("welcome", async at => {
    await at(0.20)
    await tap(page, page.getByRole("link", { name: "Questions", exact: true }))
    await page.getByRole("heading", { name: "Questions aux bénévoles", exact: true }).waitFor()
    await page.getByText(/Ne demandez que ce qui est nécessaire/).scrollIntoViewIfNeeded()
    await evidence("welcome", { ownedEmptyEvent: true, noSensitiveExample: true })
  })
  for (const [index, question] of trainingQuestions.entries()) {
    await scene(`create-${question.type}`, async at => {
      // Anchors checked against the current continuous Kore recording. Keep
      // the form opening, required toggle and save separate: one generic
      // fraction made several actions precede their spoken instruction.
      const timing = { single: { open: 0.05, required: 0.70, save: 0.79 }, yesno: { open: 0.105, required: 0.55, save: 0.62 }, multiple: { open: 0.065, required: 0.55, save: 0.735 }, text: { open: 0.10, required: 0.45, save: 0.72 } }[question.type]
      await at(timing.open)
      await tap(page, page.getByRole("button", { name: "Ajouter une question", exact: true }))
      const form = questionForm(); await form.waitFor()
      await write(form.getByLabel("Question posée aux bénévoles *", { exact: true }), question.label)
      await at(0.24); await tap(page, form.getByLabel("Type de réponse", { exact: true }))
      await form.getByLabel("Type de réponse", { exact: true }).selectOption(question.type)
      if (question.options.length) await write(form.getByLabel("Choix proposés *", { exact: true }), question.options.join("\n"))
      await at(timing.required)
      const required = form.getByLabel("Réponse obligatoire", { exact: true })
      assert.equal(await required.isChecked(), false)
      if (question.required) await tap(page, required)
      await at(timing.save)
      await mutate("POST", `/api/admin/events/${eventId}/questions`, () => tap(page, form.getByRole("button", { name: "Enregistrer", exact: true })), 201)
      await form.waitFor({ state: "hidden" })
      const snapshot = await read(); const saved = snapshot.questions.find(item => item.label === question.label)
      assert(saved?.active && saved.type === question.type && saved.required === question.required)
      assert.deepEqual(saved.options, question.options)
      assertQuestionConfiguration(snapshot, index + 1)
      await evidence(`create-${question.type}`, { savedType: question.type, required: question.required, optionsCount: question.options.length })
    })
  }
  await scene("order", async at => {
    await at(0.2)
    await mutate("POST", `/api/admin/events/${eventId}/questions/reorder`, () => tap(page, page.getByRole("button", { name: "Monter « Permis de conduire »", exact: true })))
    await at(0.62)
    await page.reload(); await settle(page)
    assert.equal((await read()).questions.filter(item => item.active)[0]?.label, "Permis de conduire")
    await page.getByRole("button", { name: "Modifier la question « Permis de conduire »", exact: true }).scrollIntoViewIfNeeded()
    const firstEdit = page.getByRole("button", { name: /^Modifier la question «/ }).first()
    const permitEdit = await page.getByRole("button", { name: "Modifier la question « Permis de conduire »", exact: true }).elementHandle()
    assert(permitEdit && await firstEdit.evaluate((element, expected) => element === expected, permitEdit), "Persisted first question must remain visibly first after reload")
    await page.evaluate(() => {
      const caption = document.createElement("div")
      caption.id = "video-questions-reload-note"
      caption.textContent = "Démonstration : après rechargement de la page, l'ordre est conservé."
      caption.style.cssText = "position:fixed;bottom:18px;left:10%;width:80%;padding:14px 20px;box-sizing:border-box;background:#172033;color:white;border-radius:10px;text-align:center;font:18px/1.4 Arial,sans-serif;z-index:2147483647;pointer-events:none"
      document.body.append(caption)
    })
    await evidence("order", { orderPersistedAfterReload: true, actualFirstQuestionVisibleAfterReload: true })
  })
  const fillAnswers = async (second = false, anonymousProbe = false, at?: (fraction: number) => Promise<void>) => {
    const shirt = page.getByRole("group", { name: /^Taille de t-shirt/ })
    if (at) await at(0.055)
    await tap(page, shirt.getByRole("radio", { name: anonymousProbe ? "S" : second ? "L" : "M", exact: true }))
    if (at) await at(0.12)
    const permit = page.getByRole("group", { name: /^Permis de conduire/ }).getByRole("radio", { name: "Oui", exact: true })
    await tap(page, permit)
    assert(await permit.isChecked(), "Real permit answer must be selected")
    if (!second) {
      const transport = page.getByRole("group", { name: /^Matériel de transport/ })
      if (at) await at(0.20)
      await tap(page, transport.getByRole("checkbox", { name: "Vélo", exact: true }))
      if (at) await at(0.25)
      await tap(page, transport.getByRole("checkbox", { name: "Remorque", exact: true }))
      if (at) await at(0.34)
      await write(page.getByLabel(/^Point de rendez-vous préféré/), "Entrée nord")
    } else {
      // Invitations can prefill saved answers: actively clear the optional UI
      // instead of assuming a new form starts empty.
      const transport = page.getByRole("group", { name: /^Matériel de transport/ })
      for (const choice of ["Vélo", "Remorque", "Voiture"]) {
        const checkbox = transport.getByRole("checkbox", { name: choice, exact: true })
        if (await checkbox.isChecked()) await tap(page, checkbox)
      }
      const note = page.getByLabel(/^Point de rendez-vous préféré/)
      await tap(page, note); await note.press("ControlOrMeta+A"); await note.press("Backspace")
    }
  }
  const openSignup = async (url: string, shiftIndex: number, fillIdentity = true) => {
    await go(publicUrl)
    const quit = page.getByRole("button", { name: "Quitter la session", exact: true })
    if (await quit.count()) { await tap(page, quit); await quit.waitFor({ state: "hidden" }) }
    if (url !== publicUrl) await go(url)
    const slot = page.getByRole("button", { name: /^Sélectionner —/ }).nth(shiftIndex)
    await tap(page, slot); await tap(page, page.getByRole("button", { name: /^Continuer/ }))
    if (fillIdentity) {
      await completeVolunteerForm(page)
      assert.equal(await page.getByLabel("Email *", { exact: true }).inputValue(), email)
    }
  }
  const submit = async () => {
    const request = page.waitForRequest(item => item.method() === "POST" && new URL(item.url()).pathname === "/api/public/registrations")
    const response = await mutate("POST", "/api/public/registrations", () => tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true })), 201)
    const payload = (await request).postDataJSON()
    assert.equal(payload.charterAccepted, true, "Real current UI must send the checked convention; never supply a stub consent")
    assert.equal(payload.consent, true)
    return response
  }
  await scene("required-validation", async at => {
    await page.evaluate(() => document.getElementById("video-questions-reload-note")?.remove())
    await at(0.13)
    await openSignup(publicUrl, 0)
    let submissions = 0
    const observed = (request: import("playwright").Request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/public/registrations") submissions++
    }
    page.on("request", observed)
    try {
      await at(0.46)
      await tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
      // Current main has native required radio inputs and no novalidate. The
      // browser intercepts this click before React's custom answer check runs.
      // Show and check that real validation, never force the handler or invent
      // its unavailable error messages by bypassing HTML constraint validation.
      const first = page.getByRole("group", { name: /^Permis de conduire/ }).getByRole("radio", { name: "Oui", exact: true })
      const actual = await first.evaluate((input: HTMLInputElement) => ({ missing: input.validity.valueMissing, message: input.validationMessage, focused: document.activeElement === input }))
      assert(actual.missing && actual.focused && actual.message.length > 0, "Real native required validation and focus expected")
      assert.equal(actual.message, "Veuillez sélectionner l'une de ces options.", "Native browser validation must really be French, not replaced or hidden")
      assert.equal(submissions, 0)
    } finally { page.off("request", observed) }
    assert.equal((await read()).confirmedRegistrationCount, 0)
    await evidence("required-validation", { realNativeRequiredValidation: true, nativeFrenchMessageVerified: "Veuillez sélectionner l'une de ces options.", customReactErrorsNotTriggered: true, noRegistrationRequest: true, noRegistrationCreated: true })
  })
  await scene("volunteer-form", async at => {
    assert.equal(await page.getByRole("group", { name: /^Permis de conduire/ }).getByRole("radio", { name: "Oui", exact: true }).isChecked(), false, "Native validation focus must not be mistaken for an already selected answer")
    await fillAnswers(false, false, at)
    await at(0.54)
    const recap = page.getByText("Transmis à l'organisation", { exact: true }).filter({ visible: true }).first().locator("..")
    await recap.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }))
    const box = await recap.boundingBox(); const viewport = page.viewportSize()!
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, "Actual transmitted-data recap must be fully visible before submit")
    await at(0.73)
    const response = await submit(); const result = await response.json()
    // Member already exists: without an invitation its access link belongs only in email.
    assert.equal(result.editToken, null); assert.equal(result.linkSentByEmail, true)
    const snapshot = await read(); assertAnswer(snapshot, "Taille de t-shirt", "M")
    assertAnswer(snapshot, "Matériel de transport", ["Vélo", "Remorque"])
    assertAnswer(snapshot, "Point de rendez-vous préféré", "Entrée nord")
    assertAnswer(snapshot, "Permis de conduire", "Oui")
    assert.equal(snapshot.answers.length, 4)
    await evidence("volunteer-form", { actualSignup: true, accessLinkOnlyByEmail: true, fourAnswersStored: snapshot.answers.length === 4 })
  })
  await scene("email-proof", async at => {
    await at(0.42)
    const message = await options.showConfirmationEmail(page, email)
    assert.equal(message.recipient, email)
    const link = new URL(message.actualPersonalLink)
    assert.equal(link.origin, base)
    assert(/^\/my\/[^/]+$/.test(link.pathname), "Actual local personal link required")
    await evidence("email-proof", { actualLocalEmailShown: true, recipientVerified: true, personalLinkVerified: true })
  })
  await scene("admin-read", async at => {
    await go(`${admin}/registrations`)
    await page.getByText(email, { exact: true }).first().waitFor()
    await page.getByText(/Taille de t-shirt.*M/).first().scrollIntoViewIfNeeded()
    await at(0.29)
    await go(`${admin}/questions`)
    await page.getByRole("heading", { name: "Synthèse des réponses", exact: true }).waitFor()
    assert.equal((await read()).confirmedRegistrationCount, 1)
    await evidence("admin-read", { actualAnswersAndSummary: true })
  })
  await scene("summary-export", async at => {
    await at(0.05)
    const waiting = page.waitForEvent("download")
    await tap(page, page.getByRole("link", { name: /^Télécharger la synthèse \(CSV\)/ }))
    const download = await waiting
    const file = await download.path(); assert(file, "Actual downloaded summary required")
    const csv = await readFile(file, "utf8")
    assert(csv.includes("Taille de t-shirt") && csv.includes("Permis de conduire"))
    assert(!csv.includes(email), "Aggregate supplier summary must not disclose member email")
    assert(!csv.includes("Aline Mercier") && !csv.includes("Aline Exemple"), "Aggregate supplier summary must not disclose member identity")
    await at(0.16)
    const { parse } = await import("csv-parse/sync")
    const rows = parse(csv, { bom: true, delimiter: ";" }) as string[][]
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const header = rows.shift()!
    const table = `<table><thead><tr>${header.map(value => `<th>${escape(value)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    await page.setContent(`<html lang="fr"><meta charset="utf-8"><style>body{font:18px Arial;background:#f4f7fb;margin:22px}h1{font-size:25px}table{border-collapse:collapse;width:100%;font-size:16px}td,th{padding:9px;border-bottom:1px solid #ccd3de;text-align:left}th{background:#e2e8f0}</style><h1>Lecture de la synthèse réellement téléchargée</h1><p>Présentation du fichier CSV, distincte de l'application. Aucune identité ni coordonnée.</p>${table}</html>`)
    await evidence("summary-export", { actualCsvDownloaded: true, noMemberEmail: true })
  })
  await scene("invited-update", async at => {
    await openSignup(options.invitationUrl, 1)
    await at(0.28)
    await page.getByRole("group", { name: /^Taille de t-shirt/ }).scrollIntoViewIfNeeded()
    await fillAnswers(true)
    const chosen = page.getByRole("group", { name: /^Taille de t-shirt/ }).getByRole("radio", { name: "L", exact: true })
    assert(await chosen.isChecked())
    await chosen.scrollIntoViewIfNeeded()
    await at(0.43)
    await at(0.60)
    await submit()
    const snapshot = await read(); assertAnswer(snapshot, "Taille de t-shirt", "L")
    assert.equal(snapshot.confirmedRegistrationCount, 2)
    assertAnswer(snapshot, "Point de rendez-vous préféré", undefined)
    assertAnswer(snapshot, "Matériel de transport", undefined)
    await evidence("invited-update", { verifiedInvitationReplacedAnswer: true, emptyOptionalAnswersErased: true })
  })
  await scene("unverified-update", async () => {
    await openSignup(publicUrl, 2); await fillAnswers(true, true); await submit()
    assertAnswer(await read(), "Taille de t-shirt", "L")
    assert.equal((await read()).confirmedRegistrationCount, 3)
    await evidence("unverified-update", { anonymousEmailCouldNotOverwriteExistingAnswer: true })
  })
  await scene("answered-lock", async at => {
    await go(`${admin}/questions`)
    await tap(page, page.getByRole("button", { name: "Modifier la question « Taille de t-shirt »", exact: true }))
    const form = questionForm()
    assert(await form.getByLabel("Type de réponse", { exact: true }).isDisabled())
    await form.getByLabel("Type de réponse", { exact: true }).scrollIntoViewIfNeeded()
    await at(0.39)
    await write(form.getByLabel("Choix proposés *", { exact: true }), "S\nM\nXL")
    await mutate("PATCH", `/api/admin/events/${eventId}/questions/${(await read()).questions.find(item => item.label === "Taille de t-shirt")!.id}`, () => tap(page, form.getByRole("button", { name: "Enregistrer", exact: true })), 409)
    await page.getByText(/ces choix ne peuvent pas être retirés/).waitFor()
    await at(0.63); await tap(page, form.getByRole("button", { name: "Annuler", exact: true }))
    assertAnswer(await read(), "Taille de t-shirt", "L")
    await evidence("answered-lock", { typeReallyDisabled: true, usedChoiceRemovalReallyRejected: true })
  })
  await scene("edit-choices", async at => {
    await at(0.15)
    await tap(page, page.getByRole("button", { name: "Modifier la question « Taille de t-shirt »", exact: true }))
    const form = questionForm()
    await write(form.getByLabel("Choix proposés *", { exact: true }), "S\nM\nL\nXL\nXXL")
    const questionId = (await read()).questions.find(q => q.label === "Taille de t-shirt")!.id
    await at(0.41)
    await mutate("PATCH", `/api/admin/events/${eventId}/questions/${questionId}`, () => tap(page, form.getByRole("button", { name: "Enregistrer", exact: true })))
    await form.waitFor({ state: "hidden" })
    assert.deepEqual((await read()).questions.find(q => q.id === questionId)?.options, ["S", "M", "L", "XL", "XXL"])
    assertAnswer(await read(), "Taille de t-shirt", "L")
    await at(0.53)
    await go(`${admin}/registrations`)
    await page.getByText(/Taille de t-shirt.*L/).first().scrollIntoViewIfNeeded()
    await evidence("edit-choices", { additionalChoicePersisted: true, existingResponseUnchanged: true })
  })
  await scene("retire", async at => {
    await go(`${admin}/questions`)
    await at(0.105)
    await tap(page, page.getByRole("button", { name: "Retirer la question « Taille de t-shirt »", exact: true }))
    const dialog = page.getByRole("alertdialog", { name: "Retirer la question « Taille de t-shirt » ?", exact: true })
    await dialog.waitFor()
    const questionId = (await read()).questions.find(item => item.label === "Taille de t-shirt")!.id
    await at(0.36)
    const response = await mutate("DELETE", `/api/admin/events/${eventId}/questions/${questionId}`, () => tap(page, dialog.getByRole("button", { name: "Retirer", exact: true })))
    assert.equal((await response.json()).archived, true)
    const snapshot = await read(); assertAnswer(snapshot, "Taille de t-shirt", "L")
    assert.equal(snapshot.questions.find(item => item.id === questionId)?.active, false)
    await go(`${admin}/registrations`); await page.getByText(/Taille de t-shirt.*question retirée.*L/).first().scrollIntoViewIfNeeded()
    await at(0.57)
    await openSignup(publicUrl, 3, false)
    assert.equal(await page.getByRole("group", { name: /^Taille de t-shirt/ }).count(), 0)
    await page.getByRole("group", { name: /^Permis de conduire/ }).waitFor()
    await page.getByRole("group", { name: /^Permis de conduire/ }).scrollIntoViewIfNeeded()
    await evidence("retire", { actuallyRemovedFromActiveQuestions: true, storedAnswerRetained: true })
  })
}
