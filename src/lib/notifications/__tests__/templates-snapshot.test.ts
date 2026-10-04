import { describe, it, expect, vi } from "vitest"

// The base URL is read once at module load (templates and @/lib/urls): pin it before the
// imports so the snapshots do not depend on the developer's or the CI's environment. A
// non-localhost URL also exercises the per-organization subdomain links.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://www.benevol.app"
})

import { render } from "../templates"
import type { NotificationKind, NotificationPayload } from "../types"

/**
 * Byte-for-byte record of every email kind (subject, text and html), so a refactor of the
 * templates (moving renderers between files, extracting helpers) cannot change a sent email
 * by accident. A failing snapshot after an intended copy change: review the diff, then
 * update with `npx vitest run -u`.
 */

const recipient = { email: "julie@example.com", name: "Julie Martin" }

// Characters that must be escaped in the HTML, to record the escaping too.
const tricky = `Fête <Rhône> & "Lac"`

const shift = { label: "Accueil", date: "samedi 12 juillet", startTime: "09:00", endTime: "12:30" }

const reminder = {
  volunteerName: "Julie Martin",
  eventTitle: "Festival du Rhône",
  organizationName: "Rhône Rocks",
  shiftLabel: "Accueil matin",
  shiftRoleName: "Accueil",
  shiftDate: "samedi 12 juillet",
  shiftStart: "09:00",
  shiftEnd: "12:30",
  shiftLocation: "Place du Marché",
  shiftMapUrl: "https://www.openstreetmap.org/?mlat=46.5&mlon=6.6",
  shiftContactName: "Marc",
  shiftContactPhone: "079 123 45 67",
  shiftInstructions: "Gilet orange fourni",
  editToken: "edit-tok",
  hoursUntil: 3,
  orgSlug: "rhone",
}

const cases: [string, NotificationPayload][] = [
  ["registration_confirmation", {
    kind: "registration_confirmation",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      eventTitle: "Festival du Rhône",
      shifts: [
        { ...shift, locationDetails: "Entrée B", contactName: "Marc", contactPhone: "079 123 45 67", instructions: "Gilet fourni", latitude: 46.5, longitude: 6.6 },
        { label: "Bar", date: "dimanche 13 juillet", startTime: "22:00", endTime: "26:00" },
      ],
      editToken: "edit-tok",
      orgSlug: "rhone",
      confirmationMessage: "Rendez-vous à l'entrée B.\nMerci !",
    },
  }],
  ["registration_confirmation (one shift, no message, no org)", {
    kind: "registration_confirmation",
    recipient,
    data: { volunteerName: tricky, eventTitle: tricky, shifts: [shift], editToken: "edit-tok" },
  }],
  ["member_invite", {
    kind: "member_invite",
    recipient,
    data: {
      memberName: "Julie Martin",
      organizationName: "Rhône Rocks",
      eventTitle: "Festival du Rhône",
      eventDate: "12 juillet 2026",
      eventLocation: "Lausanne",
      orgSlug: "rhone",
      eventSlug: "festival-2026",
      message: "On compte sur toi !",
      token: "inv-tok",
    },
  }],
  ["member_invite (no message, no location)", {
    kind: "member_invite",
    recipient,
    data: {
      memberName: tricky,
      organizationName: tricky,
      eventTitle: tricky,
      eventDate: "12 juillet 2026",
      eventLocation: null,
      orgSlug: "rhone",
      eventSlug: "festival-2026",
      message: null,
      token: "inv-tok",
    },
  }],
  ["reminder_j2", { kind: "reminder_j2", recipient, data: reminder }],
  ["reminder_j2 (no location, no extras)", {
    kind: "reminder_j2",
    recipient,
    data: { ...reminder, shiftLocation: null, shiftMapUrl: null, shiftContactName: null, shiftContactPhone: null, shiftInstructions: null, orgSlug: undefined },
  }],
  ["reminder_j1", { kind: "reminder_j1", recipient, data: reminder }],
  ["reminder_j1 (no location, no extras)", {
    kind: "reminder_j1",
    recipient,
    data: { ...reminder, shiftLocation: null, shiftMapUrl: null, shiftContactName: null, shiftContactPhone: null, shiftInstructions: null },
  }],
  ["reminder_dd", { kind: "reminder_dd", recipient, data: reminder }],
  ["reminder_dd (very soon)", { kind: "reminder_dd", recipient, data: { ...reminder, hoursUntil: 0, shiftLocation: null } }],
  ["manual_reminder", {
    kind: "manual_reminder",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      organizationName: "Rhône Rocks",
      eventTitle: "Festival du Rhône",
      customMessage: "N'oublie pas ton gilet ! ".repeat(6),
      shifts: [{ ...shift, roleName: "Accueil" }],
      editToken: "edit-tok",
      orgSlug: "rhone",
    },
  }],
  ["manual_reminder (no message)", {
    kind: "manual_reminder",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      organizationName: "Rhône Rocks",
      eventTitle: "Festival du Rhône",
      customMessage: "",
      shifts: [],
      editToken: "edit-tok",
    },
  }],
  ["shift_modified", {
    kind: "shift_modified",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      eventTitle: "Festival du Rhône",
      shiftLabel: "Accueil",
      oldDate: "samedi 12 juillet",
      newDate: "dimanche 13 juillet",
      oldStart: "09:00",
      newStart: "10:00",
      oldEnd: "12:00",
      newEnd: "13:00",
      editToken: "edit-tok",
      orgSlug: "rhone",
    },
  }],
  ["shift_cancelled", {
    kind: "shift_cancelled",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", orgSlug: "rhone", eventSlug: "festival-2026", shiftLabel: "Accueil", shiftDate: "samedi 12 juillet" },
  }],
  ["registration_cancelled", {
    kind: "registration_cancelled",
    recipient,
    data: {
      eventId: "evt-1",
      eventTitle: "Festival du Rhône",
      volunteerName: "Julie Martin",
      shiftId: "s-1",
      shiftLabel: "Accueil matin",
      roleName: "Accueil",
      shiftDate: "samedi 12 juillet",
      startTime: "09:00",
      endTime: "12:30",
      placesMissing: 1,
      waitlistTookSpot: false,
      message: tricky,
    },
  }],
  ["registration_cancelled (waitlist took it, no message)", {
    kind: "registration_cancelled",
    recipient,
    data: {
      eventId: "evt-1",
      eventTitle: "Festival du Rhône",
      volunteerName: "Julie Martin",
      shiftId: "s-1",
      shiftLabel: "Accueil",
      roleName: "Accueil",
      shiftDate: "samedi 12 juillet",
      startTime: "09:00",
      endTime: "12:30",
      placesMissing: 0,
      waitlistTookSpot: true,
      message: null,
    },
  }],
  ["admin_notification", {
    kind: "admin_notification",
    recipient,
    data: {
      eventTitle: "Festival du Rhône",
      volunteerName: "Julie Martin",
      volunteerEmail: "julie@example.com",
      shifts: [{ ...shift, roleName: "Accueil" }, { ...shift, label: "Matin", roleName: "Bar" }],
    },
  }],
  ["admin_notification (one shift)", {
    kind: "admin_notification",
    recipient,
    data: { eventTitle: tricky, volunteerName: tricky, volunteerEmail: "julie@example.com", shifts: [{ ...shift, label: "", roleName: "Accueil" }] },
  }],
  ["admin_invite", {
    kind: "admin_invite",
    recipient,
    data: { adminName: "Julie Martin", organizationName: "Rhône Rocks", inviteUrl: "https://www.benevol.app/invite/abc" },
  }],
  ["admin_welcome", {
    kind: "admin_welcome",
    recipient,
    data: { adminName: "Julie Martin", organizationName: "Rhône Rocks", adminUrl: "https://rhone.benevol.app/admin" },
  }],
  ["password_reset", {
    kind: "password_reset",
    recipient,
    data: { adminName: "Julie Martin", resetUrl: "https://www.benevol.app/reset/abc" },
  }],
  ["waitlist_confirmation", {
    kind: "waitlist_confirmation",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      eventTitle: "Festival du Rhône",
      shiftLabel: "Accueil",
      shiftDate: "samedi 12 juillet",
      shiftStart: "09:00",
      shiftEnd: "12:30",
      waitingPosition: 2,
      orgSlug: "rhone",
      eventSlug: "festival-2026",
    },
  }],
  ["waitlist_offered", {
    kind: "waitlist_offered",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      eventTitle: "Festival du Rhône",
      shiftLabel: "Accueil",
      shiftDate: "samedi 12 juillet",
      shiftStart: "09:00",
      shiftEnd: "12:30",
      confirmUrl: "https://rhone.benevol.app/waitlist/confirm/abc",
      expiresAt: "vendredi 11 juillet à 18:00",
    },
  }],
  ["sector_leader_invite", {
    kind: "sector_leader_invite",
    recipient,
    data: { leaderName: "Marc Dupont", roleName: "Accueil", eventTitle: "Festival du Rhône", orgSlug: "rhone", token: "lead-tok" },
  }],
  ["sector_leader_new_signup", {
    kind: "sector_leader_new_signup",
    recipient,
    data: {
      leaderName: "Marc Dupont",
      roleName: "Accueil",
      eventTitle: "Festival du Rhône",
      volunteerName: "Julie Martin",
      shiftLabel: "Accueil matin",
      shiftDate: "samedi 12 juillet",
      startTime: "09:00",
      endTime: "12:30",
      orgSlug: "rhone",
      token: "lead-tok",
    },
  }],
  ["sector_leader_withdrawal", {
    kind: "sector_leader_withdrawal",
    recipient,
    data: {
      leaderName: "Marc Dupont",
      roleName: "Accueil",
      eventTitle: "Festival du Rhône",
      volunteerName: "Julie Martin",
      shiftLabel: "Accueil matin",
      shiftDate: "samedi 12 juillet",
      startTime: "09:00",
      endTime: "12:30",
      placesMissing: 1,
      waitlistTookSpot: false,
      message: tricky,
      orgSlug: "rhone",
      token: "lead-tok",
    },
  }],
  ["product_update", {
    kind: "product_update",
    recipient,
    data: {
      subject: "Nouveautés de juillet",
      content: "# Nouveautés\n\nUn paragraphe avec **du gras** et un [lien](https://www.benevol.app).\n\n- un\n- deux",
      unsubscribeUrl: "https://www.benevol.app/unsubscribe/abc",
    },
  }],
  ["registration_link_resend", {
    kind: "registration_link_resend",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: tricky, orgSlug: "rhone", editToken: "edit-tok" },
  }],
  ["targeted_message", {
    kind: "targeted_message",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      organizationName: "Rhône Rocks",
      eventTitle: "Festival du Rhône",
      subject: "Changement de parking",
      message: "Le parking P2 est fermé, merci d'utiliser le P3. ".repeat(3),
      shifts: [shift],
      editToken: "edit-tok",
      orgSlug: "rhone",
    },
  }],
  ["targeted_message (waitlist, invited without shift)", {
    kind: "targeted_message",
    recipient,
    data: {
      volunteerName: "Julie Martin",
      organizationName: "Rhône Rocks",
      eventTitle: "Festival du Rhône",
      subject: "Infos",
      message: "Court message.",
      shifts: [],
      signupUrl: "https://rhone.benevol.app/festival-2026?token=inv-tok",
    },
  }],
  ["registration_requested", {
    kind: "registration_requested",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift, { ...shift, label: "Bar" }], editToken: "edit-tok", orgSlug: "rhone" },
  }],
  ["registration_requested (one shift)", {
    kind: "registration_requested",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift], editToken: "edit-tok" },
  }],
  ["registration_refused", {
    kind: "registration_refused",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shiftLabel: "Accueil", note: "  Le créneau est complet.  ", orgSlug: "rhone", eventSlug: "festival-2026" },
  }],
  ["registration_refused (no note)", {
    kind: "registration_refused",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shiftLabel: "Accueil", note: null, orgSlug: "rhone", eventSlug: "festival-2026" },
  }],
]

describe("render — snapshot of every notification kind", () => {
  it.each(cases)("%s", (_name, payload) => {
    const { subject, text, html } = render(payload)
    // One array element per line (split is lossless): readable diffs, and the trailing spaces
    // of the template indentation stay inside quotes, so the .snap file passes `git diff --check`.
    expect({ subject, text: text.split("\n"), html: html.split("\n") }).toMatchSnapshot()
  })

  it("covers every NotificationKind", () => {
    // Keep in sync with NotificationKind: the Record type fails to compile when a kind is added.
    const all: Record<NotificationKind, true> = {
      registration_confirmation: true,
      member_invite: true,
      reminder_j2: true,
      reminder_j1: true,
      reminder_dd: true,
      manual_reminder: true,
      shift_modified: true,
      shift_cancelled: true,
      registration_cancelled: true,
      admin_notification: true,
      admin_invite: true,
      admin_welcome: true,
      password_reset: true,
      waitlist_confirmation: true,
      waitlist_offered: true,
      sector_leader_invite: true,
      sector_leader_new_signup: true,
      sector_leader_withdrawal: true,
      product_update: true,
      registration_link_resend: true,
      targeted_message: true,
      registration_requested: true,
      registration_refused: true,
    }
    const covered = new Set(cases.map(([, p]) => p.kind))
    expect([...covered].sort()).toEqual(Object.keys(all).sort())
  })
})
