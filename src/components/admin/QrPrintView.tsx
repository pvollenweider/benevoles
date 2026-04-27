"use client"

import Link from "next/link"

type Props = {
  eventId: string
  title: string
  location: string | null
  startDate: string
  endDate: string
  publicUrl: string
  backHref: string
}

function formatDateRange(startISO: string, endISO: string) {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString("fr-FR", opts)
  }
  return `${start.toLocaleDateString("fr-FR", opts)} → ${end.toLocaleDateString("fr-FR", opts)}`
}

export default function QrPrintView({
  eventId,
  title,
  location,
  startDate,
  endDate,
  publicUrl,
  backHref,
}: Props) {
  const pngUrl = `/api/admin/events/${eventId}/qr?format=png`
  const svgUrl = `/api/admin/events/${eventId}/qr?format=svg`

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={backHref} className="text-sm text-blue-600">← Retour à l&apos;événement</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">QR code</h1>
        </div>
        <div className="flex gap-2">
          <a
            href={pngUrl}
            download={`qr-${eventId}.png`}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Télécharger PNG
          </a>
          <a
            href={svgUrl}
            download={`qr-${eventId}.svg`}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Télécharger SVG
          </a>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Imprimer
          </button>
        </div>
      </div>

      <div className="print-page bg-white border border-gray-200 rounded-2xl p-8 mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-600">{formatDateRange(startDate, endDate)}</p>
        {location && <p className="text-sm text-gray-500 mt-1">📍 {location}</p>}

        <div className="my-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pngUrl}
            alt={`QR code vers ${publicUrl}`}
            className="w-72 h-72"
          />
        </div>

        <p className="text-base font-medium text-gray-700 mb-1">Scanner pour s&apos;inscrire</p>
        <p className="text-xs text-gray-500 break-all">{publicUrl}</p>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          body { background: white; }
          .no-print { display: none !important; }
          .print-page {
            border: none !important;
            box-shadow: none !important;
            margin: 0 auto !important;
          }
        }
      `}</style>
    </div>
  )
}
