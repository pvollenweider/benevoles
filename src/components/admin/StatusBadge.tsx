export default function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Brouillon", className: "bg-gray-100 text-gray-600" },
    published: { label: "Publié", className: "bg-green-100 text-green-700" },
    archived: { label: "Archivé", className: "bg-yellow-100 text-yellow-700" },
    open: { label: "Ouvert", className: "bg-green-100 text-green-700" },
    full: { label: "Complet", className: "bg-blue-100 text-blue-700" },
    closed: { label: "Fermé", className: "bg-gray-100 text-gray-600" },
    cancelled: { label: "Annulé", className: "bg-red-100 text-red-700" },
  }

  const config = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
