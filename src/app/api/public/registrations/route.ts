// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_ORG_WHERE } from "@/lib/org-approval"
import { NextResponse } from "next/server"
import { birthDateSchema } from "@/lib/civil-date"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/utils"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { buildSignupNotifications, type CreatedRegistration } from "@/lib/signup-notifications"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import {
  COMMITTED_STATUSES,
  LIVE_STATUSES,
  OCCUPYING_STATUSES,
  ShiftFullError,
  isUniqueViolation,
  lockShifts,
  planPlacement,
} from "@/lib/registration-capacity"
import { z } from "zod"
import { SIGNUP_COMMENT_MAX, SIGNUP_ID_MAX, SIGNUP_PHONE_MAX, SIGNUP_SHIFTS_MAX, tooLongSignupField } from "@/lib/signup-limits"
import { linkTargetInclude } from "@/lib/personal-link-send"
import { sendNotification } from "@/lib/notifications"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { checkAnswers, consistentAdditions, planAnswerWrites } from "@/lib/event-questions"
import { reservedRoles } from "@/lib/role-reservation"
import { assignedOnlyRoles, asksAssignedOnly } from "@/lib/role-assignment"
import {
  answersRefusal,
  existingOverlapRefusal,
  findOverlap,
  fullShift,
  fullShiftRefusal,
  minimumAgeRefusal,
  overlapWithExisting,
  registrationWindowRefusal,
  requiredPhoneRefusal,
  reservedRoleRefusal,
  selectionOverlapRefusal,
  pastShiftRefusal,
  duplicateSignupRefusal,
  staleLinkRefusal,
  type SignupRefusal,
} from "@/lib/signup-eligibility"
import { RoleLimitError, roleLimitBreaches, roleLimitMessage, roleLimits } from "@/lib/role-limit"
import { resolveCharterText } from "@/lib/volunteer-charter"
import { hashCharterText } from "@/lib/charter-hash"
import { lockSignupVolunteer, SignupMatchMovedError } from "@/lib/signup-volunteer"
import { touchOrgActivity } from "@/lib/org-activity"
import { isKnownMinor, signupNoticeVersion } from "@/lib/shift-roster"
import { applySignupRosterChoice, logRosterChange, type RosterChange } from "@/lib/roster-consent-write"
import { parseGroupCode } from "@/lib/group-links"
import { localDay } from "@/lib/day-of"
import { orgTimeZone } from "@/lib/time-zone"
import { recordTokenMiss, tokenLookupsBlocked } from "@/lib/token-rate-limit"
import { contactPhone } from "@/lib/contact-phone"
import { myAnswersQuery, storedAnswers } from "@/lib/my-answers"
import { answerChanges, answersEditState, type AnswerChange } from "@/lib/answer-changes"
import { recordAnswerChanges, writeAnswerChanges } from "@/lib/answer-change-save"
import { contactChanges, type ContactChange, type SignupUpdates } from "@/lib/signup-updates"

const schema = z.object({
  eventId: z.string().max(SIGNUP_ID_MAX),
  shiftIds: z.array(z.string().max(SIGNUP_ID_MAX)).min(1).max(SIGNUP_SHIFTS_MAX),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  // Bounded (#1047): the text is shown to organisers and exported to CSV.
  phone: z.string().max(SIGNUP_PHONE_MAX).optional(),
  // A real, past day (audit): an invalid string became an Invalid Date that passed every age check.
  // The form sends "" when no shift needs it: that is no birth date, not an invalid one.
  birthDate: z.preprocess((v) => (v === "" ? undefined : v), birthDateSchema.optional()),
  comment: z.string().max(SIGNUP_COMMENT_MAX).optional(),
  consent: z.literal(true),
  // The volunteer ticked "J'ai lu et j'accepte la convention des bénévoles" (#569): the page
  // already refuses to submit without it (validateSignup). Required (#696): a false or missing
  // value is refused below with a readable message, before any lookup.
  charterAccepted: z.literal(true),
  inviteToken: z.string().max(200).optional(),
  /** Answers to the event's custom questions (#483), by question id. */
  answers: z.record(z.string(), z.unknown()).optional(),
  /** Code of the share link per group (#947) the page was opened with; resolved below, never an id. */
  groupCode: z.string().max(64).optional(),
  /**
   * The personal link of the volunteer's session on this event (#1013), when they come from their
   * personal page for more shifts: proof they own their address, so what they change in the form
   * (name, phone, answers) is saved. Resolved below, for this event and this address only.
   */
  personalToken: z.string().max(200).optional(),
  /**
   * The optional « show my name » box of the shift roster (#1068), offered only when the event has
   * it on. Never authority on its own: see choiceAfterSignup (src/lib/shift-roster.ts).
   */
  rosterNameVisible: z.boolean().optional(),
  /** The version of the roster box's text the form showed (#1068); absent from older pages = V1. */
  rosterNoticeVersion: z.string().max(40).optional(),
})

export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "registrations", 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const body = await req.json()
  if (body?.charterAccepted !== true) {
    // A page opened before the checkbox was sent with the form doesn't send it at all: reloading
    // the page brings the current form.
    return NextResponse.json(
      { error: "Coche « J'ai lu et j'accepte la convention des bénévoles », puis confirme à nouveau. Si la case n'apparaît pas, recharge la page.", field: "charterAccepted" },
      { status: 400 },
    )
  }
  // Over-long phone or comment (#1047): named, so a volunteer whose older phone came back
  // pre-filled knows what to shorten.
  const tooLong = tooLongSignupField(body ?? {})
  if (tooLong) return NextResponse.json({ error: tooLong.message, field: tooLong.field }, { status: 400 })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { eventId, shiftIds, firstName, lastName, email, phone, birthDate, comment, inviteToken, personalToken } = parsed.data

  const event = await prisma.event.findFirst({
    where: { id: eventId, publicStatus: "published", organization: PUBLIC_ORG_WHERE },
    include: { organization: { select: { slug: true, timeZone: true, volunteerCharter: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
  const refuse = (r: SignupRefusal) => NextResponse.json(r.body, { status: r.status })

  const windowRefusal = registrationWindowRefusal(event)
  if (windowRefusal) return refuse(windowRefusal)

  const phoneRefusal = requiredPhoneRefusal(event.requirePhone, phone)
  if (phoneRefusal) return refuse(phoneRefusal)

  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, eventId, status: { in: ["open"] } },
    include: { registrations: { where: { status: { in: [...OCCUPYING_STATUSES] } } } },
  })

  const invalidShifts = () => NextResponse.json({ error: INVALID_SHIFTS }, { status: 409 })
  if (shifts.length !== shiftIds.length) return invalidShifts()

  // The settings of the roles asked for, from all their live shifts: a role is assigned by the
  // organisation only (#1145) or reserved (#470) as soon as one of its shifts is.
  const roleShifts = await prisma.shift.findMany({
    where: { eventId, roleName: { in: [...new Set(shifts.map((s) => s.roleName))] }, status: { not: "cancelled" } },
    select: { roleName: true, reservedTags: true, assignedOnly: true },
  })
  // A role assigned by the organisation only (#1145) is never bookable here, invitation or personal
  // link included: its shifts answer as unknown ones, before any other check, so neither the
  // message nor a « full » or « past » refusal reveals the role.
  if (asksAssignedOnly(shifts, assignedOnlyRoles(roleShifts))) return invalidShifts()

  // Early, unlocked check for a friendly error — the authoritative one runs under lock below.
  // A full shift with a waitlist goes on: its registration is created with status "waiting".
  const pastRefusal = pastShiftRefusal(event, shifts, localDay(new Date(), orgTimeZone(event.organization)))
  if (pastRefusal) return refuse(pastRefusal)

  const fullRefusal = fullShiftRefusal(shifts)
  if (fullRefusal) return refuse(fullRefusal)

  const selectionRefusal = selectionOverlapRefusal(shifts)
  if (selectionRefusal) return refuse(selectionRefusal)

  // Roles reserved to members with a tag (#470): all the role's shifts count, see reservedRoleRefusal.
  const reserved = reservedRoles(roleShifts)
  const roleRefusal = await reservedRoleRefusal({
    shifts,
    reserved,
    email,
    loadInvite: async () => inviteToken
      ? prisma.memberInvite.findFirst({
          where: { ...linkToken.where(inviteToken), eventId },
          select: { volunteer: { select: { email: true, tags: true, active: true } } },
        })
      : null,
  })
  if (roleRefusal) return refuse(roleRefusal)

  // Share link per group (#947): the sign-up counts for the link of this event with that code. An
  // unknown, malformed or other event's code is ignored, never refused: the sign-up goes through.
  const groupCode = parseGroupCode(parsed.data.groupCode)
  const groupLink = groupCode
    ? await prisma.eventGroupLink.findFirst({ where: { eventId, code: groupCode }, select: { id: true, name: true } })
    : null

  // Custom questions (#483), checked here whatever the page did; stored with the registration.
  const questions = await prisma.eventQuestion.findMany({
    where: { eventId, archivedAt: null },
    select: { id: true, label: true, type: true, options: true, required: true, minValue: true, maxValue: true, parentId: true, showIfValues: true },
  })
  const answerCheck = checkAnswers(questions, parsed.data.answers)
  if (!answerCheck.ok) return refuse(answersRefusal(answerCheck)!)

  // Minimum age (#192), authoritative: see minimumAgeRefusal.
  const ageRefusal = minimumAgeRefusal(shifts, birthDate)
  if (ageRefusal) return refuse(ageRefusal)

  // Volunteer is org-scoped: each (organizationId, email) is a unique roster entry.
  //
  // Nothing here proves the submitter owns `email` (#285, #312): anyone can type someone else's
  // address, known to the organization or not. So the management link (editToken: it opens
  // /my, which lists the volunteer's registrations, tokens and phone) is never returned on
  // screen — it goes out by email only — and an existing profile isn't changed. The one proof
  // of ownership is a valid member invite, which was emailed to that very volunteer.
  const organizationId = event.organizationId
  const birthDateValue = birthDate ? new Date(birthDate) : undefined
  // Case-insensitive: addresses stored before normalization (#310) may still have capitals
  // (case-only duplicates left for manual review); `email` itself is already normalized.
  const existing = await prisma.volunteer.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, organizationId },
    select: { id: true },
  })
  let ownsEmail = false
  // The personal link of this very member on this event (#1013): what the form started from (name,
  // phone as the personal page shows it), to save what changed. Another member's link, another
  // event's or a cancelled one proves nothing: the sign-up then follows the rules above.
  let personal: { stored: { firstName: string; lastName: string; phone: string | null } } | null = null
  // Which link gave the proof: read here, before the transaction, and checked again under the
  // member lock (#1138 follow-up), where it is the only authority.
  let inviteProof = false
  let hiddenRoles = new Set<string>()
  if (existing) {
    if (inviteToken) {
      const invite = await prisma.memberInvite.findFirst({
        where: { ...linkToken.where(inviteToken), eventId, volunteerId: existing.id },
        select: { id: true },
      })
      inviteProof = invite != null
      ownsEmail = inviteProof
    }
    if (personalToken && !(await tokenLookupsBlocked(req))) {
      const link = await prisma.registration.findFirst({
        where: { ...registrationToken.where(personalToken), eventId, status: { in: [...LIVE_STATUSES] } },
        select: { volunteerId: true, phone: true, volunteer: { select: { firstName: true, lastName: true, phone: true } } },
      })
      if (!link) await recordTokenMiss(req)
      else if (link.volunteerId === existing.id) {
        const others = await prisma.registration.findMany({
          where: { volunteerId: existing.id, eventId, status: { in: [...LIVE_STATUSES] } },
          select: { phone: true },
        })
        // Same phone as the personal page shows (GET /api/public/registrations/[token]).
        const shownPhone = contactPhone({ phone: link.phone?.trim() || others.find((r) => r.phone?.trim())?.phone, volunteer: link.volunteer })
        personal = { stored: { firstName: link.volunteer.firstName, lastName: link.volunteer.lastName, phone: shownPhone } }
        ownsEmail = true
      }
    }

    const existingRegs = await prisma.registration.findMany({
      where: { volunteerId: existing.id, shiftId: { in: shiftIds }, status: { in: [...LIVE_STATUSES] } },
      select: { id: true },
    })
    if (existingRegs.length > 0) return alreadyRegistered(existing.id, eventId)

    const allEventRegs = await prisma.registration.findMany({
      where: { volunteerId: existing.id, eventId, status: { in: [...COMMITTED_STATUSES] } },
      include: { shift: true },
    })
    // Roles of the event assigned by the organisation only (#1145): an overlap with one of their
    // shifts is refused without naming it.
    hiddenRoles = assignedOnlyRoles(await prisma.shift.findMany({
      where: { eventId, status: { not: "cancelled" }, assignedOnly: true },
      select: { roleName: true, assignedOnly: true },
    }))
    const clashRefusal = existingOverlapRefusal(allEventRegs, shifts, hiddenRoles)
    if (clashRefusal) return refuse(clashRefusal)
  }

  // Chaque inscription reçoit son propre token unique.
  // On retourne le token de la première comme lien de confirmation.
  //
  // Capacity, waitlist position and creation happen in one transaction holding a lock on the
  // selected shifts (#264): two sign-ups racing for the last spot are serialized, so only one
  // gets it and the other is waitlisted or refused. The partial unique index backs up the
  // "already registered" check above against a double submit racing itself.
  // One token per new registration, kept in clear only in memory: the confirmation email and
  // the response need it, the DB only stores its hash and encrypted copy (#290).
  const tokens = new Map(shiftIds.map((id) => [id, generateToken()]))

  // Proof of acceptance (#569): the exact text shown to this volunteer, hashed. CharterVersion
  // resolves the hash back to its text later; upserted once per distinct text an organization has
  // shown (never overwritten: "create" wins a race, "update" is a no-op on an existing row).
  const charterText = resolveCharterText(event.organization.volunteerCharter)
  const charterHash = hashCharterText(charterText)
  const charterAcceptedAt = new Date()

  // Notifications of this sign-up, built by the usual helpers into an outbox collector (#293).
  // Built and stored inside the registration transaction (#352): the registrations and their
  // notifications commit together, then delivery runs after the response. The helpers only read
  // (admins, sector leaders), so the shift locks are held a few queries longer, no more.
  const buildNotifications = (registrations: CreatedRegistration[], volunteerId: string) => buildSignupNotifications({
    event,
    shifts,
    volunteer: { id: volunteerId, email, firstName, lastName },
    registrations,
    tokens,
  })

  let outcome!: {
    registrations: Awaited<ReturnType<typeof prisma.registration.create>>[]; volunteerId: string; createdNow: boolean; matchErased: boolean; outboxIds: string[]
    /** Saved from the personal link's form (#1013); null without one. */
    updates: { contact: ContactChange[]; answers: AnswerChange[] } | null
    /** The shift roster choice this sign-up changed (#1068), to log; null if none. */
    rosterChange?: RosterChange | null
  }
  let matchId = existing?.id ?? null
  for (let attempt = 1; ; attempt++) {
    try {
      outcome = await prisma.$transaction(async (tx) => {
        await lockShifts(tx, shiftIds)

        // Resolve the hash back to its text later (#569): upserted once per distinct text, never
        // overwritten once seen (the "update" below only exists so a race between two sign-ups
        // doesn't throw on a duplicate key — it changes nothing).
        await tx.charterVersion.upsert({
          where: { organizationId_hash: { organizationId, hash: charterHash } },
          create: { organizationId, hash: charterHash, text: charterText },
          update: {},
        })

        // A new volunteer is created in the same transaction as their registrations (#309): if the
        // registration fails (shift full, overlap, duplicate), no member record is left behind.
        // Then the volunteer is locked (#285): two concurrent sign-ups of the same person to two
        // different, overlapping shifts lock different shift rows, so the overlap check has to be
        // redone under a per-volunteer lock too. Always shifts first, then volunteer: same order
        // everywhere. A match erased since the lookup above (#516) counts as no match: a new record
        // is created, nothing of this submission lands on the erased one; a match that lost the
        // address (#1138 follow-up) rolls this transaction back (src/lib/signup-volunteer.ts).
        const resolved = await lockSignupVolunteer(tx, {
          existingId: matchId,
          organizationId,
          email,
          create: { firstName, lastName, phone, birthDate: birthDateValue },
        })
        const { volunteerId, createdNow, matchErased } = resolved
        // The proof read before the transaction counts only if it still holds now, under the member
        // lock (#1138 follow-up): same member, still at the submitted address (lockSignupVolunteer),
        // and the very link that gave it still this member's, on this event. An organiser who
        // corrected the address meanwhile renewed every link: the request is then refused, with no
        // link returned and nothing written from the old one. If the correction comes second, it
        // renews the links this sign-up creates too. A match erased meanwhile (#516) keeps its own
        // rule: the sign-up goes on as an unproven one, on a new record.
        if (ownsEmail && !matchErased) {
          const sameMember = existing != null && volunteerId === existing.id && !createdNow
          const stillHolds = sameMember
            && (!inviteProof || (await tx.memberInvite.findFirst({ where: { ...linkToken.where(inviteToken!), eventId, volunteerId }, select: { id: true } })) != null)
            && (!personal || (await tx.registration.findFirst({ where: { ...registrationToken.where(personalToken!), eventId, volunteerId, status: { in: [...LIVE_STATUSES] } }, select: { id: true } })) != null)
          if (!stillHolds) throw new StaleProofError()
        }
        const liveNow = await tx.registration.findMany({
          where: { volunteerId, eventId, status: { in: [...COMMITTED_STATUSES] } },
          include: { shift: true },
        })
        // The event's roles assigned by the organisation only (#1145), read again under the shift
        // lock: a role made assigned-only while this sign-up ran is refused here, and an overlap with
        // one of its shifts is not named. The role route writes every shift of the role, the locked
        // ones included, so its change either committed before this read or waits for this sign-up,
        // which then came first, like the registrations kept when the option is set.
        const hiddenNow = assignedOnlyRoles(await tx.shift.findMany({
          where: { eventId, status: { not: "cancelled" }, assignedOnly: true },
          select: { roleName: true, assignedOnly: true },
        }))
        if (asksAssignedOnly(shifts, hiddenNow)) throw new AssignedOnlyError()
        const clashNow = findOverlap(liveNow, shifts, new Set([...hiddenRoles, ...hiddenNow]))
        if (clashNow) throw new OverlapError(clashNow.label)

        // Shifts per volunteer for a role (#466), under the same volunteer lock, so two concurrent
        // sign-ups of one person can't both pass. Every live registration counts, waitlist included.
        const limits = roleLimits(await tx.shift.findMany({
          where: { eventId, roleName: { in: [...new Set(shifts.map((s) => s.roleName))] }, maxPerVolunteer: { not: null } },
          select: { roleName: true, maxPerVolunteer: true },
        }))
        if (limits.size > 0) {
          const held = await tx.registration.findMany({
            where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] }, shift: { roleName: { in: [...limits.keys()] } } },
            select: { shift: { select: { roleName: true } } },
          })
          const [breach] = roleLimitBreaches(shifts, held.map((h) => h.shift), limits)
          if (breach) throw new RoleLimitError(breach)
        }
        const created = []
        for (const shift of shifts) {
          const occupied = await tx.registration.count({
            where: { shiftId: shift.id, status: { in: [...OCCUPYING_STATUSES] } },
          })
          const maxPos = await tx.registration.aggregate({
            where: { shiftId: shift.id, status: { in: ["waiting", "offered"] } },
            _max: { waitingPosition: true },
          })
          const placement = planPlacement({
            capacity: shift.capacity,
            occupied,
            waitlistEnabled: shift.waitlistEnabled,
            maxWaitingPosition: maxPos._max.waitingPosition,
            requiresApproval: shift.requiresApproval,
          })
          if (placement.status === "full") throw new ShiftFullError(shift.id, shift.label)
          created.push(
            await tx.registration.create({
              data: {
                linkEmailedAt: new Date(), // the confirmation email carries the link (#376)
                eventId,
                shiftId: shift.id,
                volunteerId,
                source: "public_form",
                comment,
                phone: phone?.trim() || null,
                ...registrationToken.data(tokens.get(shift.id)!),
                status: placement.status,
                waitingPosition: placement.status === "waiting" ? placement.waitingPosition : null,
                // Proof of acceptance (#569): same hash and instant for every registration this
                // sign-up creates.
                charterAcceptedHash: charterHash,
                charterAcceptedAt,
                groupLinkId: groupLink?.id ?? null,
              },
            })
          )
        }
        const outboxIds = await enqueueNotifications(await buildNotifications(created, volunteerId), tx, { organizationId: event.organizationId })
        // Shift roster (#1068): the box counts only when the event offers it, and makes the name
        // visible only with proof of the address (the personal link, a member invite); otherwise
        // it waits for a confirmation from the personal page. Any sign-up without proof suspends an
        // earlier acceptance: the shifts just added may not be the person's.
        const rosterChange = await applySignupRosterChoice(tx, {
          eventId,
          volunteerId,
          requested: event.shiftRosterEnabled && parsed.data.rosterNameVisible === true,
          verified: ownsEmail && !createdNow && !matchErased,
          minor: isKnownMinor(birthDateValue ?? null, event.startDate),
          noticeVersion: signupNoticeVersion(parsed.data.rosterNoticeVersion),
          now: new Date(),
        })
        // From the personal link (#1013): the member is the link's, locked and not erased. Only what
        // changed is written, as on the personal page (#997).
        if (personal && !createdNow && !matchErased) {
          const updates = await savePersonalChanges(tx, {
            eventId, volunteerId, event, stored: personal.stored, submitted: { firstName, lastName, phone }, raw: parsed.data.answers ?? {}, values: answerCheck.values, hidden: answerCheck.hidden,
          })
          return { registrations: created, volunteerId, createdNow, matchErased, outboxIds, updates, rosterChange }
        }
        // Answers (#483): replaced only with proof the submitter owns the address, as for the
        // profile below; otherwise only missing answers are added (see planAnswerWrites).
        // An invite of an erased record proves nothing about the new one (#516).
        // Profile (name, phone, birth date) only with the proof checked above, under the same lock:
        // an anonymous submission must not rewrite an existing volunteer's name, phone or birth date.
        if (ownsEmail && !createdNow && !matchErased) {
          await tx.volunteer.update({
            where: { id: volunteerId },
            // Keep the profile's existing birthDate if this submission didn't provide one (most
            // registrations aren't age-gated), rather than clearing it.
            data: { firstName, lastName, phone, ...(birthDateValue ? { birthDate: birthDateValue } : {}) },
          })
        }
        const writes = planAnswerWrites(questions.map((q) => q.id), answerCheck.values, createdNow || (ownsEmail && !matchErased))
        for (const [questionId, values] of writes.replace) {
          await tx.questionAnswer.upsert({
            where: { questionId_volunteerId: { questionId, volunteerId } },
            create: { questionId, eventId, volunteerId, values },
            update: { values },
          })
        }
        // A follow-up (#1016) is added only when the member's stored parent answer, which an
        // unproven sign-up doesn't replace, shows it.
        const additions = writes.addMissing.length > 0 && questions.some((q) => q.parentId)
          ? consistentAdditions(questions, writes.addMissing, await storedAnswerMap(tx, eventId, volunteerId))
          : writes.addMissing
        if (additions.length > 0) {
          await tx.questionAnswer.createMany({
            data: additions.map(([questionId, values]) => ({ questionId, eventId, volunteerId, values })),
            skipDuplicates: true,
          })
        }
        if (writes.clear.length > 0) {
          await tx.questionAnswer.deleteMany({ where: { volunteerId, questionId: { in: writes.clear } } })
        }
        return { registrations: created, volunteerId, createdNow, matchErased, outboxIds, updates: null, rosterChange }
      })
      break
    } catch (e) {
      // The member found before the transaction lost the submitted address meanwhile
      // (src/lib/signup-volunteer.ts): its proof, if any, is gone with it; without one, start again
      // without that match, as a sign-up arriving now would (twice at most, then the usual error).
      if (e instanceof SignupMatchMovedError) {
        if (ownsEmail) return refuse(staleLinkRefusal())
        if (attempt < 3) { matchId = null; continue }
      }
      if (e instanceof ShiftFullError) return refuse(fullShift(e.shiftId, e.label))
      if (e instanceof RoleLimitError) {
        return NextResponse.json({ error: roleLimitMessage(e.breach), roleLimit: e.breach.roleName }, { status: 409 })
      }
      if (e instanceof OverlapError) return refuse(overlapWithExisting(e.label))
      if (e instanceof StaleProofError) return refuse(staleLinkRefusal())
      if (e instanceof AssignedOnlyError) return NextResponse.json({ error: INVALID_SHIFTS }, { status: 409 })
      if (isUniqueViolation(e)) {
        // Our transaction rolled back; the duplicate belongs to a volunteer that exists
        // independently of it (created before, or by a concurrent sign-up).
        const owner = await prisma.volunteer.findFirst({ where: { email: { equals: email, mode: "insensitive" }, organizationId }, select: { id: true } })
        if (owner) return alreadyRegistered(owner.id, eventId)
        return refuse(duplicateSignupRefusal())
      }
      throw e
    }
  }

  const { registrations, volunteerId, matchErased, outboxIds, updates, rosterChange } = outcome
  if (matchErased) ownsEmail = false

  // The answers changed from the personal link (#1013): logged and told as from the personal page.
  if (updates && updates.answers.length > 0) {
    await recordAnswerChanges({
      event: { id: event.id, title: event.title, organizationId: event.organizationId },
      volunteerId,
      volunteerName: `${firstName} ${lastName}`,
      changes: updates.answers,
    })
  }

  // A volunteer registering is the organisation in use (#811): its space is still wanted.
  void touchOrgActivity(organizationId)

  // Clear tokens exist only in memory here (the DB keeps hash + encrypted copy, #290).
  const editToken = tokens.get(registrations[0].shiftId)!

  for (const reg of registrations) {
    await logEvent({
      eventId,
      actor: { type: "volunteer", id: volunteerId },
      action: reg.status === "waiting" ? "registration.waitlist_joined" : reg.status === "requested" ? "registration.requested" : "registration.created",
      entityType: "Registration",
      entityId: reg.id,
      changes: {
        shiftId: { from: null, to: reg.shiftId },
        source: { from: null, to: "public_form" },
        ...(groupLink ? { groupLink: { from: null, to: groupLink.name } } : {}),
      },
    })
  }

  if (rosterChange) await logRosterChange(eventId, volunteerId, rosterChange)

  // Mark the member invite as used (kept valid for re-visits per product
  // decision — only the first usage is timestamped).
  if (inviteToken) {
    await prisma.memberInvite
      .updateMany({
        where: { ...linkToken.where(inviteToken), eventId, usedAt: null },
        data: { usedAt: new Date() },
      })
      .catch(reportError("member_invite.mark_used"))
    // Change of mind (#558): registering from the same invite link clears a previous « pas
    // disponible », whether this is the first use or a later one. A later withdrawal of all
    // shifts does not set it back (product decision) — nothing here reacts to a cancellation.
    await prisma.memberInvite
      .updateMany({
        where: { ...linkToken.where(inviteToken), eventId, declinedAt: { not: null } },
        data: { declinedAt: null },
      })
      .catch(reportError("member_invite.clear_declined"))
  }

  const waitlistRegs = registrations.filter((r) => r.status === "waiting")
  const activeRegs = registrations.filter((r) => r.status === "active")
  const requestedRegs = registrations.filter((r) => r.status === "requested")

  // Stored with the registrations (#352); sent once this response is out, retried by the cron.
  deliverAfterResponse(outboxIds)

  const onWaitlist = waitlistRegs.length > 0 && activeRegs.length === 0 && requestedRegs.length === 0

  return NextResponse.json({
    success: true,
    // Only with proof of ownership (member invite); otherwise the link is in the email only.
    editToken: ownsEmail ? editToken : null,
    linkSentByEmail: !ownsEmail,
    confirmationMessage: activeRegs.length === 0 ? null : event.confirmationMessage,
    registrationCount: registrations.length,
    onWaitlist,
    waitlistShifts: waitlistRegs.length,
    // Requests waiting for the organizer's decision (#484), not places.
    requestedShifts: requestedRegs.length,
    activeShifts: activeRegs.length,
    // What the sign-up from the personal link saved (#1013), said by the confirmation.
    ...(updates ? { updated: { contact: updates.contact.map((c) => c.field), answers: updates.answers.length } satisfies SignupUpdates } : {}),
  }, { status: 201 })
}

type PersonalTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** A member's stored answers on the event, by question id (#1016). */
async function storedAnswerMap(tx: PersonalTx, eventId: string, volunteerId: string): Promise<Map<string, string[]>> {
  const rows = await tx.questionAnswer.findMany({ where: { eventId, volunteerId }, select: { questionId: true, values: true } })
  return new Map(rows.filter((r) => r.values.length > 0).map((r) => [r.questionId, r.values]))
}

/**
 * What a sign-up from the personal link changes (#1013), inside the sign-up's transaction, once its
 * registrations exist:
 * - the name and phone that differ from what the form started from: the member's profile, and the
 *   phone of their live registrations on the event too, the one the personal page, the organisers
 *   and the sector leaders read first (`contactPhone`);
 * - the answers, with the personal page's rules (#997): only the questions sent are compared, and
 *   only while one of the volunteer's registrations on the event can still be withdrawn online
 *   (`answersEditState`, the new ones included). Otherwise, as an anonymous sign-up: only the
 *   answers the volunteer has not given yet are added.
 * Nothing is written when nothing changed.
 */
async function savePersonalChanges(tx: PersonalTx, input: {
  eventId: string
  volunteerId: string
  event: { cancelDeadlineDays: number | null; cancelDeadlineHours: number | null; organization: { timeZone: string | null } }
  stored: { firstName: string; lastName: string; phone: string | null }
  submitted: { firstName: string; lastName: string; phone?: string }
  raw: Record<string, unknown>
  values: Map<string, string[]>
  /** Follow-ups (#1016) the checked answers don't show: their stored answer is cleared. */
  hidden: string[]
}): Promise<{ contact: ContactChange[]; answers: AnswerChange[] }> {
  const { eventId, volunteerId } = input
  const contact = contactChanges(input.stored, { ...input.submitted, phone: input.submitted.phone ?? "" })
  if (contact.length > 0) {
    const value = (f: ContactChange["field"]) => contact.find((c) => c.field === f)?.to
    const profile: { firstName?: string; lastName?: string; phone?: string | null } = {}
    if (contact.some((c) => c.field === "firstName")) profile.firstName = value("firstName")!
    if (contact.some((c) => c.field === "lastName")) profile.lastName = value("lastName")!
    if (contact.some((c) => c.field === "phone")) profile.phone = value("phone") ?? null
    await tx.volunteer.update({ where: { id: volunteerId }, data: profile })
    if ("phone" in profile) {
      await tx.registration.updateMany({ where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } }, data: { phone: profile.phone } })
    }
  }

  const questions = await tx.eventQuestion.findMany(myAnswersQuery(eventId, volunteerId))
  const live = await tx.registration.findMany({
    where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } },
    select: { status: true, shift: { select: { date: true, startTime: true, endTime: true } } },
  })
  const edit = answersEditState({ registrations: live, setting: input.event, timeZone: orgTimeZone(input.event.organization), now: new Date() })
  if (!edit.allowed) {
    const stored = storedAnswers(questions)
    const missing = consistentAdditions(questions, [...input.values].filter(([id]) => !stored.has(id)), stored)
    if (missing.length > 0) {
      await tx.questionAnswer.createMany({ data: missing.map(([questionId, values]) => ({ questionId, eventId, volunteerId, values })), skipDuplicates: true })
    }
    return { contact, answers: [] }
  }
  const submitted = new Set(questions.filter((q) => Object.hasOwn(input.raw, q.id)).map((q) => q.id))
  // Judged again against the stored answers of the questions the form left out (#1016): a
  // follow-up whose parent wasn't sent follows the stored parent answer.
  const recheck = checkAnswers(questions, input.raw, { keep: storedAnswers(questions) })
  const { values, hidden } = recheck.ok ? recheck : { values: input.values, hidden: input.hidden }
  const answers = answerChanges(questions, new Set([...submitted, ...hidden]), values)
  await writeAnswerChanges(tx, { eventId, volunteerId, changes: answers })
  return { contact, answers }
}

/** The proof of the address read before the transaction no longer holds under the member lock. */
class StaleProofError extends Error {
  constructor() {
    super("Proof of address changed before the member lock")
  }
}

/** A role made assigned-only by the organisation (#1145) while the sign-up ran, seen under the lock. */
class AssignedOnlyError extends Error {
  constructor() {
    super("Shift of a role assigned by the organisation only")
  }
}

/** Unknown, closed or not public (#1145): one answer for all, which reveals no role. */
const INVALID_SHIFTS = "Un ou plusieurs créneaux sont invalides ou fermés. Recharge la page."

class OverlapError extends Error {
  constructor(readonly label: string | null) {
    super(`Overlaps ${label}`)
  }
}

/**
 * "Already registered" (#285): never answers with the existing registration's editToken — the
 * submitter may not be that volunteer. The owner gets their management link by email instead
 * (throttled per volunteer, so the form can't be used to flood their inbox), whatever the status
 * of their registration: the personal page shows waitlisted and offered places too.
 *
 * The answer is the same in every case (#1047): status of the existing registration, email sent
 * or throttled. Only the duplicate itself is still told apart from a new sign-up.
 */
async function alreadyRegistered(volunteerId: string, eventId: string) {
  // An active registration or a request first, as before; else the waitlisted / offered place.
  const reg = await prisma.registration.findFirst({
    where: { volunteerId, eventId, status: { in: [...COMMITTED_STATUSES] } },
    include: linkTargetInclude,
  }) ?? await prisma.registration.findFirst({
    where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } },
    include: linkTargetInclude,
    orderBy: { createdAt: "desc" },
  })
  if (reg?.volunteer.email && (await rateLimit(volunteerId, "reg-link-resend", 3, 60 * 60 * 1000)).ok) {
    const name = `${reg.volunteer.firstName} ${reg.volunteer.lastName}`
    const result = await sendNotification({
      kind: "registration_link_resend",
      recipient: { email: reg.volunteer.email, name },
      volunteerId,
      organizationId: reg.event.organizationId,
      data: { volunteerName: name, eventTitle: reg.event.title, orgSlug: reg.event.organization.slug, editToken: registrationToken.reveal(reg) },
    }).catch((e) => {
      reportError("notification.registration_link_resend")(e)
      return { ok: false }
    })
    // The personal page shows when the link was last emailed: only once it actually went out.
    if (result.ok) {
      await prisma.registration.updateMany({ where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } }, data: { linkEmailedAt: new Date() } })
    }
  }
  const { body, status } = duplicateSignupRefusal()
  return NextResponse.json(body, { status })
}
