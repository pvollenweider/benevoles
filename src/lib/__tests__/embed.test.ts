import { describe, it, expect } from "vitest"
import {
  EMBED_DEFAULT_HEIGHT,
  EMBED_HEIGHT_MESSAGE,
  EMBED_MAX_HEIGHT,
  EMBED_MIN_BAND,
  visibleBand,
  embedFlowParams,
  embedFrameId,
  embedFrameTitle,
  embedHeightMessage,
  embedSnippet,
  embedUrl,
  isEmbedMode,
  readEmbedHeight,
} from "../embed"

// The sign-up embedded on the association's site (#948): mode detection, addresses, the snippet.

describe("isEmbedMode", () => {
  it("is on for embed=1 only", () => {
    expect(isEmbedMode("1")).toBe(true)
    expect(isEmbedMode(["1", "0"])).toBe(true)
    for (const raw of [undefined, null, "", "0", "true", "yes", " 1", ["0", "1"]]) expect(isEmbedMode(raw), String(raw)).toBe(false)
  })
})

describe("embedUrl", () => {
  it("adds embed=1 to the public address", () => {
    expect(embedUrl("https://club.benevol.app/fete")).toBe("https://club.benevol.app/fete?embed=1")
  })
  it("keeps ?org= of a local address and adds a group link's code", () => {
    const url = new URL(embedUrl("http://localhost:3000/fete?org=club", "abcd2345"))
    expect(url.pathname).toBe("/fete")
    expect(url.searchParams.get("org")).toBe("club")
    expect(url.searchParams.get("groupe")).toBe("abcd2345")
    expect(url.searchParams.get("embed")).toBe("1")
  })
})

describe("embedFlowParams", () => {
  it("carries the group, the organisation and embed=1, nothing else", () => {
    const kept = embedFlowParams(new URLSearchParams("org=club&groupe=abcd2345&embed=1&token=secret&creneau=x"))
    expect(Object.fromEntries(kept)).toEqual({ org: "club", groupe: "abcd2345", embed: "1" })
  })
  it("always says embed=1", () => {
    expect(embedFlowParams(new URLSearchParams()).toString()).toBe("embed=1")
  })
})

describe("height messages", () => {
  it("posts a namespaced type and a rounded-up height, nothing else", () => {
    expect(embedHeightMessage(812.2)).toEqual({ type: EMBED_HEIGHT_MESSAGE, height: 813 })
    expect(EMBED_HEIGHT_MESSAGE).toBe("benevol:embed-height")
  })
  it("reads back our message only, within bounds", () => {
    expect(readEmbedHeight({ type: EMBED_HEIGHT_MESSAGE, height: 640.4 })).toBe(641)
    expect(readEmbedHeight({ type: "other", height: 640 })).toBeNull()
    expect(readEmbedHeight({ type: EMBED_HEIGHT_MESSAGE, height: "640" })).toBeNull()
    expect(readEmbedHeight({ type: EMBED_HEIGHT_MESSAGE, height: Number.NaN })).toBeNull()
    expect(readEmbedHeight({ type: EMBED_HEIGHT_MESSAGE, height: 10 })).toBeNull()
    expect(readEmbedHeight({ type: EMBED_HEIGHT_MESSAGE, height: EMBED_MAX_HEIGHT + 1 })).toBeNull()
    expect(readEmbedHeight(null)).toBeNull()
    expect(readEmbedHeight("benevol:embed-height")).toBeNull()
  })
})

describe("visibleBand", () => {
  it("is the visible part of the frame, rounded", () => {
    expect(visibleBand({ top: 1200.4, height: 700.2 }, 3000)).toEqual({ top: 1200, height: 700 })
  })
  it("grows a thin visible part so that a dialog fits, inside the frame", () => {
    expect(visibleBand({ top: 2900, height: 100 }, 3000)).toEqual({ top: 3000 - EMBED_MIN_BAND, height: EMBED_MIN_BAND })
    expect(visibleBand({ top: 0, height: 50 }, 3000)).toEqual({ top: 0, height: EMBED_MIN_BAND })
  })
  it("never asks for more than a small frame", () => {
    expect(visibleBand({ top: 0, height: 100 }, 250)).toEqual({ top: 0, height: 250 })
  })
  it("is the whole frame when nothing of it is on screen", () => {
    expect(visibleBand({ top: 0, height: 0 }, 900)).toEqual({ top: 0, height: 900 })
  })
})

describe("embedFrameId", () => {
  it("is a valid id from the slug and the group code", () => {
    expect(embedFrameId("fete-du-village")).toBe("benevol-fete-du-village")
    expect(embedFrameId("fete", "abcd2345")).toBe("benevol-fete-abcd2345")
    expect(embedFrameId("Fête été!")).toBe("benevol-f-te-t")
  })
})

describe("embedSnippet", () => {
  const base = { url: "https://club.benevol.app/fete?embed=1", eventTitle: "Fête du village", frameId: "benevol-fete" }

  it("is an iframe with a fixed height by default, full width, lazy, named for screen readers", () => {
    const html = embedSnippet(base)
    expect(html).toBe(
      `<iframe id="benevol-fete" src="https://club.benevol.app/fete?embed=1" title="Inscription bénévoles – Fête du village" ` +
      `width="100%" height="${EMBED_DEFAULT_HEIGHT}" loading="lazy" style="border:0;width:100%;max-width:100%"></iframe>`,
    )
    expect(html).not.toContain("<script")
  })

  it("escapes the title and the address in their attributes", () => {
    const html = embedSnippet({ ...base, eventTitle: `Fête "spéciale" <b> & co`, url: "https://x.test/a?embed=1&groupe=abcd2345" })
    expect(html).toContain(`title="${embedFrameTitle("Fête &quot;spéciale&quot; &lt;b&gt; &amp; co")}"`)
    expect(html).toContain(`src="https://x.test/a?embed=1&amp;groupe=abcd2345"`)
  })

  it("adds an inline listener, no third-party script, with the auto-resize", () => {
    const html = embedSnippet({ ...base, autoResize: true })
    expect(html).toMatch(/^<iframe [^>]+><\/iframe>\n<script>\n/)
    expect(html).not.toMatch(/<script[^>]*src=/)
    expect(html).toContain(EMBED_HEIGHT_MESSAGE)
  })

  // Runs the snippet's script against a fake page: it only listens to its own iframe and our type.
  function runListener(frameId: string) {
    const html = embedSnippet({ ...base, frameId, autoResize: true })
    const script = html.slice(html.indexOf("<script>") + "<script>".length, html.indexOf("</script>"))
    const contentWindow = {}
    const frame = { contentWindow, style: { height: "" } }
    let listener: ((e: { source: unknown; data: unknown }) => void) | null = null
    const fakeWindow = { addEventListener: (type: string, fn: typeof listener) => { if (type === "message") listener = fn } }
    const fakeDocument = { getElementById: (id: string) => (id === frameId ? frame : null) }
    new Function("window", "document", script)(fakeWindow, fakeDocument)
    return { frame, contentWindow, send: (source: unknown, data: unknown) => listener!({ source, data }) }
  }

  it("resizes its iframe from its own messages only", () => {
    const { frame, contentWindow, send } = runListener("benevol-fete")
    send({}, { type: EMBED_HEIGHT_MESSAGE, height: 700 })
    expect(frame.style.height).toBe("")
    send(contentWindow, { type: "something-else", height: 700 })
    expect(frame.style.height).toBe("")
    send(contentWindow, { type: EMBED_HEIGHT_MESSAGE, height: 99_999 })
    expect(frame.style.height).toBe("")
    send(contentWindow, { type: EMBED_HEIGHT_MESSAGE, height: 712.3 })
    expect(frame.style.height).toBe("713px")
  })
})
