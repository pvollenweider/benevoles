import type { Metadata } from "next"
import "./globals.css"
import { CLEAN_PATH_SCRIPT } from "@/lib/clean-path"

export const metadata: Metadata = {
  title: "Bénévoles",
  description: "Planning et inscriptions des bénévoles pour associations et événements.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <head>
        {/* Before the router starts: `//events` would crash it (#474). See src/lib/clean-path.ts. */}
        <script dangerouslySetInnerHTML={{ __html: CLEAN_PATH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
