import type { Page } from "@playwright/test"

/**
 * Simulates the browser's automatic page translation (Google Translate in Chrome), for the specs
 * of public pages that must keep working once translated.
 *
 * The translator replaces each text node it translates with `<font><font>translation</font></font>`:
 * the original text node leaves the document, while React still holds it. It keeps watching the
 * page and translates the text React adds later, asynchronously. React then calls removeChild or
 * insertBefore with a text node that is no longer a child of its parent, which throws
 * `NotFoundError` and takes the page down (Sentry BENEVOLAPP-Z).
 *
 * `translatePage` translates what is on screen now and keeps translating what comes later, until
 * the page is closed. Content marked `translate="no"` is left alone, as the translator does.
 */
export async function translatePage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __fakeTranslator?: boolean }
    if (w.__fakeTranslator) return
    w.__fakeTranslator = true

    const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TITLE", "svg", "FONT"])
    const skipped = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) {
        if (SKIP.has(e.tagName) || e.getAttribute("translate") === "no") return true
      }
      return false
    }
    const translateNode = (text: Text) => {
      const parent = text.parentNode
      if (!parent || !text.nodeValue?.trim() || skipped(text.parentElement)) return
      const outer = document.createElement("font")
      outer.style.verticalAlign = "inherit"
      const inner = document.createElement("font")
      inner.style.verticalAlign = "inherit"
      // A visible change, so a spec can tell translated text apart; same words, other case.
      inner.textContent = text.nodeValue.toUpperCase()
      outer.appendChild(inner)
      parent.replaceChild(outer, text)
    }
    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return translateNode(root as Text)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const texts: Text[] = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
      texts.forEach(translateNode)
    }
    translateTree(document.body)
    // Later text, translated a moment after it appears, as the real translator does.
    let queued: Node[] = []
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData" && r.target.isConnected) queued.push(r.target)
        r.addedNodes.forEach((n) => queued.push(n))
      }
      setTimeout(() => {
        const nodes = queued
        queued = []
        nodes.filter((n) => n.isConnected).forEach(translateTree)
      }, 0)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}
