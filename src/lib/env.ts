import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL doit être une adresse email valide"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD est requis"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL doit être une URL valide").optional(),
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
