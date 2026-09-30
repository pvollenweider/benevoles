// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"
import { linkSourcesToRoutes, splitTitle } from "@/lib/doc-pages"

/**
 * A public content page's HTML from its Markdown source at the repo root (server only). The file's
 * own "# " title becomes the page's single <h1>; the remaining headings (##, ###...) keep their
 * depth. Links to other source files become site links. The Dockerfile copies every source into
 * the runtime image: `output: "standalone"` only traces files Next itself detects.
 */
export function renderPublicSource(source: string, fallbackTitle: string): { title: string; html: string } {
  const raw = fs.readFileSync(path.join(process.cwd(), source), "utf-8")
  const { title, body } = splitTitle(raw)
  return { title: title ?? fallbackTitle, html: renderEventPageMarkdown(linkSourcesToRoutes(body), { shiftHeadings: false }) }
}
