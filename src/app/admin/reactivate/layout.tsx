// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

// The request page is a client component: its title comes from here (#811).
export const metadata: Metadata = { title: "Réactiver mon espace", robots: { index: false } }

export default function ReactivateLayout({ children }: { children: React.ReactNode }) {
  return children
}
