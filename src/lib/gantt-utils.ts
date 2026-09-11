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

export function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
}

export function fmt(t: string): string {
  const [h, m] = t.split(":")
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
