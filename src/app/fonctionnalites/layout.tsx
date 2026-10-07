import ContentShell from "@/components/public/ContentShell"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

export const viewport = CONTENT_VIEWPORT

// The wide frame (`layout="doc"`): the page draws its own <main> (src/components/public/FeaturesPage.tsx).
export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell layout="doc">{children}</ContentShell>
}
