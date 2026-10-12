/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import NotificationSettingsForm from "../admin/NotificationSettingsForm"
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notification-settings"

// #928: beside its long help text, « Prévenir en cas de désistement » had its checkbox shrunk by
// the flex row, out of line with the others. Every checkbox keeps its size and its label.
describe("NotificationSettingsForm checkboxes", () => {
  afterEach(cleanup)

  it("never lets a checkbox shrink, and keeps each one named by its label (regression)", () => {
    render(<NotificationSettingsForm initialSettings={DEFAULT_NOTIFICATION_SETTINGS} initialReplyTo={null} adminEmail="admin@example.org" />)
    const withdrawal = screen.getByRole("checkbox", { name: "Prévenir en cas de désistement" })
    expect(withdrawal).toHaveClass("shrink-0", "h-4", "w-4")
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes.length).toBeGreaterThanOrEqual(6)
    for (const box of boxes) {
      expect(box).toHaveClass("shrink-0")
      expect(box).toHaveAccessibleName()
    }
  })
})
