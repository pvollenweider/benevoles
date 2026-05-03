import webpush from "web-push"
import { prisma } from "./prisma"

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL ?? process.env.EMAIL_FROM ?? "mailto:admin@benevol.app"

  if (!publicKey || !privateKey) return

  const mailtoEmail = email.includes("<")
    ? `mailto:${email.match(/<(.+)>/)?.[1] ?? "admin@benevol.app"}`
    : email.startsWith("mailto:")
    ? email
    : `mailto:${email}`

  webpush.setVapidDetails(mailtoEmail, publicKey, privateKey)
  configured = true
}

export async function sendPushToEmail(
  email: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  ensureConfigured()
  if (!configured) return

  const subs = await prisma.pushSubscription.findMany({ where: { email } })
  const dead: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          JSON.stringify(payload),
          { TTL: 3 * 24 * 3600 }
        )
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
      }
    })
  )

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {})
  }
}
