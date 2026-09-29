import { describe, it, expect } from "vitest"
import { z } from "zod"
import { invalidFieldsMessage, validationError } from "../api-error"

const schema = z.object({ email: z.string().email(), phone: z.string().min(3), nested: z.object({ a: z.number() }) })
const error = schema.safeParse({ email: "x", phone: "1", nested: { a: "no" } }).error!

describe("API error format (#320)", () => {
  it("names the invalid fields in French", () => {
    expect(invalidFieldsMessage(error)).toBe("Données invalides (email, phone, nested.a).")
  })

  it("validationError: 400 with a string `error` and field details", async () => {
    const res = validationError(error)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe("string")
    expect(body.details.fieldErrors).toHaveProperty("email")
  })

  it("can surface the schema's own (French) message instead", async () => {
    const custom = z.object({ t: z.string().regex(/^\d\d:\d\d$/, "Heure invalide (HH:MM).") }).safeParse({ t: "x" }).error!
    expect((await validationError(custom, { useIssueMessage: true }).json()).error).toBe("Heure invalide (HH:MM).")
  })
})
