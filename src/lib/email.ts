/**
 * Thin wrappers kept for backwards compatibility with existing call
 * sites. New code should call `sendNotification` from `./notifications`
 * directly.
 */

import { sendNotification } from "./notifications"

type RegistrationEmailData = {
  to: string
  volunteerName: string
  eventTitle: string
  shifts: { label: string; date: string; startTime: string; endTime: string }[]
  editToken: string
  orgSlug?: string
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
  eventTitle: string
  volunteerName: string
  volunteerEmail: string
  shifts: { label: string; roleName: string; date: string; startTime: string; endTime: string }[]
}) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!adminEmail) return
  await sendNotification({
    kind: "admin_notification",
    recipient: { email: adminEmail, name: "Admin" },
    data,
  })
}
