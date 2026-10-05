// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { rateLimit } from "@/lib/rate-limit"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { render } from "@/lib/notifications/templates"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import type { NotificationPayload } from "@/lib/notifications/types"
import type { OpenShiftsEmailData } from "@/lib/notifications/templates/open-shifts"
import { adminActor, logEvent } from "@/lib/event-log"
import { eventPublicUrl } from "@/lib/urls"
import { acceptsRegistrations } from "@/lib/registration-window"
import { MESSAGE_RATE_LIMIT } from "@/lib/targeted-message"
import { loadOpenShiftsContext } from "@/lib/open-shifts-data"
import {
  findCandidates, openShiftsHistory, selectedRecipients, shiftName,
  OPEN_SHIFTS_MAX_RECIPIENTS, OPEN_SHIFTS_MAX_SHIFTS, OPEN_SHIFTS_NOTE_MAX,
} from "@/lib/open-shifts"

const bodySchema = z.object({
  shiftIds: z.array(z.string().min(1)).min(1, "Choisissez au moins un créneau.").max(OPEN_SHIFTS_MAX_SHIFTS),
  volunteerIds: z.array(z.string().min(1)).min(1, "Cochez au moins une personne.").max(OPEN_SHIFTS_MAX_RECIPIENTS, `${OPEN_SHIFTS_MAX_RECIPIENTS} personnes au plus par envoi.`),
  note: z.string().trim().max(OPEN_SHIFTS_NOTE_MAX).optional(),
  /** Members who answered « pas disponible » (#558) were shown on request. */
  includeDeclined: z.boolean().optional(),
  /** Preview only, nothing sent or created. */
  dryRun: z.boolean().optional(),
})

const linkWithToken = (base: string, token: string, extra?: Record<string, string>) => {
  const url = new URL(base)
  url.searchParams.set("token", token)
  for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v)
  return url.toString()
}

/**
 * POST /api/admin/events/[id]/open-shifts (#566): the underfilled shifts the organizer picked, to
 * the members they ticked by hand. The members are recomputed here with the same rules as the page
 * (inactive, without email, declined, already on the shifts, overlaps, reserved roles); someone who
 * can't be written to any more is skipped, never added. One email per person through the outbox,
 * with their invitation link (created when missing, one per member and event) or the event page,
 * recorded in the history like a targeted message and rate-limited with them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { shiftIds, volunteerIds, note, includeDeclined, dryRun } = parsed.data

  const ctx = await loadOpenShiftsContext(db, id)
  if (!ctx) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })
  const { event } = ctx

  if (!acceptsRegistrations(event)) {
    return NextResponse.json({ error: "Les inscriptions ne sont pas ouvertes pour cet événement : les personnes contactées ne pourraient pas s'inscrire. Ouvrez-les avant d'écrire." }, { status: 409 })
  }

  // Still underfilled now: a shift filled since the page was opened is no longer proposed.
  const wanted = new Set(shiftIds)
  const shifts = ctx.openShifts.filter((s) => wanted.has(s.id))
  const noLongerOpen = shiftIds.length - shifts.length
  if (shifts.length === 0) {
    return NextResponse.json({ error: "Ces créneaux sont complets ou fermés depuis l'ouverture de la page. Rechargez-la." }, { status: 409 })
  }

  const { candidates } = findCandidates({
    shifts, eventShifts: ctx.eventShifts, members: ctx.members, registrations: ctx.registrations, invites: ctx.invites, includeDeclined,
  })
  const recipients = selectedRecipients(candidates, volunteerIds)
  const skipped = new Set(volunteerIds).size - recipients.length
  if (recipients.length === 0) return NextResponse.json({ error: "Aucune des personnes cochées ne peut recevoir ces créneaux." }, { status: 400 })

  const publicUrl = eventPublicUrl(event.organization.slug, event.slug)
  const history = openShiftsHistory(shifts, note)
  const byId = new Map(shifts.map((s) => [s.id, s]))

  type Target = { volunteerId: string; firstName: string; email: string; offer: typeof shifts; link: "invitation" | "new_invitation" | "event" }
  const targets: Target[] = recipients.map((c) => ({
    volunteerId: c.member.id,
    firstName: c.member.firstName,
    email: ctx.emails.get(c.member.id) ?? "",
    offer: c.offer.map((sid) => byId.get(sid)!),
    link: c.link,
  }))

  const payloadFor = (t: Target, batchId: string, links: { signupUrl: string; declineUrl?: string; editToken?: string }): NotificationPayload => ({
    kind: "open_shifts",
    dedupeKey: `open-shifts:${batchId}:${t.volunteerId}`,
    recipient: { email: t.email, name: t.firstName },
    volunteerId: t.volunteerId,
    organizationId: event.organizationId,
    data: {
      volunteerName: t.firstName,
      organizationName: event.organization.name,
      eventTitle: event.title,
      note: note || null,
      shifts: t.offer,
      orgSlug: event.organization.slug,
      ...links,
    } satisfies OpenShiftsEmailData,
  })

  if (dryRun) {
    const first = targets[0]
    const sample = first.link === "event"
      ? { signupUrl: publicUrl, editToken: "apercu" }
      : { signupUrl: linkWithToken(publicUrl, "apercu"), declineUrl: linkWithToken(publicUrl, "apercu", { decline: "1" }) }
    const preview = render(payloadFor(first, "preview", sample))
    return NextResponse.json({
      recipients: targets.length,
      skipped,
      noLongerOpen,
      newInvitations: targets.filter((t) => t.link === "new_invitation").length,
      audience: history.audienceLabel,
      previewName: first.firstName,
      preview: { subject: preview.subject, html: preview.html },
    })
  }

  // Shared with the targeted messages (#396): one budget per organization and hour.
  const rl = await rateLimit(`org:${organizationId}`, "targeted-message", MESSAGE_RATE_LIMIT, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de messages envoyés cette heure. Réessayez plus tard." }, { status: 429 })

  // Personal page of members already registered without an invitation.
  const editTokens = new Map<string, string>()
  const registeredIds = targets.filter((t) => t.link === "event").map((t) => t.volunteerId)
  if (registeredIds.length > 0) {
    const regs = await db.registration.findMany({
      where: { eventId: id, volunteerId: { in: registeredIds }, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { volunteerId: true, ...registrationToken.select },
    })
    for (const r of regs) if (!editTokens.has(r.volunteerId)) editTokens.set(r.volunteerId, registrationToken.reveal(r))
  }

  const batchId = crypto.randomUUID()
  const createdInvites: { id: string; volunteerId: string }[] = []
  // The invitations, the history row (#467) and the emails commit together.
  const outboxIds = await db.$transaction(async (tx) => {
    const toInvite = targets.filter((t) => t.link === "new_invitation").map((t) => t.volunteerId)
    if (toInvite.length > 0) {
      // Clear tokens never stored (#290); skipDuplicates: an invitation created meanwhile is kept.
      const created = await tx.memberInvite.createManyAndReturn({
        data: toInvite.map((volunteerId) => ({ eventId: id, volunteerId, ...linkToken.data(randomBytes(24).toString("hex")) })),
        skipDuplicates: true,
        select: { id: true, volunteerId: true },
      })
      createdInvites.push(...created)
    }
    const inviteIds = targets.filter((t) => t.link !== "event").map((t) => t.volunteerId)
    const invites = inviteIds.length > 0
      ? await tx.memberInvite.findMany({ where: { eventId: id, volunteerId: { in: inviteIds } }, select: { volunteerId: true, ...linkToken.select } })
      : []
    const inviteTokens = new Map(invites.map((i) => [i.volunteerId, linkToken.reveal(i)]))

    const row = await tx.targetedMessage.create({
      data: {
        organizationId,
        eventId: id,
        authorId: guard.session.user?.id ?? null,
        authorName: guard.session.user?.name || guard.session.user?.email || "Administrateur",
        subject: history.subject,
        message: history.message,
        audienceLabel: history.audienceLabel,
        recipientCount: targets.length,
      },
      select: { id: true },
    })
    const payloads = targets.map((t) => {
      const token = inviteTokens.get(t.volunteerId)
      const links = t.link === "event" || !token
        ? { signupUrl: publicUrl, editToken: editTokens.get(t.volunteerId) }
        : { signupUrl: linkWithToken(publicUrl, token), declineUrl: linkWithToken(publicUrl, token, { decline: "1" }) }
      return payloadFor(t, batchId, links)
    })
    return enqueueNotifications(payloads, tx, { organizationId, targetedMessageId: row.id })
  })
  deliverAfterResponse(outboxIds)

  for (const invite of createdInvites) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "memberinvite.sent", entityType: "MemberInvite", entityId: invite.id })
  }
  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "message.sent",
    entityType: "Event",
    entityId: id,
    changes: {
      audience: { from: null, to: `${history.audienceLabel} (${shifts.map(shiftName).join(", ")})` },
      recipients: { from: null, to: targets.length },
      subject: { from: null, to: history.subject },
    },
  })

  return NextResponse.json({
    sent: targets.length,
    skipped,
    noLongerOpen,
    newInvitations: createdInvites.length,
    audience: history.audienceLabel,
  })
}
