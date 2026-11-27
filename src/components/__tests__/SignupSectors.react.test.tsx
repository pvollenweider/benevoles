/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"

import DayTimeline, { type TimelineShift } from "../DayTimeline"
import ShiftDayList from "../ShiftDayList"
import EventSectorsOption from "../admin/EventSectorsOption"
import { NO_SECTOR_LABEL, PUBLIC_GROUPING_LABEL } from "@/lib/sectors"

// Shifts grouped by sector on the sign-up page (#1469), when the event chose it.

const sectors = [{ id: "sec-bar", name: "Buvette" }, { id: "sec-park", name: "Parking" }]
const shift = (id: string, over: Partial<TimelineShift> = {}): TimelineShift => ({
  id, roleName: "Bar", label: "Bar", startTime: "18:00", endTime: "20:00", status: "open", capacity: 5, registered: 2, spotsLeft: 3, ...over,
})
// Displayed out of sector order on purpose: « Parking Nord » comes first among the postes.
const day = [
  shift("nord", { roleName: "Parking Nord", label: "Parking Nord", startTime: "08:00", endTime: "10:00", displayOrder: 0, sectorId: "sec-park" }),
  shift("info", { roleName: "Info", label: "Info", startTime: "09:00", endTime: "11:00", displayOrder: 1, sectorId: null }),
  shift("bar", { roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00", displayOrder: 2, sectorId: "sec-bar" }),
  shift("sud", { roleName: "Parking Sud", label: "Parking Sud", startTime: "07:00", endTime: "09:00", displayOrder: 3, sectorId: "sec-park" }),
]
const show = { name: "Concert", date: "2026-07-04", startTime: "20:00", endTime: "21:00" }

describe("ShiftDayList grouped by sector", () => {
  afterEach(cleanup)
  const list = (shifts: TimelineShift[], withSectors = sectors, shows: typeof show[] = []) => render(
    <ShiftDayList shifts={shifts} shows={shows} selected={new Set()} onToggle={() => {}} dayLabel="samedi 4 juillet" sectors={withSectors} />,
  )

  it("puts one heading and one list per sector, in the sectors' order, « Autres postes » last", () => {
    list(day)
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Buvette", "Parking", NO_SECTOR_LABEL])
    const parking = screen.getByRole("list", { name: "Créneaux Parking, samedi 4 juillet" })
    // Inside a group, the start time decides, as in the list without sectors.
    expect(within(parking).getAllByRole("button").map((b) => b.getAttribute("data-shift-id"))).toEqual(["sud", "nord"])
    expect(within(screen.getByRole("list", { name: `Créneaux ${NO_SECTOR_LABEL}, samedi 4 juillet` })).getAllByRole("button")).toHaveLength(1)
  })

  it("keeps the shows out of the sector lists, in their own list first", () => {
    list(day, sectors, [show])
    const shows = screen.getByRole("list", { name: "Spectacles du samedi 4 juillet" })
    expect(shows).toHaveTextContent("Spectacle : Concert")
    expect(screen.getByRole("list", { name: "Créneaux Buvette, samedi 4 juillet" })).not.toHaveTextContent("Spectacle")
    expect(shows.compareDocumentPosition(screen.getAllByRole("heading", { level: 3 })[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("keeps the single list of today when the day has no shift in a sector, or without sectors", () => {
    list([day[1]])
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Créneaux du samedi 4 juillet" })).toBeInTheDocument()
    cleanup()
    list(day, [])
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument()
    expect(screen.getAllByRole("list")).toHaveLength(1)
  })
})

describe("DayTimeline grouped by sector", () => {
  afterEach(cleanup)
  const frise = () => render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi 4 juillet" sectors={sectors} />)

  it("wraps each sector's bars in a group named by its band, in the sectors' order", () => {
    frise()
    const groups = screen.getAllByRole("group")
    expect(groups.map((g) => g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Buvette", "Parking", NO_SECTOR_LABEL])
    const parking = screen.getByRole("group", { name: "Parking" })
    expect(within(parking).getAllByRole("button").map((b) => b.getAttribute("data-shift-id"))).toEqual(["nord", "sud"])
    // The bands carry no control: the arrows go from bar to bar.
    expect(within(screen.getByText("Parking").parentElement!).queryByRole("button")).toBeNull()
  })

  it("starts the tab stop on the first bar of the first sector, and moves down across a band", () => {
    frise()
    const bar = (id: string) => document.querySelector<HTMLButtonElement>(`[data-shift-id="${id}"]`)!
    expect(bar("bar")).toHaveAttribute("tabindex", "0")
    expect(bar("nord")).toHaveAttribute("tabindex", "-1")
    bar("bar").focus()
    fireEvent.keyDown(bar("bar"), { key: "ArrowDown" })
    expect(document.activeElement?.getAttribute("data-shift-id")).toBe("nord")
  })

  it("draws no group without sectors, and gives each frise its own band ids", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} sectors={[]} />)
    expect(screen.queryByRole("group")).toBeNull()
    cleanup()
    render(<>{[0, 1].map((k) => <DayTimeline key={k} shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} sectors={sectors} />)}</>)
    const ids = screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("draws no band without a sector on the day", () => {
    render(<DayTimeline shifts={[day[1]]} shows={[]} selected={new Set()} onToggle={() => {}} sectors={sectors} />)
    expect(screen.queryByRole("group")).toBeNull()
    expect(screen.queryByText(NO_SECTOR_LABEL)).toBeNull()
  })
})

describe("EventSectorsOption: the sign-up page grouping", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("is offered once the event adopted sectors, off by default, with its hint", () => {
    render(<EventSectorsOption eventId="evt-1" initialEnabled adopted />)
    const sw = screen.getByRole("switch", { name: PUBLIC_GROUPING_LABEL })
    expect(sw).toHaveAttribute("aria-checked", "false")
    expect(sw).toHaveAccessibleDescription(/Les bénévoles voient alors le nom de vos secteurs/)
  })

  it("is not offered before a sector exists", () => {
    render(<EventSectorsOption eventId="evt-1" initialEnabled adopted={false} />)
    expect(screen.queryByRole("switch", { name: PUBLIC_GROUPING_LABEL })).toBeNull()
  })

  it("turns on once the server agreed, and says so", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicSectorGrouping: true }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<EventSectorsOption eventId="evt-1" initialEnabled adopted />)
    fireEvent.click(screen.getByRole("switch", { name: PUBLIC_GROUPING_LABEL }))
    expect(await screen.findByText("Regroupement activé : la page d'inscription montre vos secteurs.")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: PUBLIC_GROUPING_LABEL })).toHaveAttribute("aria-checked", "true")
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/sectors/public", expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: true }) }))
  })

  it("stays off and names the problem when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Refusé." }) }))
    render(<EventSectorsOption eventId="evt-1" initialEnabled adopted />)
    fireEvent.click(screen.getByRole("switch", { name: PUBLIC_GROUPING_LABEL }))
    expect(await screen.findByText("Refusé.")).toHaveAttribute("role", "alert")
    expect(screen.getByRole("switch", { name: PUBLIC_GROUPING_LABEL })).toHaveAttribute("aria-checked", "false")
  })
})
