import { describe, it, expect } from "vitest"
import { onboardingProgress, onboardingSteps, showOnboarding, type OnboardingFacts } from "../onboarding"

// First-run checklist of an organization (#369).

const fresh: OnboardingFacts = {
  publicTitle: null, charterCustomized: false, timeZone: null,
  firstEventId: null, activeShiftCount: 0, publishedEventUrl: null, registrationCount: 0,
}

describe("onboardingSteps", () => {
  it("lists the steps in order, nothing done for a new organization", () => {
    const steps = onboardingSteps(fresh)
    expect(steps.map((s) => s.id)).toEqual(["organization", "timeZone", "event", "shifts", "publish", "testSignup"])
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(steps.filter((s) => s.optional).map((s) => s.id)).toEqual(["organization", "timeZone"])
  })

  it("derives each step from the data", () => {
    const steps = onboardingSteps({
      ...fresh, publicTitle: "Festival", timeZone: "Europe/Paris",
      firstEventId: "e1", activeShiftCount: 3, publishedEventUrl: "https://org.benevol.app/fete", registrationCount: 1,
    })
    expect(steps.every((s) => s.done)).toBe(true)
  })

  it("links the shift and publish steps to the first event once it exists", () => {
    const before = onboardingSteps(fresh)
    expect(before.find((s) => s.id === "shifts")!.href).toBe("/admin/events/new")
    const after = onboardingSteps({ ...fresh, firstEventId: "e1" })
    expect(after.find((s) => s.id === "shifts")!.href).toBe("/admin/events/e1/shifts")
    expect(after.find((s) => s.id === "publish")!.href).toBe("/admin/events/e1")
  })

  it("sends the test sign-up to the public page once published", () => {
    const step = onboardingSteps({ ...fresh, firstEventId: "e1", publishedEventUrl: "https://org.benevol.app/fete" }).find((s) => s.id === "testSignup")!
    expect(step).toMatchObject({ href: "https://org.benevol.app/fete", external: true })
  })

  it("counts a customized charter as personalization", () => {
    expect(onboardingSteps({ ...fresh, charterCustomized: true })[0].done).toBe(true)
  })
})

describe("progress and visibility", () => {
  it("counts required steps only and points at the next one", () => {
    const p = onboardingProgress(onboardingSteps({ ...fresh, firstEventId: "e1" }))
    expect(p).toMatchObject({ done: 1, total: 4, complete: false })
    expect(p.next?.id).toBe("shifts")
  })

  it("is complete without the optional steps", () => {
    const steps = onboardingSteps({ ...fresh, firstEventId: "e1", activeShiftCount: 2, publishedEventUrl: "u", registrationCount: 1 })
    expect(onboardingProgress(steps)).toMatchObject({ complete: true, next: null })
  })

  it("shows until complete, and not once dismissed", () => {
    const steps = onboardingSteps(fresh)
    expect(showOnboarding(steps, null)).toBe(true)
    expect(showOnboarding(steps, new Date())).toBe(false)
    const done = onboardingSteps({ ...fresh, firstEventId: "e1", activeShiftCount: 2, publishedEventUrl: "u", registrationCount: 1 })
    expect(showOnboarding(done, null)).toBe(false)
  })
})
