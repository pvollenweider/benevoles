import nodemailer from "nodemailer"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE } = process.env

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  })
}

type RegistrationEmailData = {
  to: string
  volunteerName: string
  eventTitle: string
  shifts: { label: string; date: string; startTime: string; endTime: string }[]
  editToken: string
}

export async function sendConfirmationEmail(data: RegistrationEmailData) {
  const editUrl = `${appUrl}/my/${data.editToken}`
  const from = process.env.EMAIL_FROM ?? "no-reply@example.com"

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2>Merci pour votre inscription, ${data.volunteerName} !</h2>
      <p>Vous êtes inscrit(e) aux créneaux suivants pour <strong>${data.eventTitle}</strong> :</p>
      <ul style="padding-left:1.2em;line-height:1.8">
        ${data.shifts.map((s) => `<li><strong>${s.label}</strong> — ${s.date} de ${s.startTime} à ${s.endTime}</li>`).join("")}
      </ul>
      <p style="margin-top:1.5em">
        <a href="${editUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Voir / annuler mes inscriptions
        </a>
      </p>
      <p style="color:#888;font-size:0.85em;margin-top:2em">Merci pour votre aide précieuse !</p>
    </div>
  `

  const transport = createTransport()

  if (!transport) {
    console.log("[EMAIL - pas de SMTP configuré]")
    console.log(`To: ${data.to} | Sujet: Confirmation — ${data.eventTitle}`)
    console.log(`Lien d'édition : ${editUrl}`)
    return
  }

  await transport.sendMail({
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

  const transport = createTransport()
  if (!transport) return

  const from = process.env.EMAIL_FROM ?? "no-reply@example.com"

  await transport.sendMail({
    from,
    to: adminEmail,
    subject: `Nouvelle inscription — ${data.eventTitle}`,
    html: `
      <p><strong>${data.volunteerName}</strong> (${data.volunteerEmail}) vient de s'inscrire à <strong>${data.eventTitle}</strong>.</p>
      <p>Créneaux : ${data.shifts.map((s) => s.label).join(", ")}</p>
    `,
  })
}
