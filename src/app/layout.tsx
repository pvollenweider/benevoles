import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Bénévoles",
  description: "Planning et inscriptions des bénévoles pour associations et événements.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
