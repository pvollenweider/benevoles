import ContentShell from "@/components/public/ContentShell"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

export const viewport = CONTENT_VIEWPORT

export default function AccessibilityLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>
}
