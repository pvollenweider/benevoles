/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { useRef, useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import FormStatus from "@/components/FormStatus"
import EventPagesManager, { type EventPageRow } from "@/components/admin/EventPagesManager"
import ManualAddForm from "@/components/admin/registrations/ManualAddForm"
import { EMPTY_ADD_FORM, type AddFormValues, type Registration } from "@/components/admin/registrations/types"
import RegistrationsManager from "@/components/admin/RegistrationsManager"
import ReadBeforeLinks from "@/components/ReadBeforeLinks"
import SignupForm from "@/components/public/signup/SignupForm"
import { useSubmit } from "@/lib/use-submit"
import { startVirtualScreenReader, stopVirtualScreenReader, type VirtualScreenReader } from "./virtual-screen-reader"

// The virtual screen reader (#739, step 4) approximates what a person hears from the accessibility
// tree, the focus changes and the live regions. It is not VoiceOver or NVDA: it checks the phrases
// announced, not a real voice, and remains a unit test on jsdom.

afterEach(async () => {
  await stopVirtualScreenReader()
  cleanup()
  vi.unstubAllGlobals()
})

/** Waits until `text` was spoken, then lets the test assert on the exact phrase. */
async function waitForSpoken(reader: VirtualScreenReader, text: string) {
  await waitFor(async () => {
    expect((await reader.spokenPhraseLog()).join("\n")).toContain(text)
  })
}

const FIELD_MESSAGE = "Indiquez le nom (2 caractères au moins)."
const GENERAL_MESSAGE = "La demande n'a pas pu être envoyée."

/** A form on the project's pattern: useSubmit, FormStatus, one described field, one general action. */
function ErrorForm() {
  const { error, fail, isInvalid, quiet } = useSubmit()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <form onSubmit={(e) => { e.preventDefault(); fail(FIELD_MESSAGE, "name", inputRef.current) }}>
      <label htmlFor="name">Nom</label>
      <input id="name" ref={inputRef} aria-invalid={isInvalid("name")} aria-describedby={isInvalid("name") ? "name-error" : undefined} />
      <button type="submit">Envoyer</button>
      <button type="button" onClick={() => fail(GENERAL_MESSAGE)}>Action</button>
      <FormStatus error={error} errorId="name-error" quiet={quiet} />
    </form>
  )
}

const faq: EventPageRow = { id: "p1", slug: "faq", title: "FAQ", content: "", displayOrder: 0, roleNames: [] }
const bar = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }
const accueil = { id: "s2", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "14:00", endTime: "16:00", capacity: 3, registrationCount: 1 }
const registration = (id: string, firstName: string, shift: typeof bar): Registration => ({
  id, status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: `v-${id}`, firstName, lastName: "Martin", email: `${id}@x.ch`, phone: null },
  shift, isLeader: false, checkedInAt: null,
})

describe("virtual screen reader — spoken journeys (#739)", () => {
  // What a person hears after « Enregistrer »: the dialog, the button that closes it, then one
  // polite sentence. The assertion matters because the same result said once by the status and
  // again by a moved focus would make one save sound like two.
  it("says a save result once, in the polite status of the information pages manager", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ...faq, roleNames: [] }),
    }))
    const view = render(<EventPagesManager eventId="evt-1" initialPages={[faq]} postes={[]} sectorsAdopted={false} />)
    const reader = await startVirtualScreenReader(view.container)

    fireEvent.click(screen.getByRole("button", { name: "Modifier la page « FAQ »" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "FAQ" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitForSpoken(reader, "Page « FAQ » enregistrée.")

    const log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.startsWith("polite:"))).toEqual(["polite: Page « FAQ » enregistrée."])
    expect(log.filter((phrase) => phrase.includes("Page « FAQ » enregistrée."))).toHaveLength(1)
  })

  // What a person hears after « Ajouter » without a shift: « Créneau » takes the focus and says
  // its own error once. The form already keeps this field error out of its alert; the test stops a
  // future change from also voicing it in the alert and making it heard twice.
  it("reads a field error once, with the field that takes focus", async () => {
    function Harness() {
      const [form, setForm] = useState<AddFormValues>(EMPTY_ADD_FORM)
      return <ManualAddForm eventId="evt-1" shifts={[bar]} registrations={[]} timeZone="Europe/Zurich" form={form} onFormChange={setForm} onAdded={() => {}} onCancel={() => {}} />
    }
    const view = render(<Harness />)
    const reader = await startVirtualScreenReader(view.container)

    fireEvent.submit(screen.getByRole("button", { name: "Ajouter" }).closest("form")!)
    await waitForSpoken(reader, "Sélectionnez un créneau.")

    const log = await reader.spokenPhraseLog()
    const heard = log.filter((phrase) => phrase.includes("Sélectionnez un créneau."))
    expect(heard).toHaveLength(1)
    expect(heard[0]).toContain("combobox, Créneau")
    expect(log.filter((phrase) => phrase.startsWith("assertive:") && phrase.includes("Sélectionnez un créneau."))).toEqual([])
    expect(screen.queryAllByRole("alert").filter((alert) => alert.textContent?.trim())).toEqual([])
    expect(screen.getByRole("combobox", { name: "Créneau" })).toHaveFocus()
  })

  // (a) A field error whose field takes the focus: the field's phrase says it, the alert stays
  // silent, so the person hears the sentence exactly once.
  it("does not repeat a field error from the alert when the field takes focus", async () => {
    const view = render(<SignupForm open siteName="benevol.app" />)
    const reader = await startVirtualScreenReader(view.container)

    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))
    const message = "Indiquez le nom de l'association (2 caractères au moins)."
    await waitForSpoken(reader, message)

    const log = await reader.spokenPhraseLog()
    const heard = log.filter((phrase) => phrase.includes(message))
    expect(heard).toHaveLength(1)
    expect(heard[0]).toContain("textbox, Nom de l'association")
    expect(log.filter((phrase) => phrase.startsWith("assertive:") && phrase.includes(message))).toEqual([])
  })

  // (b) The field already had the focus: re-focusing says nothing, so the alert says the error.
  // A second identical failure is emptied then refilled in a later task, and heard once more.
  it("says a field error once from the alert when the field already had focus", async () => {
    const view = render(<ErrorForm />)
    const reader = await startVirtualScreenReader(view.container)
    const input = screen.getByRole("textbox", { name: "Nom" })
    input.focus()
    // Let the reader process the focus, as it does before the person presses Enter.
    await waitForSpoken(reader, "textbox, Nom")
    await reader.clear()

    fireEvent.submit(input.closest("form")!)
    await waitForSpoken(reader, FIELD_MESSAGE)
    let log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.includes(FIELD_MESSAGE))).toEqual([`assertive: ${FIELD_MESSAGE}`])

    await reader.clear()
    fireEvent.submit(input.closest("form")!)
    await waitFor(async () => {
      const phrases = (await reader.spokenPhraseLog()).filter((phrase) => phrase.startsWith("assertive:") && phrase.includes(FIELD_MESSAGE))
      expect(phrases).toHaveLength(1)
    })
    log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.includes(FIELD_MESSAGE))).toEqual([`assertive: ${FIELD_MESSAGE}`])
  })

  // (c) A general error: the alert says it once and the focus stays where it is.
  it("says a general error once from the alert, without moving the focus", async () => {
    const view = render(<ErrorForm />)
    const reader = await startVirtualScreenReader(view.container)
    const action = screen.getByRole("button", { name: "Action" })
    action.focus()

    fireEvent.click(action)
    await waitForSpoken(reader, GENERAL_MESSAGE)
    let log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.startsWith("assertive:") && phrase.includes(GENERAL_MESSAGE))).toEqual([`assertive: ${GENERAL_MESSAGE}`])
    expect(action).toHaveFocus()

    await reader.clear()
    fireEvent.click(action)
    await waitFor(async () => {
      const phrases = (await reader.spokenPhraseLog()).filter((phrase) => phrase.startsWith("assertive:") && phrase.includes(GENERAL_MESSAGE))
      expect(phrases).toHaveLength(1)
    })
    log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.includes(GENERAL_MESSAGE))).toEqual([`assertive: ${GENERAL_MESSAGE}`])
  })

  // What a person hears when a filter changes: the count once, in the one polite region. After a
  // bulk action the result is said once and the count is not repeated with it (#555, #574, #580).
  it("announces a filter's count once, then its result without the count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ done: 1, changedIds: ["r1"] }) }))
    const view = render(
      <RegistrationsManager
        eventId="evt-1"
        timeZone="Europe/Zurich"
        shifts={[bar, accueil]}
        initialRegistrations={[registration("r1", "Alice", bar), registration("r2", "Bob", accueil)]}
      />,
    )
    const reader = await startVirtualScreenReader(view.container)

    fireEvent.change(screen.getByLabelText("Filtrer par poste"), { target: { value: "Bar" } })
    await waitForSpoken(reader, "1 inscription affichée")
    let log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.includes("inscription affichée"))).toEqual(["polite: 1 inscription affichée"])

    await reader.clear()
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent (1)" }))
    await waitForSpoken(reader, "1 personne marquée présente.")

    log = await reader.spokenPhraseLog()
    expect(log.filter((phrase) => phrase.includes("1 personne marquée présente."))).toEqual(["polite: 1 personne marquée présente."])
    expect(log.filter((phrase) => phrase.includes("inscription affichée"))).toEqual([])
    // Still on the page for anyone reading it, just not said again.
    expect(screen.getByText("1 inscription affichée")).toBeInTheDocument()
  })

  // A link read out of its context: the whole sentence is its name, so a person who lands on it
  // knows what it opens without hearing the heading above.
  it("reads the « À lire avant ton créneau » link as a whole sentence", async () => {
    const view = render(<ReadBeforeLinks pages={[{ title: "Tenir la caisse", url: "https://asso.example/fete/caisse" }]} label="À lire avant ton créneau" />)
    const reader = await startVirtualScreenReader(view.container)

    await reader.next()
    expect(await reader.lastSpokenPhrase()).toBe("link, À lire avant ton créneau : Tenir la caisse")
    expect((await reader.spokenPhraseLog()).filter((phrase) => phrase.startsWith("link,"))).toHaveLength(1)
  })
})
