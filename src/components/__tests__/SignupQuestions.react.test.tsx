/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import SignupQuestions from "../public/SignupQuestions"

// Custom questions on the sign-up form (#483).
const questions = [
  { id: "size", label: "Taille", type: "single", options: ["S", "M"], required: true },
  { id: "licence", label: "Permis", type: "yesno", options: [], required: false },
  { id: "diet", label: "Régime", type: "multiple", options: ["Végétarien", "Sans gluten"], required: false },
  { id: "note", label: "Expérience", type: "text", options: [], required: false },
]

describe("SignupQuestions", () => {
  afterEach(cleanup)

  it("renders labelled fields and choice groups, and reports answers", () => {
    const onChange = vi.fn()
    render(<SignupQuestions questions={questions} answers={{ diet: ["Végétarien"] }} onChange={onChange} errors={new Map()} />)
    expect(screen.getByRole("group", { name: /Taille.*obligatoire/ })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("M"))
    expect(onChange).toHaveBeenCalledWith("size", "M")
    fireEvent.click(screen.getByLabelText("Sans gluten"))
    expect(onChange).toHaveBeenCalledWith("diet", ["Végétarien", "Sans gluten"])
    fireEvent.change(screen.getByLabelText(/Expérience/), { target: { value: "Oui" } })
    expect(onChange).toHaveBeenCalledWith("note", "Oui")
    expect(screen.getByRole("group", { name: "Permis (facultatif)" })).toBeInTheDocument()
  })

  it("ties a refused question to the error message", () => {
    render(<SignupQuestions questions={questions} answers={{}} onChange={() => {}} errors={new Map([["size", "« Taille » est obligatoire."]])} />)
    // On each input of the group (aria-invalid isn't conveyed on a fieldset), with its own message.
    for (const radio of [screen.getByLabelText("S"), screen.getByLabelText("M")]) {
      expect(radio).toHaveAttribute("aria-invalid", "true")
      expect(radio).toHaveAccessibleDescription("« Taille » est obligatoire.")
      expect(radio).toBeRequired()
    }
  })
})
