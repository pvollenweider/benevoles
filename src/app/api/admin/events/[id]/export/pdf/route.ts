import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { buildDayParts, type VolData, type ShiftRow, type ShowEntry } from "@/lib/pdf-export-gantt"

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        include: {
          registrations: {
            where: { status: { in: ["active", "waiting", "offered"] } },
            include: { volunteer: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // ── Build 3 global sections ───────────────────────────────────────────────
  const dayMap = new Map<string, { date: Date; shifts: ShiftRow[] }>()
  for (const shift of event.shifts) {
    const key = shift.date.toISOString().split("T")[0]
    if (!dayMap.has(key)) dayMap.set(key, { date: shift.date, shifts: [] })
    const shiftRow: ShiftRow = {
      ...(shift as unknown as ShiftRow),
      registrations: shift.registrations.filter((r: { status: string }) => r.status === "active"),
      waitlistEntries: shift.registrations
        .filter((r: { status: string }) => r.status === "waiting" || r.status === "offered")
        .map((r: { volunteer: VolData; status: string; waitingPosition?: number | null }) => ({
          volunteer: r.volunteer,
          status: r.status,
          position: r.waitingPosition ?? null,
        })),
    }
    dayMap.get(key)!.shifts.push(shiftRow)
  }

  const showWaitlist = [...dayMap.values()].some(({ shifts }) =>
    shifts.some((s) => s.waitlistEntries.length > 0)
  )

  const showSchedule = (event.showSchedule as ShowEntry[] | null) ?? []

  let allGantts = ""
  let allRecaps = ""
  for (const [key, { date, shifts }] of dayMap) {
    const dayShows = showSchedule.filter((s) => s.date === key)
    const { gantt, recap } = buildDayParts(date, shifts, dayShows, showWaitlist)
    allGantts += gantt
    allRecaps += recap
  }

  const volMap = new Map<string, VolData>()
  for (const shift of event.shifts) {
    for (const reg of shift.registrations) {
      const volEmail = reg.volunteer.email ?? ""
      if (!volMap.has(volEmail)) volMap.set(volEmail, reg.volunteer)
    }
  }
  const allVols = [...volMap.values()].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")
  )
  const volRows = allVols.map((v) => `<tr>
    <td>${esc(v.lastName)}</td>
    <td>${esc(v.firstName)}</td>
    <td>${esc(v.email ?? "")}</td>
    <td>${esc(v.phone ?? "")}</td>
  </tr>`).join("")

  const ts = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${esc(event.title)} – Export</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      color: #111827;
      background: #fff;
      padding: 20px 24px;
    }

    /* ── Print button ─────────────────────────────────────────────────── */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 2px solid #E5E7EB;
    }
    .print-btn {
      background: #1E40AF;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { background: #1E3A8A; }
    @media print { .toolbar { display: none; } }

    /* ── Header ───────────────────────────────────────────────────────── */
    .event-title { font-size: 17px; font-weight: 700; color: #111827; }
    .event-meta  { font-size: 10px; color: #374151; margin-top: 3px; }

    /* ── Sections ─────────────────────────────────────────────────────── */
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1E40AF;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 2px solid #BFDBFE;
    }
    .day-block { margin-bottom: 14px; page-break-inside: avoid; }
    .day-sub-title {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 5px;
      text-transform: capitalize;
    }

    /* ── Tables ───────────────────────────────────────────────────────── */
    table { border-collapse: collapse; margin-bottom: 4px; width: 100%; }
    th, td {
      border: 1px solid #9CA3AF;
      padding: 4px 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }
    th {
      background: #E5E7EB;
      font-weight: 700;
      font-size: 10px;
      color: #111827;
      white-space: nowrap;
    }
    tr { page-break-inside: avoid; }
    .center { text-align: center; }

    /* ── Gantt ────────────────────────────────────────────────────────── */
    .gantt-table { table-layout: auto; width: auto; }
    .th-role  { min-width: 90px; }
    .th-label { min-width: 100px; }
    .slot-th  {
      min-width: 20px; text-align: center; font-size: 8px;
      color: #374151; border-left: 1px solid #9CA3AF; border-right: 1px solid #9CA3AF;
    }
    .hour-th  { border-left: 2px solid #374151 !important; font-weight: 700; color: #111827; font-size: 9px; }
    .hour-mark { border-left: 2px solid #9CA3AF !important; }

    .role-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-weight: 700;
      font-size: 10px;
      border: 1px solid #93C5FD;
      border-top: 2px solid #1E40AF;
      white-space: normal;
    }
    .label-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-size: 9px;
      border-right: 1px solid #93C5FD;
      white-space: normal;
    }
    /* Shift cells: darker blue for clear print contrast (survives B&W) */
    .shift-cell {
      background: #1E40AF;
      color: #FFFFFF;
      font-size: 9px;
      font-weight: 600;
      text-align: left;
      vertical-align: top;
      white-space: normal;
      line-height: 1.35;
      border-left: 2px solid #FFFFFF !important;
      border-right: 2px solid #FFFFFF !important;
    }
    .empty-cell { background: #F9FAFB; border-left: 1px solid #D1D5DB; border-right: 1px solid #D1D5DB; }
    .show-active { background: #EFF6FF !important; }
    tr.role-last td { border-bottom: 2px solid #FFFFFF !important; }
    tr.role-last .shift-cell { border-bottom: 2px solid #FFFFFF !important; }

    /* ── Show row ─────────────────────────────────────────────────────── */
    .show-row td { border-top: 2px solid #93C5FD; }
    .show-band-cell {
      background: #DBEAFE;
      color: #1E3A8A;
      font-size: 9px;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .show-empty-cell { border-left: 1px solid #D1D5DB; border-right: 1px solid #D1D5DB; }
    .show-label-cell { background: #DBEAFE; border: 1px solid #93C5FD; }

    /* ── Recap ────────────────────────────────────────────────────────── */
    .recap-table { width: 100%; }
    .recap-table td { font-size: 10px; white-space: normal; }
    .recap-table th { font-size: 10px; }
    .role-start td { border-top: 2px solid #374151 !important; }
    .role-end   td { border-bottom: 2px solid #374151 !important; }

    /* ── File d'attente ──────────────────────────────────────────────── */
    .waitlist-th  { color: #78350F; background: #FEF3C7 !important; min-width: 120px; font-size: 10px; }
    .waitlist-cell { font-size: 9px; font-style: italic; color: #374151; white-space: normal; vertical-align: top; }

    /* ── Bénévoles ────────────────────────────────────────────────────── */
    .vol-table { width: 100%; }
    .vol-table td { font-size: 10px; white-space: normal; word-break: break-word; }
    .vol-table th { font-size: 10px; }

    /* ── Page breaks ──────────────────────────────────────────────────── */
    .section-planning { page-break-after: always; }
    .section-recap    { page-break-after: always; }

    /* ── Page setup ───────────────────────────────────────────────────── */
    /* Planning section: landscape for wide Gantt tables */
    @page          { size: A4 portrait;  margin: 1cm 1.2cm; }
    @page planning { size: A4 landscape; margin: 1cm 1.5cm; }
    @page recap    { size: A4 portrait;  margin: 1cm 1.2cm; }
    @page vols     { size: A4 portrait;  margin: 1cm 1.2cm; }

    .section-planning { page: planning; }
    .section-recap    { page: recap; }
    .section-vols     { page: vols; }

    @media print {
      body { padding: 0; }
      .section-title { color: #000 !important; border-bottom-color: #000 !important; }
    }

    /* ── Print color fallback (force background printing) ─────────────── */
    @media print {
      .role-cell, .label-cell, .show-band-cell, .show-label-cell { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .shift-cell { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .empty-cell, .show-active { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <div class="event-title">${esc(event.title)}</div>
      <div class="event-meta">Export du ${esc(ts)}</div>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>

  <section class="section section-planning" aria-label="Planning">
    <h2 class="section-title">Planning</h2>
    ${allGantts}
  </section>

  <section class="section section-recap" aria-label="Récap par poste">
    <h2 class="section-title">Récap par poste</h2>
    ${allRecaps}
  </section>

  <section class="section section-vols" aria-label="Liste des bénévoles">
    <h2 class="section-title">Liste des bénévoles</h2>
    <table class="vol-table">
      <thead>
        <tr>
          <th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th>
        </tr>
      </thead>
      <tbody>${volRows}</tbody>
    </table>
  </section>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
