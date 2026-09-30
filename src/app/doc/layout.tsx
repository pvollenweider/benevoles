import ContentShell from "@/components/public/ContentShell"

// The documentation shares its frame with the features page (src/components/public/ContentShell.tsx).
export default function DocLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>
}
