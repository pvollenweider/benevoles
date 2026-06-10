import { z } from "zod"

// Variables runtime indispensables à l'app. ADMIN_EMAIL / ADMIN_PASSWORD
// ne sont utilisées que par `prisma/seed.ts` (jamais par l'app), donc
// elles n'ont pas leur place ici — elles cassaient le build d'image
// Docker quand elles n'étaient pas fournies en build args.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL doit être une URL valide").optional(),
  CRON_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  ADMIN_NOTIFICATION_EMAIL: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),
})

function parseEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const messages = result.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    console.error("\n❌ Variables d'environnement manquantes ou invalides :\n" + messages.join("\n") + "\n")
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()
