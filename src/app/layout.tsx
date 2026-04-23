import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Bénévoles",
  description: "Inscriptions bénévoles",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
