/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { errorOf, GENERIC_ERROR, NETWORK_ERROR, useSubmit } from "../use-submit"
import FormStatus from "@/components/FormStatus"

const FIELD_MESSAGE = "Indiquez le nom (2 caractères au moins)."
const GENERAL_MESSAGE = "La demande n'a pas pu être envoyée."

/** A form following the pattern of the project: useSubmit, FormStatus, one described field. */
function Harness({ mode }: { mode?: "no-element" }) {
  const { error, fail, isInvalid, quiet } = useSubmit()
  const [value, setValue] = useState("")
  const ref = useRef<HTMLInputElement>(null)
  return (
    <form onSubmit={(e) => { e.preventDefault(); fail(FIELD_MESSAGE, "name", mode === "no-element" ? null : ref.current) }}>
      <label htmlFor="name">Nom</label>
      <input id="name" ref={ref} value={value} onChange={(e) => setValue(e.target.value)}
        aria-invalid={isInvalid("name")} aria-describedby={isInvalid("name") ? "form-error" : undefined} />
      <button type="submit">Envoyer</button>
      <button type="button" onClick={() => fail(GENERAL_MESSAGE)}>Action</button>
      <FormStatus error={error} errorId="form-error" quiet={quiet} />
    </form>
  )
}

// The shared submit logic of admin forms (#380).
describe("useSubmit", () => {
  afterEach(cleanup)

  it("runs one request at a time and returns the parsed data", async () => {
    const { result } = renderHook(() => useSubmit())
    let resolve!: (r: Response) => void
    const request = vi.fn(() => new Promise<Response>((r) => { resolve = r }))
    let first!: Promise<unknown>
    act(() => { first = result.current.submit(request) })
    expect(result.current.busy).toBe(true)
    const second = await act(() => result.current.submit(request))
    expect(second).toEqual({ ok: false, error: "", status: null })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 })); await first })
    expect(await first).toEqual({ ok: true, data: { id: 1 }, status: 201 })
    expect(result.current.busy).toBe(false)
  })

  it("turns a failed response into its French sentence, and a thrown fetch into the network one", async () => {
    const { result } = renderHook(() => useSubmit())
    const refused = await act(() => result.current.submit(() => Promise.resolve(new Response(JSON.stringify({ error: "Déjà administrateur." }), { status: 409 }))))
    expect(refused).toEqual({ ok: false, error: "Déjà administrateur.", status: 409 })
    expect(result.current.error).toBe("Déjà administrateur.")
    const down = await act(() => result.current.submit(() => Promise.reject(new Error("offline"))))
    expect(down).toEqual({ ok: false, error: NETWORK_ERROR, status: null })
    expect(result.current.error).toBe(NETWORK_ERROR)
    const silent = await act(() => result.current.submit(() => Promise.resolve(new Response("nope", { status: 500 })), { silent: true }))
    expect(silent).toMatchObject({ ok: false, error: GENERIC_ERROR, status: 500 })
    expect(result.current.error).toBeNull() // a silent call clears the previous error and shows nothing itself
  })

  it("errorOf reads { error } with a fallback", async () => {
    expect(await errorOf(new Response(JSON.stringify({ error: " " }), { status: 400 }), "Champ invalide.")).toBe("Champ invalide.")
    expect(await errorOf(new Response("<html>", { status: 502 }))).toBe(GENERIC_ERROR)
  })

  it("FormStatus keeps both regions mounted and shows the one with text", () => {
    const { rerender } = render(<FormStatus status="" error={null} errorId="e" />)
    expect(screen.getByRole("status")).toHaveClass("sr-only")
    expect(screen.getByRole("alert")).toHaveClass("sr-only")
    rerender(<FormStatus status="Enregistré." error={null} errorId="e" />)
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré.")
    rerender(<FormStatus status="" error="Raté." errorId="e" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Raté.")
    expect(screen.getByRole("alert")).toHaveAttribute("id", "e")
  })

  it("FormStatus keeps a quiet field error out of the alert, with the id on the visible paragraph", () => {
    render(<FormStatus error={FIELD_MESSAGE} errorId="e" quiet />)
    expect(screen.getByRole("alert")).toBeEmptyDOMElement()
    expect(screen.getByRole("alert")).not.toHaveAttribute("id")
    const paragraph = screen.getByText(FIELD_MESSAGE)
    expect(paragraph).toBeVisible()
    expect(paragraph).toHaveAttribute("id", "e")
    expect(paragraph).not.toHaveAttribute("role")
  })

  describe("a field error is spoken once (#739, step 4)", () => {
    // (a) The field takes the focus: its description says the error, the alert stays empty.
    it("leaves the alert empty when the field takes focus", () => {
      render(<Harness />)
      fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))

      const input = screen.getByRole("textbox", { name: "Nom" })
      expect(input).toHaveFocus()
      expect(input).toHaveAttribute("aria-invalid", "true")
      expect(input).toHaveAccessibleDescription(FIELD_MESSAGE)
      expect(screen.getByRole("alert")).toBeEmptyDOMElement()
      expect(screen.getByText(FIELD_MESSAGE)).toBeVisible()
    })

    // (b) The field already had the focus: re-focusing would say nothing, so the alert says it.
    it("uses the alert when the field already had the focus", () => {
      render(<Harness />)
      const input = screen.getByRole("textbox", { name: "Nom" })
      input.focus()
      fireEvent.submit(input.closest("form")!)

      expect(screen.getByRole("alert")).toHaveTextContent(FIELD_MESSAGE)
      expect(input).toHaveFocus()
      expect(input).toHaveAccessibleDescription(FIELD_MESSAGE)
    })

    // (c) A general error: the alert says it and the focus does not move.
    it("uses the alert for a general error, without moving the focus", () => {
      render(<Harness />)
      const action = screen.getByRole("button", { name: "Action" })
      action.focus()
      fireEvent.click(action)

      expect(screen.getByRole("alert")).toHaveTextContent(GENERAL_MESSAGE)
      expect(action).toHaveFocus()
      expect(document.querySelector("[aria-invalid]")).toBeNull()
    })

    // (d) A field with no element to focus: the alert says it, the field stays described.
    it("uses the alert when the field has no element to focus", () => {
      render(<Harness mode="no-element" />)
      fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))

      const input = screen.getByRole("textbox", { name: "Nom" })
      expect(screen.getByRole("alert")).toHaveTextContent(FIELD_MESSAGE)
      expect(input).toHaveAttribute("aria-invalid", "true")
      expect(input).toHaveAccessibleDescription(FIELD_MESSAGE)
    })
  })
})
