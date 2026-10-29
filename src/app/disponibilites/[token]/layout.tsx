// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"

// The page « Mes disponibilités » (#1146) is a client component: its default title comes from here,
// the page sets the event's name once loaded. A personal link is never indexed (robots.txt too).
export const metadata: Metadata = {
  title: "Mes disponibilités",
  robots: { index: false },
}

export default function MyAvailabilityLayout({ children }: { children: React.ReactNode }) {
  return children
}
