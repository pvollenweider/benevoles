import ContentShell from "@/components/public/ContentShell"

// The documentation shares its header and footer with the features page
// (src/components/public/ContentShell.tsx); each page draws its own <main> with DocFrame, so a
// unit's side menu can sit beside it (src/components/public/DocFrame.tsx).
export default function DocLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell layout="doc">{children}</ContentShell>
}
