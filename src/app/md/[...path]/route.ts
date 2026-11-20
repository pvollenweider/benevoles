// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { llmsSources, markdownResponse } from "@/lib/llms-sources"
import { htmlPathForMarkdown, markdownForPath } from "@/lib/markdown-pages"
import { absoluteUrl } from "@/lib/seo-metadata"

/**
 * The Markdown variant of a public page, at its HTML address followed by `.md` (llmstxt.org). The
 * proxy rewrites `/x.md` here (src/proxy.ts, src/lib/markdown-request.ts) on the apex site only;
 * the route checks the host again (llmsSources) and answers 404 for anything without a variant.
 * The internal `/md` prefix is never a page address of its own: a direct `/md/x.md` is rewritten
 * to `/md/md/x.md`, which matches no page.
 */
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ path: string[] }> }

export async function GET(_request: Request, { params }: Props) {
  const { path } = await params
  const htmlPath = htmlPathForMarkdown(`/${path.join("/")}`)
  const sources = htmlPath === null ? null : await llmsSources(true)
  const markdown = htmlPath !== null && sources !== null ? markdownForPath(htmlPath, sources) : null
  if (htmlPath === null || sources === null || markdown === null) return new Response("Not found", { status: 404 })
  return markdownResponse(markdown, {
    "Content-Type": "text/markdown; charset=utf-8",
    Link: `<${absoluteUrl(sources.base, htmlPath)}>; rel="canonical"`,
    "X-Content-Type-Options": "nosniff",
  })
}
