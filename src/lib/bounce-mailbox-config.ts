// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Optional IMAP settings of the mailbox that receives deferred bounces (#602). All optional:
 * without a user and a password the scheduled reader does nothing and the health page says
 * « non configuré ». Kept free of Prisma and imapflow so the health page and its tests can read
 * the configuration without opening a mailbox.
 */

export type BounceMailboxConfig = {
  host: string
  port: number
  user: string
  password: string
  processedFolder: string
}

export const DEFAULT_IMAP_HOST = "mail.gandi.net"
export const DEFAULT_IMAP_PORT = 993
export const DEFAULT_PROCESSED_FOLDER = "Rejets traités"

type Env = Record<string, string | undefined>

/** The settings, or null when the mailbox is not configured (no user, or no password). */
export function bounceMailboxConfigFrom(source: Env = process.env): BounceMailboxConfig | null {
  const user = source.IMAP_USER?.trim()
  const password = source.IMAP_PASSWORD
  if (!user || !password) return null

  const rawPort = source.IMAP_PORT?.trim()
  const port = rawPort ? Number(rawPort) : DEFAULT_IMAP_PORT
  return {
    host: source.IMAP_HOST?.trim() || DEFAULT_IMAP_HOST,
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_IMAP_PORT,
    user,
    password,
    processedFolder: source.IMAP_PROCESSED_FOLDER?.trim() || DEFAULT_PROCESSED_FOLDER,
  }
}

export function bounceMailboxConfigured(source: Env = process.env): boolean {
  return bounceMailboxConfigFrom(source) !== null
}
