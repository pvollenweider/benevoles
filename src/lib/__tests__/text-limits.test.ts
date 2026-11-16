import { describe, it, expect } from "vitest"
import { z } from "zod"
import { MARKDOWN_TEXT_MAX, TOO_LONG_MESSAGE, tooLongMessage } from "../text-limits"
import { cappedText } from "../text-limits-schema"
import { validationError } from "../api-error"

describe("text limits", () => {
  it("writes the cap in French, with a thousands separator", () => {
    expect(tooLongMessage("La description", MARKDOWN_TEXT_MAX)).toBe("La description : 20 000 caractères au maximum.")
    expect(tooLongMessage("Le titre", 200)).toBe("Le titre : 200 caractères au maximum.")
    expect(TOO_LONG_MESSAGE.test(tooLongMessage("Le lieu", 500))).toBe(true)
  })

  it("cappedText accepts the cap and refuses one more character", () => {
    expect(cappedText(5, "Le nom").safeParse("abcde").success).toBe(true)
    expect(cappedText(5, "Le nom").safeParse("abcdef").success).toBe(false)
  })

  it("validationError shows the cap message whatever the route's mode", async () => {
    const schema = z.object({ a: z.string().min(1), b: cappedText(3, "Le champ B") })
    const error = schema.safeParse({ a: "", b: "abcd" }).error!
    for (const opts of [{}, { useIssueMessage: true }]) {
      const res = validationError(error, opts)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Le champ B : 3 caractères au maximum.")
    }
  })

  it("validationError keeps the field list for other failures", async () => {
    const error = z.object({ a: z.string().min(1), b: z.string().max(2) }).safeParse({ a: "", b: "abc" }).error!
    expect(((await validationError(error).json()) as { error: string }).error).toBe("Données invalides (a, b).")
  })
})
