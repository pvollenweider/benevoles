/**
 * Thin wrappers kept for backwards compatibility with existing call
 * sites. New code should call `sendNotification` from `./notifications`
 * directly.
 */

import { env } from "./env"
import { prisma } from "./prisma"
import { sendNotification } from "./notifications"

type RegistrationEmailData = {
  to: string
  volunteerName: string
  eventTitle: string
  shifts: { label: string; date: string; startTime: string; endTime: string }[]
  editToken: string
  orgSlug?: string
  confirmationMessage?: string
}

export async function sendConfirmationEmail(data: RegistrationEmailData) {
  await sendNotification({
    kind: "registration_confirmation",
    recipient: { email: data.to, name: data.volunteerName },
    data: {
      volunteerName: data.volunteerName,
      eventTitle: data.eventTitle,
      shifts: data.shifts,
      editToken: data.editToken,
      orgSlug: data.orgSlug,
      confirmationMessage: data.confirmationMessage,
    },
  })
}

type MemberInviteEmailData = {
  to: string
  memberName: string
  organizationName: string
  eventTitle: string
  eventDate: string
  eventLocation: string | null
  orgSlug: string
  eventSlug: string
  message: string | null
  token: string
}

export async function sendMemberInvite(data: MemberInviteEmailData) {
  await sendNotification({
    kind: "member_invite",
    recipient: { email: data.to, name: data.memberName },
    data: {
      memberName: data.memberName,
      organizationName: data.organizationName,
      eventTitle: data.eventTitle,
      eventDate: data.eventDate,
      eventLocation: data.eventLocation,
      orgSlug: data.orgSlug,
      eventSlug: data.eventSlug,
      message: data.message,
      token: data.token,
    },
  })
}

export async function sendAdminNotification(data: {
  organizationId: string
  eventTitle: string
  volunteerName: string
  volunteerEmail: string
  shifts: { label: string; roleName: string; date: string; startTime: string; endTime: string }[]
}) {
  const { organizationId, ...templateData } = data

  const orgAdmins = await prisma.adminUser.findMany({
    where: { organizationId, isActive: true },
    select: { email: true, name: true },
  })

  // Fall back to the global notification address only when the org has no
  // active admin on record — orgAdmins is the source of truth otherwise, so
  // cross-org leakage to a single shared inbox can't happen.
  const recipients = orgAdmins.length > 0
    ? orgAdmins
    : env.ADMIN_NOTIFICATION_EMAIL
      ? [{ email: env.ADMIN_NOTIFICATION_EMAIL, name: "Admin" }]
      : []

  await Promise.all(
    recipients.map((r) =>
      sendNotification({
        kind: "admin_notification",
        recipient: { email: r.email, name: r.name },
        data: templateData,
      })
    )
  )
}
