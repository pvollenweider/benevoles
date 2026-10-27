/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import TargetedMessageForm from "../admin/TargetedMessageForm"
import { localNow } from "@/lib/scheduled-message"

// « Écrire aux bénévoles » (#396): audience, live count, preview, confirmation, one send.

const fetchMock = vi.fn()
const json = (body: unknown, ok = true) => ({ ok, json: async () => body })

function lastBody() {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return JSON.parse(init.body)
}

describe("TargetedMessageForm", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      if (body.dryRun) {
        const n = body.audience.kind === "waitlist" ? 0 : body.audience.kind === "role" ? 3 : 12
        return json({ recipients: n, audience: `aud:${body.audience.kind}`, preview: n ? { subject: `${body.subject} — Fête`, html: "<p>hi</p>" } : null })
      }
      return json({ sent: 3, audience: "aud:role" })
    })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = (initialAudience: Parameters<typeof TargetedMessageForm>[0]["initialAudience"] = { kind: "event" }) =>
    render(<TargetedMessageForm eventId="evt-1" roles={["Bar", "Accueil"]} shifts={[{ id: "s1", roleName: "Bar", name: "Bar — sam. 4 juil., 10:00–12:00" }]} initialAudience={initialAudience} />)

  it("counts the recipients of the chosen audience and disables sending when nobody matches", async () => {
    setup()
    expect(await screen.findByText("12 personnes recevront ce message.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Les personnes en liste d'attente" }))
    expect(await screen.findByText("Personne à qui écrire dans cette sélection.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" })).toHaveAccessibleDescription("Personne à qui écrire dans cette sélection.")
  })

  it("starts on the prefilled audience and its dependent select", async () => {
    setup({ kind: "role", roleName: "Accueil" })
    expect(screen.getByRole("radio", { name: "Les bénévoles d'un poste" })).toBeChecked()
    expect(screen.getByRole("combobox", { name: "Poste" })).toHaveValue("Accueil")
    await waitFor(() => expect(lastBody().audience).toEqual({ kind: "role", roleName: "Accueil" }))
  })

  it("offers no sector audience without sectors (#1170)", () => {
    setup()
    expect(screen.queryByRole("radio", { name: "Les bénévoles d'un secteur" })).not.toBeInTheDocument()
  })

  it("writes to a sector: radio after « Tous », its select right under it, the count for that sector (#1170)", async () => {
    render(<TargetedMessageForm eventId="evt-1" roles={["Bar"]} shifts={[]} sectors={[{ value: "sec-bar", label: "Buvette" }, { value: "autres", label: "Autres postes" }]} initialAudience={{ kind: "event" }} />)
    const radios = screen.getAllByRole("radio").map((r) => r.getAttribute("value"))
    expect(radios.slice(0, 3)).toEqual(["event", "sector", "role"])
    fireEvent.click(screen.getByRole("radio", { name: "Les bénévoles d'un secteur" }))
    const select = screen.getByRole("combobox", { name: "Secteur" })
    // Read right after its own radio, before the next one.
    expect(screen.getByRole("radio", { name: "Les bénévoles d'un secteur" }).compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(select.compareDocumentPosition(screen.getByRole("radio", { name: "Les bénévoles d'un poste" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() => expect(lastBody().audience).toEqual({ kind: "sector", sectorId: "sec-bar" }))
    fireEvent.change(select, { target: { value: "autres" } })
    await waitFor(() => expect(lastBody().audience).toEqual({ kind: "sector", sectorId: "autres" }))
    expect(await screen.findByText("12 personnes recevront ce message.")).toBeInTheDocument()
  })

  it("starts on a prefilled sector (#1170)", async () => {
    render(<TargetedMessageForm eventId="evt-1" roles={["Bar"]} shifts={[]} sectors={[{ value: "sec-bar", label: "Buvette" }, { value: "autres", label: "Autres postes" }]} initialAudience={{ kind: "sector", sectorId: "autres" }} />)
    expect(screen.getByRole("radio", { name: "Les bénévoles d'un secteur" })).toBeChecked()
    expect(screen.getByRole("combobox", { name: "Secteur" })).toHaveValue("autres")
  })

  it("names the missing fields instead of previewing", async () => {
    setup()
    await screen.findByText(/12 personnes/)
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Champs obligatoires manquants : objet, message.")
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Objet *")).toHaveFocus()
  })

  it("previews, asks for confirmation with the count, sends once, then announces the result", async () => {
    setup({ kind: "role", roleName: "Bar" })
    await screen.findByText("3 personnes recevront ce message.")
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Parking" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Entrée par la rue Basse." } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))

    const preview = await screen.findByRole("dialog", { name: "Aperçu de l'email" })
    expect(preview).toHaveTextContent("Objet : Parking — Fête")
    expect(lastBody()).toMatchObject({ audience: { kind: "role", roleName: "Bar" }, subject: "Parking", message: "Entrée par la rue Basse.", dryRun: true })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer à 3 personnes" }))

    const confirm = await screen.findByRole("dialog", { name: "Confirmer l'envoi" })
    expect(confirm).toHaveTextContent("« Parking » va partir à 3 personnes")
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'envoi" }))

    const done = await screen.findByRole("heading", { name: "Message envoyé à 3 personnes" })
    // The heading is in the DOM before React runs the passive effects (the dialog's cleanup, then
    // the focus move): under load the assertion used to land in between, with focus on <body>.
    await waitFor(() => expect(done).toHaveFocus())
    const sends = fetchMock.mock.calls.filter(([, init]) => !JSON.parse(init.body).dryRun)
    expect(sends).toHaveLength(1)
    expect(JSON.parse(sends[0][1].body)).toEqual({ audience: { kind: "role", roleName: "Bar" }, subject: "Parking", message: "Entrée par la rue Basse.", push: false })
  })

  it("warns, but never blocks, when some recipients have an address to verify (#599)", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      if (body.dryRun) return json({ recipients: 3, audience: "aud:role", preview: { subject: `${body.subject} — Fête`, html: "<p>hi</p>" }, addressesToVerify: 2 })
      return json({ sent: 3, audience: "aud:role" })
    })
    setup({ kind: "role", roleName: "Bar" })
    await screen.findByText("3 personnes recevront ce message.")
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Parking" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Entrée par la rue Basse." } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))

    const preview = await screen.findByRole("dialog", { name: "Aperçu de l'email" })
    expect(preview).toHaveTextContent("2 destinataires ont une adresse à vérifier")
    const sendButton = screen.getByRole("button", { name: "Envoyer à 3 personnes" })
    expect(sendButton).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(sendButton)

    const confirm = await screen.findByRole("dialog", { name: "Confirmer l'envoi" })
    expect(confirm).toHaveTextContent("2 destinataires ont une adresse à vérifier")
    expect(screen.getByRole("button", { name: "Confirmer l'envoi" })).not.toHaveAttribute("aria-disabled", "true")
  })

  it("shows the server's refusal", async () => {
    setup()
    await screen.findByText(/12 personnes/)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "x" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "y" } })
    fetchMock.mockResolvedValueOnce(json({ error: "Trop de messages envoyés cette heure. Réessayez plus tard." }, false))
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de messages envoyés cette heure.")
  })

  // « Programmer l'envoi » (#1019): a date and time of the organisation's zone, checked like on
  // the server, a preview and a confirmation that say when and that the count is recalculated.
  describe("scheduled send", () => {
    const zone = "Europe/Zurich"
    // Calendar days of the zone, not 24 hours: the day the clocks go back lasts 25 hours, and
    // « now minus 24 h » was still today during its last hour.
    const shiftDay = (days: number) => {
      const d = new Date(`${localNow(new Date(), zone).date}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() + days)
      return d.toISOString().slice(0, 10)
    }
    const tomorrow = () => shiftDay(1)
    const yesterday = () => shiftDay(-1)
    const fillText = () => {
      fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Parking" } })
      fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Entrée par la rue Basse." } })
    }

    it("shows the date and time fields only once « Programmer l'envoi » is chosen, and says the count is recalculated", async () => {
      setup()
      await screen.findByText("12 personnes recevront ce message.")
      expect(screen.queryByLabelText(/Date d'envoi/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("radio", { name: "Programmer l'envoi" }))
      expect(screen.getByLabelText("Date d'envoi *")).toHaveAttribute("type", "date")
      expect(screen.getByLabelText("Heure d'envoi (Europe/Zurich) *")).toHaveAccessibleDescription(/Les destinataires sont calculés au moment de l'envoi/)
      expect(screen.getByText("12 personnes aujourd'hui ; le nombre est recalculé au moment de l'envoi.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Voir l'aperçu et programmer" })).toBeInTheDocument()
      fireEvent.click(screen.getByRole("radio", { name: "Maintenant" }))
      expect(screen.queryByLabelText(/Date d'envoi/)).not.toBeInTheDocument()
    })

    it("refuses a missing or past date on the field itself, and focuses it", async () => {
      setup()
      await screen.findByText(/12 personnes/)
      fillText()
      fireEvent.click(screen.getByRole("radio", { name: "Programmer l'envoi" }))
      fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et programmer" }))
      const dateField = screen.getByLabelText("Date d'envoi *")
      expect(dateField).toHaveAttribute("aria-invalid", "true")
      expect(dateField).toHaveFocus()
      expect(screen.getByRole("alert")).toHaveTextContent("À corriger : date d'envoi.")
      expect(dateField).toHaveAccessibleDescription(/Indiquez la date d'envoi./)

      fireEvent.change(dateField, { target: { value: yesterday() } })
      fireEvent.change(screen.getByLabelText(/Heure d'envoi/), { target: { value: "10:00" } })
      expect(dateField).toHaveAccessibleDescription(/Cette date est passée/)
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("scheduled-messages"))).toHaveLength(0)
    })

    it("previews, confirms with the date and the count, schedules once, then points to the list", async () => {
      setup({ kind: "role", roleName: "Bar" })
      await screen.findByText(/3 personnes/)
      fillText()
      fireEvent.click(screen.getByRole("radio", { name: "Programmer l'envoi" }))
      fireEvent.change(screen.getByLabelText("Date d'envoi *"), { target: { value: tomorrow() } })
      fireEvent.change(screen.getByLabelText(/Heure d'envoi/), { target: { value: "18:00" } })
      fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et programmer" }))

      const preview = await screen.findByRole("dialog", { name: "Aperçu de l'email" })
      expect(preview).toHaveTextContent(/Programmer l'email pour le .+ à 18:00 \(Europe\/Zurich\), à 3 personnes \(aud:role, nombre actuel, recalculé au moment de l'envoi\)/)
      fetchMock.mockResolvedValueOnce(json({ id: "sm-1", when: "samedi 17 octobre à 18:00 (Europe/Zurich)", audience: "aud:role", recipients: 3 }))
      fireEvent.click(screen.getByRole("button", { name: "Programmer pour 3 personnes" }))
      const confirm = await screen.findByRole("dialog", { name: "Confirmer la programmation" })
      expect(confirm).toHaveTextContent("Vous pourrez l'annuler jusque-là dans « Messages programmés »")
      fireEvent.click(screen.getByRole("button", { name: "Confirmer la programmation" }))

      const done = await screen.findByRole("heading", { name: "Message programmé pour le samedi 17 octobre à 18:00 (Europe/Zurich)" })
      await waitFor(() => expect(done).toHaveFocus())
      expect(screen.getByRole("link", { name: "Messages programmés" })).toHaveAttribute("href", "#scheduled-messages-heading")
      const schedules = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/scheduled-messages"))
      expect(schedules).toHaveLength(1)
      expect(JSON.parse(schedules[0][1].body)).toEqual({ audience: { kind: "role", roleName: "Bar" }, subject: "Parking", message: "Entrée par la rue Basse.", push: false, date: tomorrow(), time: "18:00" })
    })

    it("brings a time refused by the server back on its field, focused", async () => {
      setup()
      await screen.findByText(/12 personnes/)
      fillText()
      fireEvent.click(screen.getByRole("radio", { name: "Programmer l'envoi" }))
      fireEvent.change(screen.getByLabelText("Date d'envoi *"), { target: { value: tomorrow() } })
      fireEvent.change(screen.getByLabelText(/Heure d'envoi/), { target: { value: "09:00" } })
      fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et programmer" }))
      await screen.findByRole("dialog", { name: "Aperçu de l'email" })
      fireEvent.click(screen.getByRole("button", { name: "Programmer pour 12 personnes" }))
      fetchMock.mockResolvedValueOnce(json({ error: "Cette heure est passée : choisissez une heure après 09:02 (heure de Europe/Zurich).", field: "time" }, false))
      fireEvent.click(await screen.findByRole("button", { name: "Confirmer la programmation" }))
      const timeField = screen.getByLabelText(/Heure d'envoi/)
      await waitFor(() => expect(timeField).toHaveFocus())
      expect(timeField).toHaveAttribute("aria-invalid", "true")
      expect(timeField).toHaveAccessibleDescription(/choisissez une heure après 09:02/)
    })

    it("offers no scheduling on an archived event", async () => {
      render(<TargetedMessageForm eventId="evt-1" roles={[]} shifts={[]} initialAudience={{ kind: "event" }} canSchedule={false} />)
      await screen.findByText(/12 personnes/)
      expect(screen.queryByRole("radio", { name: "Programmer l'envoi" })).not.toBeInTheDocument()
    })
  })
})
