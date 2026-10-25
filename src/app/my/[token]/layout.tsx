// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

// The page is a client component: its title comes from here, the name the emails' buttons and the
// guides give it (#1099). A personal page is never indexed.
export const metadata: Metadata = { title: "Mes inscriptions", robots: { index: false } }

export default function MyRegistrationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
