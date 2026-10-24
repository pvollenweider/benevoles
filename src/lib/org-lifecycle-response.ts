// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { contactEmail } from "./site"
import { ORG_UNAVAILABLE_CODE, ORG_UNAVAILABLE_ERROR, ORG_UNAVAILABLE_STATUS } from "./org-lifecycle"

/**
 * What a link of a deactivated or suspended organisation answers (src/lib/org-lifecycle.ts): a
 * refusal without any of the link's data, never cached. Not counted as a failed token lookup: the
 * link exists, its organisation is closed. With the instance's contact address, for the page.
 */
export function orgUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: ORG_UNAVAILABLE_ERROR, code: ORG_UNAVAILABLE_CODE, contact: contactEmail() },
    { status: ORG_UNAVAILABLE_STATUS, headers: { "Cache-Control": "private, no-store" } },
  )
}
