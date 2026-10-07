import type { Metadata } from "next"
import { connection } from "next/server"
import "./globals.css"
import { CLEAN_PATH_SCRIPT } from "@/lib/clean-path"
import { apexBaseUrl } from "@/lib/urls"

// Every page's absolute URLs (metadataBase, canonical, Open Graph, structured data) come from
// NEXT_PUBLIC_APP_URL, which only the running container has: the image is built without it. So no
// page is prerendered at build time, where they would all say http://localhost:3000; awaiting
// connection() here renders them per request, with the deployment's real address.
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return {
    // Resolves relative image URLs (the social cards) to absolute ones, as crawlers require.
    metadataBase: new URL(apexBaseUrl()),
    title: "Bénévoles",
    description: "Planning et inscriptions des bénévoles pour associations et événements.",
  }
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
