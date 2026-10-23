import ContentShell from "@/components/public/ContentShell"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

// The browser bar takes the header's colour, white or the dark theme's gray-900.
export const viewport = CONTENT_VIEWPORT

/**
 * The legal documents in the frame of every public content page (#1116): the same header
 * (navigation, « Pour qui ? », theme toggle), the shared prose recipe in a <main>, the site footer
 * after it, and the dark theme. The processing agreement and the sub-processors list are linked
 * from the privacy policy, the terms and each other, not from the footer.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>
}
