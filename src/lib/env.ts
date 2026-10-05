// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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
  // Daily check against GitHub releases (#612), self-hosted instances only. Default on; "off"
  // disables it completely (no outbound request at all). benevol.app keeps the default — it's
  // deployed from main, so its version is never behind the latest release.
  RELEASE_CHECK: z.string().optional(),
  /** Commit deployed, set by the image build (#383). */
  GIT_SHA: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  ADMIN_NOTIFICATION_EMAIL: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),
  // Encryption of volunteer-facing tokens (#290, src/lib/token-vault.ts). Optional: without it
  // tokens stay in clear. Validated here so a malformed key fails at boot, not on a sign-up.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || Buffer.from(v.trim(), "base64").length === 32, "TOKEN_ENCRYPTION_KEY doit faire 32 octets encodés en base64"),
  // Base URL serving the rendered video files (#644): https://medias.benevol.app in production,
  // http://localhost:<port> with `make video-media-serve` locally. Without it, /videos/[id] shows
  // "Vidéo bientôt disponible" instead of a player (src/lib/video-catalog.ts `videoMediaUrls`).
  VIDEO_MEDIA_BASE_URL: z.string().url("VIDEO_MEDIA_BASE_URL doit être une URL valide").optional(),
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

/** `RELEASE_CHECK=off` (case-insensitive) disables the self-hosted release check (#612) completely; anything else, or unset, keeps it on. */
export function releaseCheckEnabled(): boolean {
  return env.RELEASE_CHECK?.trim().toLowerCase() !== "off"
}
