// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { VOLUNTEER_MANIFEST_PATH } from "@/lib/volunteer-manifest"

// The page is a client component: its title comes from here, the name the emails' buttons and the
// guides give it (#1099). A personal page is never indexed. The web app manifest (#593) is linked
// from this page only: it is the one page of the site meant to be installed, and its manifest has
// no start address, so the installed app opens the page it was installed from (see
// src/lib/volunteer-manifest.ts). The Home Screen name on iPhone comes from appleWebApp.title.
export const metadata: Metadata = {
  title: "Mes inscriptions",
  robots: { index: false },
  manifest: VOLUNTEER_MANIFEST_PATH,
  appleWebApp: { title: "Mes inscriptions" },
}

export default function MyRegistrationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
