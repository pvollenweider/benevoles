import { describe, it, expect, vi } from "vitest"

const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({ captureException }))

import { reportError } from "../report-error"

describe("reportError", () => {
  it("logs and reports the error to Sentry, tagged with its context, without rethrowing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const err = new Error("smtp down")

    await expect(Promise.reject(err).catch(reportError("waitlist.promote"))).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith("[waitlist.promote]", err)
    expect(captureException).toHaveBeenCalledWith(err, { tags: { context: "waitlist.promote" } })
    consoleError.mockRestore()
  })
})
