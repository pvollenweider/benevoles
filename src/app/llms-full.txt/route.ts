// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { llmsFullTxt } from "@/lib/llms-txt"
import { llmsSources, markdownResponse } from "@/lib/llms-sources"

// /llms-full.txt: every public page /llms.txt lists, then the documentation units, as one Markdown
// document (src/lib/llms-txt.ts), linked from /llms.txt.
export const dynamic = "force-dynamic"

export async function GET() {
  const sources = await llmsSources(true)
  return sources ? markdownResponse(llmsFullTxt(sources)) : new Response("Not found", { status: 404 })
}
