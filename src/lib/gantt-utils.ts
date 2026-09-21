export type GanttShow = { name: string; date: string; startTime: string; endTime: string }

export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

// End times at or before their start time are overnight (e.g. 23:00 → 00:00)
export function toMinEnd(end: string, start: string): number {
  const e = toMin(end), s = toMin(start)
  return e <= s ? e + 1440 : e
}

// Minutes since the start of the day as a wall-clock time. The clock wraps at
// midnight (1440 -> 00:00, 1560 -> 02:00) and never goes negative.
export function fromMin(n: number): string {
  const wrapped = ((Math.round(n) % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`
}

// True for a shift that runs past midnight (end at or before start, e.g. 22:00 to 02:00).
export function isOvernight(start: string, end: string): boolean {
  return toMin(end) <= toMin(start)
}

// A shift that carries on into the next morning (end after 00:00). An end at exactly
// midnight is the end of the same day and is not flagged.
export function crossesMidnight(start: string, end: string): boolean {
  return isOvernight(start, end) && toMin(end) > 0
}

// Hour label of an axis position given in hours since the start of the day: the
// clock starts again at zero after midnight (24 -> "00h").
export function hourLabel(h: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, "0")}h`
}

// "HH:MM–HH:MM" for lists, with the clock read modulo 24 and a note when the shift
// runs past midnight ("22:00–02:00 (jusqu'au lendemain)").
export function fmtRange(start: string, end: string): string {
  const clock = (t: string) => {
    const [h, m] = t.split(":")
    return `${String(((parseInt(h, 10) % 24) + 24) % 24).padStart(2, "0")}:${m}`
  }
  const range = `${clock(start)}–${clock(end)}`
  return crossesMidnight(start, end) ? `${range} (jusqu'au lendemain)` : range
}

export function fmt(t: string): string {
  const [hRaw, m] = t.split(":")
  // Legacy data may hold hours above 23 (24:00, 26:00): read them modulo 24.
  const h = String(((parseInt(hRaw, 10) % 24) + 24) % 24).padStart(2, "0")
  return m === "00" ? `${h}h` : `${h}h${m}`
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Greedy interval-graph coloring: overlapping items (same post, same time) get
// distinct lane indices so the timeline can render them on separate sub-rows
// instead of stacking them on top of each other.
export type LaneItem = { id: string; startTime: string; endTime: string }
export function assignLanes(items: LaneItem[]): { lane: Record<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
  const laneEnds: number[] = []
  const lane: Record<string, number> = {}
  for (const it of sorted) {
    const start = toMin(it.startTime)
    const end   = toMinEnd(it.endTime, it.startTime)
    let idx = laneEnds.findIndex(e => e <= start)
    if (idx === -1) { idx = laneEnds.length; laneEnds.push(end) }
    else laneEnds[idx] = end
    lane[it.id] = idx
  }
  return { lane, count: laneEnds.length || 1 }
}
