// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

// The activation page is a client component: its title comes from here, as for the login page
// (#1099, #1142). Without it the browser tab shows only the site name.
export const metadata: Metadata = { title: "Activer votre compte" }

export default function AcceptInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}
