import { describe, it, expect } from "vitest"
import MiniSearch from "minisearch"
import * as route from "@/app/api/public/doc-index/route"
import { DOC_INDEX_OPTIONS, DOC_SEARCH_OPTIONS, docSearchDocuments, docSearchQuery, type DocSearchDocument } from "@/lib/doc-search-index"
import { loadDocUnits } from "@/lib/doc-units"

// GET /api/public/doc-index (#1319): the MiniSearch index of every unit, fetched by the filter
// only on first interaction, never with the page.
describe("GET /api/public/doc-index", () => {
  it("is built once and cached publicly, for an hour then a day while it revalidates", async () => {
    expect(route.dynamic).toBe("force-static")
    const response = await route.GET()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json")
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400")
  })

  it("returns the serialised index of every unit", async () => {
    const response = route.GET()
    expect(await response.text()).toBe(route.buildDocIndexJson())
    const parsed = JSON.parse(route.buildDocIndexJson()) as { documentCount: number }
    expect(parsed.documentCount).toBe(loadDocUnits().length)
  })

  it("loads with the shared options and finds a unit by a word of its body", () => {
    const index = MiniSearch.loadJSON<DocSearchDocument>(route.buildDocIndexJson(), DOC_INDEX_OPTIONS)
    const results = index.search(docSearchQuery("rappel")!, DOC_SEARCH_OPTIONS)
    expect(results[0]?.id).toBe("rappels")
  })

  it("indexes the same documents as the builders", () => {
    const parsed = JSON.parse(route.buildDocIndexJson()) as { documentIds: Record<string, string> }
    const slugs = Object.values(parsed.documentIds).sort()
    expect(slugs).toEqual(docSearchDocuments(loadDocUnits()).map((document) => document.slug).sort())
  })
})
