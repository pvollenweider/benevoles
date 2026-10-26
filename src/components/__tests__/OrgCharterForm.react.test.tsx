/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"

import OrgCharterForm from "../admin/OrgCharterForm"
import {
  buildVolunteerCharter,
  INSURANCE_CLAUSE_WITH_ORG_RC,
  INSURANCE_CLAUSE_WITHOUT_ORG_RC,
  LEGACY_DEFAULT_CHARTERS,
} from "@/lib/volunteer-charter"

// The insurance switch of the charter settings (#579): its state is exposed by aria-checked, which
// also drives its forced-colours styling (`forced-colors:aria-checked:*`), so the attribute must
// follow every toggle.
describe("OrgCharterForm insurance switch", () => {
  afterEach(cleanup)

  it("is a named switch whose aria-checked follows the state", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = screen.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
    expect(toggle).toHaveAttribute("aria-checked", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("Votre assurance RC couvre les dommages causés à des tiers.")).toBeInTheDocument()
    expect(toggle).toHaveAccessibleDescription("Votre assurance RC couvre les dommages causés à des tiers.")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
  })

  it("starts checked when the organisation provides insurance", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("keeps the forced-colours state classes on the attribute, not on a class toggle", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = screen.getByRole("switch")
    expect(toggle.className).toContain("forced-colors:aria-checked:bg-[Highlight]")
    expect(toggle.className).toContain("forced-colors:border-[CanvasText]")
    expect(toggle.firstElementChild?.className).toContain("forced-colors:bg-[CanvasText]")
  })
})

const WITH = buildVolunteerCharter({ hasOrgInsurance: true })
const WITHOUT = buildVolunteerCharter({ hasOrgInsurance: false })
const textarea = () => screen.getByRole("textbox", { name: "Charte des bénévoles" }) as HTMLTextAreaElement
const UPDATE = "Mettre à jour le paragraphe sur l'assurance"

describe("OrgCharterForm insurance switch and the charter text", () => {
  afterEach(cleanup)

  it("switches a default text to the other default, and says so", async () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    expect(textarea().value).toBe(WITH)
    fireEvent.click(screen.getByRole("switch"))
    expect(textarea().value).toBe(WITHOUT)
    expect(screen.queryByRole("button", { name: UPDATE })).toBeNull()
    expect(await screen.findByText("Texte de la charte adapté à ce choix.")).toBeInTheDocument()
  })

  it("gives a saved old default the new wording when toggled", () => {
    render(<OrgCharterForm initialCharter={LEGACY_DEFAULT_CHARTERS.withOrgInsurance} initialHasOrgInsurance={true} />)
    fireEvent.click(screen.getByRole("switch"))
    expect(textarea().value).toBe(WITHOUT)
  })

  it("resets an old default to the current default", () => {
    render(<OrgCharterForm initialCharter={LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance} initialHasOrgInsurance={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser la charte par défaut" }))
    expect(textarea().value).toBe(WITHOUT)
  })

  // Regression: toggling replaced a customised text with the default, losing unsaved edits.
  it("keeps a customised text when toggled, and explains it next to the switch", async () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    render(<OrgCharterForm initialCharter={custom} initialHasOrgInsurance={true} />)
    expect(screen.queryByRole("button", { name: UPDATE })).toBeNull()
    const toggle = screen.getByRole("switch")
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(textarea().value).toBe(custom)
    expect(toggle).toHaveAccessibleDescription(/Votre texte de charte est personnalisé : il n'a pas été modifié/)
    expect(screen.getByRole("button", { name: UPDATE })).toBeInTheDocument()
    expect(await screen.findByText("Votre texte personnalisé n'a pas été modifié.")).toBeInTheDocument()
  })

  it("shows what will change before replacing just the insurance paragraph", async () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    render(<OrgCharterForm initialCharter={custom} initialHasOrgInsurance={true} />)
    fireEvent.click(screen.getByRole("switch"))
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    const preview = screen.getByRole("group", { name: "Ce paragraphe sera remplacé :" })
    expect(within(preview).getByText(INSURANCE_CLAUSE_WITH_ORG_RC)).toBeInTheDocument()
    expect(within(preview).getByText(INSURANCE_CLAUSE_WITHOUT_ORG_RC)).toBeInTheDocument()
    expect(textarea().value).toBe(custom) // nothing changed yet
    fireEvent.click(within(preview).getByRole("button", { name: "Remplacer le paragraphe" }))
    expect(textarea().value).toBe(WITHOUT.replace("bienveillant", "chaleureux"))
    expect(screen.queryByRole("button", { name: UPDATE })).toBeNull()
    expect(await screen.findByText("Paragraphe sur l'assurance mis à jour. Enregistrez pour l'appliquer.")).toBeInTheDocument()
  })

  it("closes the preview when the text is edited, so typing never moves focus into it", () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    render(<OrgCharterForm initialCharter={custom} initialHasOrgInsurance={true} />)
    fireEvent.click(screen.getByRole("switch"))
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    expect(screen.getByRole("group")).toBeInTheDocument()
    textarea().focus()
    fireEvent.change(textarea(), { target: { value: `${custom} ` } })
    expect(screen.queryByRole("group")).toBeNull()
    expect(document.activeElement).toBe(textarea())
  })

  it("appends the paragraph to a customised text that has none, and Annuler changes nothing", () => {
    render(<OrgCharterForm initialCharter="Notre charte." initialHasOrgInsurance={false} />)
    fireEvent.click(screen.getByRole("switch"))
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    let preview = screen.getByRole("group", { name: "Ce paragraphe sera ajouté à la fin du texte :" })
    fireEvent.click(within(preview).getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("group")).toBeNull()
    expect(textarea().value).toBe("Notre charte.")
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    preview = screen.getByRole("group", { name: "Ce paragraphe sera ajouté à la fin du texte :" })
    fireEvent.click(within(preview).getByRole("button", { name: "Ajouter le paragraphe" }))
    expect(textarea().value).toBe(`Notre charte.\n\n${INSURANCE_CLAUSE_WITH_ORG_RC}`)
  })
})
