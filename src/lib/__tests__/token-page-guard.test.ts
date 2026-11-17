import { describe, it, expect, vi } from "vitest"
import { memoryStore } from "@/lib/rate-limit"
import { TOKEN_MISS_LIMIT } from "@/lib/token-rate-limit"
import { guardTokenLookup } from "@/lib/token-page-guard"

// The failed-lookup accounting of the pages a personal link opens (src/lib/token-page-guard.ts).

const client = (ip: string) => ({ headers: new Headers({ "x-forwarded-for": ip }) })
const unknown = (value: string | null) => value === null

describe("guardTokenLookup", () => {
  it("looks the link up and counts nothing for a valid link", async () => {
    const using = memoryStore()
    const lookup = vi.fn().mockResolvedValue("reg")
    for (let i = 0; i < TOKEN_MISS_LIMIT + 5; i++) {
      expect(await guardTokenLookup(client("10.1.0.1"), lookup, unknown, { using })).toEqual({ blocked: false, value: "reg" })
    }
    expect(lookup).toHaveBeenCalledTimes(TOKEN_MISS_LIMIT + 5)
  })

  it("counts one miss per call for an unknown link, then blocks before any lookup", async () => {
    const using = memoryStore()
    const lookup = vi.fn().mockResolvedValue(null)
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) {
      expect(await guardTokenLookup(client("10.1.0.2"), lookup, unknown, { using })).toEqual({ blocked: false, value: null })
    }
    expect(lookup).toHaveBeenCalledTimes(TOKEN_MISS_LIMIT)

    const valid = vi.fn().mockResolvedValue("reg")
    expect(await guardTokenLookup(client("10.1.0.2"), valid, unknown, { using })).toEqual({ blocked: true })
    expect(valid).not.toHaveBeenCalled()
  })

  it("does not block another connection", async () => {
    const using = memoryStore()
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) await guardTokenLookup(client("10.1.0.3"), async () => null, unknown, { using })
    expect(await guardTokenLookup(client("10.1.0.4"), async () => "reg", unknown, { using })).toEqual({ blocked: false, value: "reg" })
  })

  it("counts in the family it is given, apart from the others", async () => {
    const using = memoryStore()
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) await guardTokenLookup(client("10.1.0.5"), async () => null, unknown, { using, family: "calendar" })
    expect(await guardTokenLookup(client("10.1.0.5"), async () => "reg", unknown, { using })).toEqual({ blocked: false, value: "reg" })
    expect(await guardTokenLookup(client("10.1.0.5"), async () => "reg", unknown, { using, family: "calendar" })).toEqual({ blocked: true })
  })

  it("refuses when the counter cannot be read (fail closed)", async () => {
    const broken = { ...memoryStore(), peek: async () => { throw new Error("down") } }
    const lookup = vi.fn().mockResolvedValue("reg")
    expect(await guardTokenLookup(client("10.1.0.6"), lookup, unknown, { using: broken })).toEqual({ blocked: true })
    expect(lookup).not.toHaveBeenCalled()
  })
})
