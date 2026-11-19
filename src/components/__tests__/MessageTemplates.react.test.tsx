/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import MessageTemplatesManager from "../admin/messages/MessageTemplatesManager"
import TargetedMessageForm from "../admin/TargetedMessageForm"
import { LIBRARY_TEMPLATES } from "@/lib/message-template-library"

// Message templates (#482), library and categories (#1414).
const templates = [{ id: "t1", name: "Merci", category: "Après", subject: "Merci {prénom}", body: "Merci pour {événement} !" }]
const organizationName = "Fête du quartier asbl"
const pluie = LIBRARY_TEMPLATES.find((entry) => entry.id === "alerte-meteo-pluie")!

describe("MessageTemplatesManager", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("asks before deleting, and deletes only on confirmation", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    render(<MessageTemplatesManager initialTemplates={templates} organizationName={organizationName} />)
    expect(screen.getByText("Catégorie :")).toHaveClass("sr-only")
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le modèle « Merci »" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Supprimer le modèle « Merci » ?")
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/message-templates/t1", { method: "DELETE" }))
    expect(await screen.findByText("Modèle « Merci » supprimé.")).toBeInTheDocument()
  })

  it("flags an unknown variable on its field before saving", () => {
    render(<MessageTemplatesManager initialTemplates={[]} organizationName={organizationName} />)
    fireEvent.click(screen.getByRole("button", { name: "Nouveau modèle" }))
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Bonjour {nom}" } })
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Objet *")).toHaveAccessibleDescription(/Variable inconnue : \{nom\}/)
  })

  it("offers a category on the form, with the library categories and « Autres »", () => {
    render(<MessageTemplatesManager initialTemplates={[]} organizationName={organizationName} />)
    fireEvent.click(screen.getByRole("button", { name: "Nouveau modèle" }))
    const category = screen.getByLabelText("Catégorie")
    expect(within(category).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Recruter et compléter", "Accueil", "Infos pratiques", "Tenue et matériel", "Cadre", "Planning",
      "Météo et imprévus", "Jour J", "Ressources", "Après", "Activités régulières", "Autres",
    ])
    expect(category).toHaveValue("Autres")
  })

  it("opens the grouped library, previews the email, and adds the template by name", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "lib-pluie", name: pluie.name, category: pluie.category, subject: pluie.subject, body: pluie.body }),
    })
    render(<MessageTemplatesManager initialTemplates={[]} organizationName={organizationName} />)

    fireEvent.click(screen.getByRole("button", { name: "Ajouter des modèles" }))
    const dialog = screen.getByRole("dialog", { name: "Ajouter des modèles" })
    expect(within(dialog).getByRole("heading", { name: "Météo et imprévus" })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: "Recruter et compléter" })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { level: 4, name: pluie.name })).toBeInTheDocument()

    // The preview is the same targeted email, with sample values and visible placeholders.
    fireEvent.click(within(dialog).getByRole("button", { name: (name) => name.includes("Aperçu") && name.includes(pluie.name) }))
    const frame = within(dialog).getByTitle("Aperçu de l'email « Alerte météo : pluie »")
    // Focusable, so a keyboard user can scroll a long email.
    expect(frame).not.toHaveAttribute("tabindex")
    expect(frame.getAttribute("srcdoc")).toContain("Hello Léa")
    expect(frame.getAttribute("srcdoc")).toContain("<mark")
    expect(frame.getAttribute("srcdoc")).toContain("[à compléter : tente, abri…]")

    fireEvent.click(within(dialog).getByRole("button", { name: (name) => name.includes("Ajouter à mes modèles") && name.includes(pluie.name) }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/settings/message-templates")
    expect(JSON.parse(init.body)).toEqual({ name: pluie.name, category: pluie.category, subject: pluie.subject, body: pluie.body })
    const added = await within(dialog).findByText(/Déjà dans mes modèles/)
    expect(added).toHaveTextContent(`Déjà dans mes modèles : « ${pluie.name} »`)
    // The add button is replaced: focus lands on the added notice, never back on <body>.
    await waitFor(() => expect(added).toHaveFocus())
    // The focused notice is the only confirmation: no second status talking over it.
    expect(within(dialog).queryByText(`Modèle « ${pluie.name} » ajouté à vos modèles.`)).toBeNull()
  })

  it("respects the limit of 100 with a clear message and disabled add buttons", () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: `t${index}`, name: `Modèle ${index}`, category: "Autres", subject: "Sujet", body: "Corps" }))
    render(<MessageTemplatesManager initialTemplates={full} organizationName={organizationName} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter des modèles" }))
    const dialog = screen.getByRole("dialog", { name: "Ajouter des modèles" })
    expect(within(dialog).getByText("100 modèles au plus : supprimez-en un pour en ajouter un autre.")).toBeInTheDocument()
    const add = within(dialog).getByRole("button", { name: (name) => name.includes("Ajouter à mes modèles") && name.includes(pluie.name) })
    expect(add).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(add)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("TargetedMessageForm — templates", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ recipients: 3, audience: "tous", preview: null }) })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("applies a template only on « Utiliser ce modèle », and can restore the previous text", () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={templates} />)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Mon objet" } })
    fireEvent.change(screen.getByLabelText("Partir d'un modèle"), { target: { value: "t1" } })
    expect(screen.getByLabelText("Objet *")).toHaveValue("Mon objet")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce modèle" }))
    expect(screen.getByLabelText("Objet *")).toHaveValue("Merci {prénom}")
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le texte précédent" }))
    expect(screen.getByLabelText("Objet *")).toHaveValue("Mon objet")
  })

  it("groups the picker by category", () => {
    const grouped = [
      { id: "a", name: "Parking et accès", category: "Infos pratiques", subject: "Parking", body: "Où se garer." },
      { id: "b", name: "Alerte météo : pluie", category: "Météo et imprévus", subject: "Pluie", body: "Prends un k-way." },
      { id: "c", name: "Merci !", category: "Après", subject: "Merci", body: "Merci !" },
    ]
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={grouped} />)
    const select = screen.getByLabelText("Partir d'un modèle")
    expect([...select.querySelectorAll("optgroup")].map((group) => group.getAttribute("label"))).toEqual(["Infos pratiques", "Météo et imprévus", "Après"])
  })

  it("filters the picker once the list is long", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `t${index}`,
      name: `Modèle ${index}`,
      category: index % 2 === 0 ? "Après" : "Infos pratiques",
      subject: index === 3 ? "Pluie annoncée" : "Sujet",
      body: "Corps",
    }))
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={many} />)
    expect(screen.getByRole("group", { name: "Partir d'un modèle" })).toBeInTheDocument()
    const search = screen.getByLabelText("Rechercher un modèle")
    expect(search).toHaveAccessibleDescription(/Nom, objet ou catégorie/)
    expect(search).not.toHaveAttribute("placeholder")
    fireEvent.change(search, { target: { value: "pluie" } })
    const select = screen.getByRole("combobox", { name: "Modèle" })
    expect([...select.querySelectorAll("option")].filter((option) => option.value).map((option) => option.textContent)).toEqual(["Modèle 3"])
    expect(await screen.findByText("1 modèle dans la liste.")).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "introuvable" } })
    expect(await screen.findByText("Aucun modèle ne correspond.")).toBeInTheDocument()
  })

  it("announces when the search clears the chosen template", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `t${index}`,
      name: index === 3 ? "Pluie annoncée" : `Modèle ${index}`,
      category: "Infos pratiques",
      subject: "Sujet",
      body: "Corps",
    }))
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={many} />)
    const search = screen.getByLabelText("Rechercher un modèle")
    const select = screen.getByRole("combobox", { name: "Modèle" })
    fireEvent.change(search, { target: { value: "pluie" } })
    fireEvent.change(select, { target: { value: "t3" } })
    expect(select).toHaveValue("t3")
    fireEvent.change(search, { target: { value: "introuvable" } })
    expect(select).toHaveValue("")
    // One announcement: the cleared choice, then the count.
    expect(await screen.findByText("Le modèle choisi n'est plus dans la liste filtrée. Aucun modèle ne correspond.")).toBeInTheDocument()
  })

  it("announces the fields to correct when only a variable or a placeholder remains", async () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={[]} />)
    await screen.findByText("3 personnes recevront ce message.")
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Au {poste}" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Bonjour [à compléter : lieu]" } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    const first = screen.getByRole("alert")
    expect(first).toHaveTextContent("À corriger : objet, message.")
    // Same problems on a second attempt: the summary is rebuilt so it is announced again.
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first))
    expect(screen.getByRole("alert")).toHaveTextContent("À corriger : objet, message.")
    // Only the field with a problem is named.
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Bonjour" } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("À corriger : message.")
    // A missing subject and a placeholder in the message: the alert names both, and the focus goes
    // to the first of them, never to a field the alert leaves out.
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("À corriger : objet, message.")
    expect(screen.getByLabelText("Objet *")).toHaveFocus()
  })

  it("warns that an applied template still has a placeholder to replace", async () => {
    const withPlaceholder = [{ id: "p1", name: "Alerte météo : pluie", category: "Météo et imprévus", subject: "Pluie [à compléter : quand]", body: "Prends de quoi te couvrir." }]
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={withPlaceholder} />)
    fireEvent.change(screen.getByLabelText("Partir d'un modèle"), { target: { value: "p1" } })
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce modèle" }))
    expect(await screen.findByText(/Des mentions \[à compléter\] sont à remplacer avant l'envoi\./)).toBeInTheDocument()
  })

  it("puts a variable problem on the field that has it", () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={[]} />)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Au {poste}" } })
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Message *")).not.toHaveAttribute("aria-invalid")
  })

  it("ties a remaining [à compléter] to the field and blocks the preview", () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={[]} />)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Info [à compléter : lieu]" } })
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Objet *")).toHaveAccessibleDescription(/à compléter/)
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(document.activeElement).toBe(screen.getByLabelText("Objet *"))
    // The only fetch is the recipient count of the first render.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].body).toContain('"dryRun":true')
  })
})
