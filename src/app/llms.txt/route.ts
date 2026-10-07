// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { llmsTxt } from "@/lib/llms-txt"
import { llmsSources, markdownResponse } from "@/lib/llms-sources"

// /llms.txt (llmstxt.org): the apex site for AI assistants, generated from the pages' own sources
// (src/lib/llms-txt.ts). Per request: the links carry the deployment's base URL. A path with a dot
// is never an event slug, so the route can't shadow an event.
export const dynamic = "force-dynamic"

export async function GET() {
  const sources = await llmsSources()
  return sources ? markdownResponse(llmsTxt(sources)) : new Response("Not found", { status: 404 })
}
