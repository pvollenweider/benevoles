// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { signOut } from "next-auth/react"

/**
 * « Se déconnecter » of the admin, one definition: the user menu of the top bar and the
 * front-desk landing page (#1142) both call it. next-auth ends the session on the server too
 * (events.signOut in src/auth.ts, revokeSession), then opens the login page.
 */
export const signOutOfAdmin = () => signOut({ callbackUrl: "/admin/login" })
