import { describe, it, expect, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"

// Regression (#760): the new event form assumed Europe/Zurich for the registration window instead
// of the organisation's own time zone, which the edit form already used.
vi.mock("@/lib/auth-guard", () => ({ getOrgContext: async () => ({ organizationId: "org-a", db: {}, session: {} }) }))
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique: async () => ({ timeZone: "America/Montreal" }) } } }))
vi.mock("@/components/admin/EventForm", () => ({ default: function EventForm() { return null } }))
vi.mock("@/components/admin/EventTemplatePicker", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/admin/WizardSteps", () => ({ default: () => null }))
vi.mock("@/components/admin/HelpLink", () => ({ default: () => null }))

function find(node: ReactNode, name: string): ReactElement | null {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, name); if (hit) return hit }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === "function" && el.type.name === name) return el
  return find(el.props?.children, name)
}

describe("new event page (#760)", () => {
  it("gives the form the organisation's time zone", async () => {
    const { default: NewEventPage } = await import("@/app/admin/events/new/page")
    const form = find(await NewEventPage(), "EventForm") as ReactElement<{ timeZone?: string }> | null
    expect(form?.props.timeZone).toBe("America/Montreal")
  })
})
