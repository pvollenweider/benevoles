export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12 prose prose-sm prose-gray">
        {children}
      </div>
    </div>
  )
}
