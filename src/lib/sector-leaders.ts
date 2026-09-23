/**
 * Sector leader notifications (#186). A sector leader is scoped to one roleName within an
 * event; when a volunteer signs up for a shift under that role, every leader for that role
 * gets an email pointing back to their read-only roster.
 */
import { prisma } from "./prisma"
import { sendNotification } from "./notifications"

export async function notifySectorLeadersOfSignup(params: {
  eventId: string
  eventTitle: string
  orgSlug: string
  volunteerName: string
  shift: { roleName: string; label: string; date: Date; startTime: string; endTime: string }
}): Promise<void> {
  const leaders = await prisma.sectorLeader.findMany({
    where: { eventId: params.eventId, roleName: params.shift.roleName },
  })
  if (leaders.length === 0) return

  await Promise.all(
    leaders.map((leader) =>
      sendNotification({
        kind: "sector_leader_new_signup",
        recipient: { email: leader.email, name: leader.name },
        data: {
          leaderName: leader.name,
          roleName: leader.roleName,
          eventTitle: params.eventTitle,
          volunteerName: params.volunteerName,
          shiftLabel: params.shift.label,
          shiftDate: params.shift.date.toLocaleDateString("fr-FR"),
          startTime: params.shift.startTime,
          endTime: params.shift.endTime,
          orgSlug: params.orgSlug,
          token: leader.token,
        },
      }).catch(() => {})
    )
  )
}
