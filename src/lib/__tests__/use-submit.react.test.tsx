/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { errorOf, GENERIC_ERROR, NETWORK_ERROR, useSubmit } from "../use-submit"
import FormStatus from "@/components/FormStatus"

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
})
