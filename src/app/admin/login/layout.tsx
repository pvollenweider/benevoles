// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

// The login page is a client component: its title comes from here, the name of the footer link
// that leads to it (#1099).
export const metadata: Metadata = { title: "Espace organisateur" }

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
