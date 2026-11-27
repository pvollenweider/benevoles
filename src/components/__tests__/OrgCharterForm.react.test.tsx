/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react"

import OrgCharterForm from "../admin/OrgCharterForm"
import {
  buildVolunteerCharter,
  INSURANCE_CLAUSE_WITH_ORG_RC,
  INSURANCE_CLAUSE_WITHOUT_ORG_RC,
  LEGACY_DEFAULT_CHARTERS,
} from "@/lib/volunteer-charter"

// The switches of the convention settings (#579, #1468): their state is exposed by aria-checked,
// which also drives the forced-colours styling (`forced-colors:aria-checked:*`), so the attribute
// must follow every toggle.
const insuranceSwitch = () => screen.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
const conventionSwitch = () => screen.getByRole("switch", { name: "Demander aux bénévoles d'accepter une convention" })

describe("OrgCharterForm insurance switch", () => {
  afterEach(cleanup)

  it("is a named switch whose aria-checked follows the state", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = insuranceSwitch()
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
    expect(insuranceSwitch()).toHaveAttribute("aria-checked", "true")
  })

  it("keeps the forced-colours state classes on the attribute, not on a class toggle", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={false} />)
    const toggle = insuranceSwitch()
    expect(toggle.className).toContain("forced-colors:aria-checked:bg-[Highlight]")
    expect(toggle.className).toContain("forced-colors:border-[CanvasText]")
    expect(toggle.firstElementChild?.className).toContain("forced-colors:bg-[CanvasText]")
  })
})

const WITH = buildVolunteerCharter({ hasOrgInsurance: true })
const WITHOUT = buildVolunteerCharter({ hasOrgInsurance: false })
const textarea = () => screen.getByRole("textbox", { name: "Convention des bénévoles" }) as HTMLTextAreaElement
const UPDATE = "Mettre à jour le paragraphe sur l'assurance"

describe("OrgCharterForm insurance switch and the convention text", () => {
  afterEach(cleanup)

  it("switches a default text to the other default, and says so", async () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    expect(textarea().value).toBe(WITH)
    fireEvent.click(insuranceSwitch())
    expect(textarea().value).toBe(WITHOUT)
    expect(screen.queryByRole("button", { name: UPDATE })).toBeNull()
    expect(await screen.findByText("Texte de la convention adapté à ce choix.")).toBeInTheDocument()
  })

  it("gives a saved old default the new wording when toggled", () => {
    render(<OrgCharterForm initialCharter={LEGACY_DEFAULT_CHARTERS.withOrgInsurance} initialHasOrgInsurance={true} />)
    fireEvent.click(insuranceSwitch())
    expect(textarea().value).toBe(WITHOUT)
  })

  it("resets an old default to the current default", () => {
    render(<OrgCharterForm initialCharter={LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance} initialHasOrgInsurance={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser la convention par défaut" }))
    expect(textarea().value).toBe(WITHOUT)
  })

  // Regression: toggling replaced a customised text with the default, losing unsaved edits.
  it("keeps a customised text when toggled, and explains it next to the switch", async () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    render(<OrgCharterForm initialCharter={custom} initialHasOrgInsurance={true} />)
    expect(screen.queryByRole("button", { name: UPDATE })).toBeNull()
    const toggle = insuranceSwitch()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(textarea().value).toBe(custom)
    expect(toggle).toHaveAccessibleDescription(/Votre texte de convention est personnalisé : il n'a pas été modifié/)
    expect(screen.getByRole("button", { name: UPDATE })).toBeInTheDocument()
    expect(await screen.findByText("Votre texte personnalisé n'a pas été modifié.")).toBeInTheDocument()
  })

  it("shows what will change before replacing just the insurance paragraph", async () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    render(<OrgCharterForm initialCharter={custom} initialHasOrgInsurance={true} />)
    fireEvent.click(insuranceSwitch())
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
    fireEvent.click(insuranceSwitch())
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    expect(screen.getByRole("group")).toBeInTheDocument()
    textarea().focus()
    fireEvent.change(textarea(), { target: { value: `${custom} ` } })
    expect(screen.queryByRole("group")).toBeNull()
    expect(document.activeElement).toBe(textarea())
  })

  it("appends the paragraph to a customised text that has none, and Annuler changes nothing", () => {
    render(<OrgCharterForm initialCharter="Notre convention." initialHasOrgInsurance={false} />)
    fireEvent.click(insuranceSwitch())
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    let preview = screen.getByRole("group", { name: "Ce paragraphe sera ajouté à la fin du texte :" })
    fireEvent.click(within(preview).getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("group")).toBeNull()
    expect(textarea().value).toBe("Notre convention.")
    fireEvent.click(screen.getByRole("button", { name: UPDATE }))
    preview = screen.getByRole("group", { name: "Ce paragraphe sera ajouté à la fin du texte :" })
    fireEvent.click(within(preview).getByRole("button", { name: "Ajouter le paragraphe" }))
    expect(textarea().value).toBe(`Notre convention.\n\n${INSURANCE_CLAUSE_WITH_ORG_RC}`)
  })
})

// « Demander aux bénévoles d'accepter une convention » (#1468): off removes the controls instead of
// disabling them, keeps their state for the save, and says what the organisation loses.
describe("OrgCharterForm convention switch", () => {
  afterEach(cleanup)

  it("is a named switch on by default, and the heading is renamed", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    expect(screen.getByRole("heading", { name: "Convention des bénévoles" })).toBeInTheDocument()
    expect(conventionSwitch()).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("Ce texte est présenté aux bénévoles lors de l'inscription.")).toBeInTheDocument()
  })

  it("removes the dependent controls, keeps the focus on the switch and ties the warning to it", async () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} />)
    act(() => conventionSwitch().focus())
    fireEvent.click(conventionSwitch())

    const toggle = conventionSwitch()
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(toggle).toHaveFocus()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: "Réinitialiser la convention par défaut" })).toBeNull()
    expect(screen.queryByText("Ce texte est présenté aux bénévoles lors de l'inscription.")).toBeNull()
    expect(screen.queryByRole("switch", { name: "Assurance RC fournie par l'organisation" })).toBeNull()
    const warning = screen.getByText(/^Attention :/)
    expect(warning).toHaveClass("text-sm")
    expect(warning).not.toHaveClass("text-xs")
    expect(warning).toHaveClass("text-gray-700")
    expect(toggle).toHaveAccessibleDescription(/^Attention : les bénévoles s'inscriront sans accepter de convention/)
    expect(await screen.findByText("Convention désactivée. Enregistrez pour l'appliquer.")).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "true")
    expect(toggle).toHaveFocus()
    expect(await screen.findByText("Convention réactivée. Enregistrez pour l'appliquer.")).toBeInTheDocument()
  })

  it("keeps the text and the insurance choice in state, and restores them when back on", () => {
    render(<OrgCharterForm initialCharter="Notre convention." initialHasOrgInsurance={false} />)
    expect(insuranceSwitch()).toHaveAttribute("aria-checked", "false")
    fireEvent.click(conventionSwitch())
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(conventionSwitch())
    expect(textarea().value).toBe("Notre convention.")
    expect(insuranceSwitch()).toHaveAttribute("aria-checked", "false")
  })

  it("starts off when the organisation already asks for no convention, with the warning on load", () => {
    render(<OrgCharterForm initialCharter={null} initialHasOrgInsurance={true} initialVolunteerConventionEnabled={false} />)
    expect(conventionSwitch()).toHaveAttribute("aria-checked", "false")
    expect(conventionSwitch()).toHaveAccessibleDescription(/^Attention :/)
    expect(screen.getByText(/^Attention :/)).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
