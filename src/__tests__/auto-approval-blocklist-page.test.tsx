/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"

// The super admin sign-up page shows « Validation automatique des nouveaux espaces » on the hosted
// service only (#1371); a self-hosted instance never renders it and never reads its setting.
const auth = vi.hoisted(() => vi.fn())
const hosted = vi.hoisted(() => vi.fn())
const readAuto = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }) }))
vi.mock("@/lib/prisma", () => ({ prisma: { signupBlock: { findMany: vi.fn(async () => []) } } }))
vi.mock("@/lib/signup-switch", () => ({ readSignupSwitch: vi.fn(async () => ({ open: true, closedBy: null })) }))
vi.mock("@/lib/site", () => ({ isHostedService: hosted }))
vi.mock("@/lib/auto-approval-server", () => ({ readAutoApprovalView: readAuto }))

import BlocklistPage from "@/app/super-admin/blocklist/page"
import { autoApprovalView } from "@/lib/auto-approval"

function find(node: ReactNode, name: string): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, name); if (hit) return hit }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === "function" && el.type.name === name) return el as ReactElement<Record<string, unknown>>
  return find(el.props?.children, name)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: "sa-1", role: "super_admin", organizationId: null } })
  readAuto.mockResolvedValue(autoApprovalView(null, new Date()))
})
afterEach(cleanup)

describe("the automatic validation section of the sign-up page (#1371)", () => {
  it("renders the section on the hosted service, beside the sign-up switch", async () => {
    hosted.mockReturnValue(true)
    const tree = await BlocklistPage()
    expect(find(tree, "AutoApprovalSettings")).not.toBeNull()
    expect(find(tree, "SignupSwitch")).not.toBeNull()
    expect(readAuto).toHaveBeenCalledOnce()
  })

  it("does not render it, and does not read the setting, on a self-hosted instance", async () => {
    hosted.mockReturnValue(false)
    const tree = await BlocklistPage()
    expect(find(tree, "AutoApprovalSettings")).toBeNull()
    expect(find(tree, "SignupSwitch")).not.toBeNull()
    expect(readAuto).not.toHaveBeenCalled()
  })

  it("does not render the client section when the server tree has no setting", async () => {
    hosted.mockReturnValue(false)
    render(await BlocklistPage())
    expect(screen.queryByRole("heading", { name: "Validation automatique des nouveaux espaces" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Inscriptions et blocage" })).toBeInTheDocument()
  })
})
