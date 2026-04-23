import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const from = process.env.EMAIL_FROM ?? "no-reply@example.com"
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

type RegistrationEmailData = {
  to: string
  volunteerName: string
  eventTitle: string
  shifts: { label: string; date: string; startTime: string; endTime: string }[]
  editToken: string
}

export async function sendConfirmationEmail(data: RegistrationEmailData) {
  const editUrl = `${appUrl}/my/${data.editToken}`

  const shiftList = data.shifts
    .map((s) => `- ${s.label} — ${s.date} de ${s.startTime} à ${s.endTime}`)
    .join("\n")

  const html = `
    <h2>Merci pour votre inscription, ${data.volunteerName} !</h2>
    <p>Vous êtes inscrit(e) aux créneaux suivants pour <strong>${data.eventTitle}</strong> :</p>
    <ul>
      ${data.shifts.map((s) => `<li><strong>${s.label}</strong> — ${s.date} de ${s.startTime} à ${s.endTime}</li>`).join("")}
    </ul>
    <p>
      <a href="${editUrl}">Modifier ou annuler mes inscriptions</a>
    </p>
    <p>Merci pour votre aide précieuse !</p>
  `

  if (!resend) {
    console.log("[EMAIL - dev mode]")
    console.log(`To: ${data.to}`)
    console.log(`Subject: Confirmation d'inscription — ${data.eventTitle}`)
    console.log(shiftList)
    console.log(`Edit URL: ${editUrl}`)
    return
  }

  await resend.emails.send({
    from,
    to: data.to,
    subject: `Confirmation d'inscription — ${data.eventTitle}`,
    html,
  })
}

export async function sendAdminNotification(data: {
  eventTitle: string
  volunteerName: string
  volunteerEmail: string
  shifts: { label: string }[]
}) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!adminEmail) return

  const html = `
    <p><strong>${data.volunteerName}</strong> (${data.volunteerEmail}) vient de s'inscrire à <strong>${data.eventTitle}</strong>.</p>
    <p>Créneaux : ${data.shifts.map((s) => s.label).join(", ")}</p>
  `

  if (!resend) return

  await resend.emails.send({
    from,
    to: adminEmail,
    subject: `Nouvelle inscription — ${data.eventTitle}`,
    html,
  })
}
