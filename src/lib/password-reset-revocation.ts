// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Data that revokes a pending password reset link (src/lib/password-recovery.ts), written with
 * every password change and every change of an administrator's address: a link sent before, maybe
 * to the old inbox, must not be able to undo the change. Its own module so the routes that write
 * it import nothing else.
 */
export const RESET_LINK_REVOKED = { passwordResetTokenHash: null, passwordResetExpiresAt: null } as const
