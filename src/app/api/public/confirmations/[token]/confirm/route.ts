// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { confirmSignupConfirmation } from "@/lib/signup-confirmation-server"

/**
 * The « Confirmer mon inscription » button of the email (#1253). POST only: the email's link opens
 * a read-only page (/confirmation/[token]) whose button sends this request, so a mail scanner that
 * follows the link, or runs its scripts, confirms nothing. Idempotent: a repeated click returns the
 * result recorded by the first one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "signup-email-confirm", 20, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de requêtes. Réessaie dans un moment." }, { status: 429 })

  const { token } = await params
  if (!token) return NextResponse.json({ error: "Lien invalide ou expiré.", code: "invalid" }, { status: 404 })

  const result = await confirmSignupConfirmation(token)
  if (result.ok) {
    return NextResponse.json({ ok: true, already: result.already, counts: result.counts })
  }
  if (result.reason === "unavailable") return orgUnavailableResponse()
  if (result.reason === "reserved_answer") {
    return NextResponse.json({ error: "Ce poste est réservé aux personnes qui ont répondu à une question de l'inscription. Modifie ta réponse ou choisis un autre créneau, puis refais une demande.", code: "reserved_answer" }, { status: 409 })
  }
  const message = result.reason === "invalid"
    ? "Ce lien n'est pas valable. Refais une demande depuis la page de l'événement."
    : result.reason === "expired"
      ? "Ce lien a expiré. Refais une demande depuis la page de l'événement."
      : result.reason === "replaced"
        ? "Une nouvelle demande a remplacé celle-ci. Ouvre le dernier email reçu."
        : result.reason === "cancelled"
          ? "Cette demande a été annulée. Refais une demande depuis la page de l'événement."
          : "Les places de cette demande ne sont plus disponibles. Refais une demande depuis la page de l'événement."
  return NextResponse.json({ error: message, code: result.reason === "invalid" ? "invalid" : result.reason }, { status: result.reason === "invalid" ? 404 : 410 })
}
