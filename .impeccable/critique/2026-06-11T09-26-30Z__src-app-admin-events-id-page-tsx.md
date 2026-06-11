---
target: src/app/admin/events/[id]/page.tsx
total_score: 21
p0_count: 1
p1_count: 3
timestamp: 2026-06-11T09-26-30Z
slug: src-app-admin-events-id-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | PublishToggle shows "…" during loading — no aria-live, no spinner, no progress signal. Reminder confirmation result appears inline but has no semantic role. Critical shift fill rates are visible but not ordered by urgency. |
| 2 | Match System / Real World | 3 | French labels are accurate. "Créneaux à pourvoir" is the right field term. Minor: "Restants" is ambiguous — "Places libres" is clearer. |
| 3 | User Control and Freedom | 2 | No undo path on PublishToggle — one tap publishes to the world with zero confirmation. No undo on reminder send after modal dismiss. The "Dépublier" path is the same single-tap danger. |
| 4 | Consistency and Standards | 2 | Three different button radius values (rounded-lg, rounded-xl, rounded-full) in one view. Design system mandates rounded-full for all buttons. SendReminderButton uses bg-orange-600 — violates La Règle du Bleu Unique. |
| 5 | Error Prevention | 1 | PublishToggle has no confirmation for a consequential state change. Missing-message warning is inside the modal, not surfaced before clicking. StatCard Restants highlight is semantically inverted: orange fires when spots are available, not when they're scarce. |
| 6 | Recognition Rather Than Recall | 3 | Text labels throughout. But shift rows lack a direct link to act on them — organizer must remember to navigate to the shifts page separately. Progress bar color semantics are undocumented. |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts. No quick-edit from shift rows. Action row has no visual differentiation between primary workflows and secondary utilities. Alex must scan all 5 links to find the next action. |
| 8 | Aesthetic and Minimalist Design | 2 | SendReminderButton contains two paragraphs of static explanatory copy that adds weight on every visit. StatCard Restants orange highlight creates noise on healthy events. Five equal-weight action links mirror the banned identical-card-grid pattern. |
| 9 | Error Recovery | 1 | PublishToggle silently re-enables on API failure — no error shown. Reminder send shows error text in the same unstyled slot as success with no visual distinction and no retry affordance. |
| 10 | Help and Documentation | 3 | Automatic reminders explanation is well-written. Missing-message warning is surfaced. No preview link for draft events. |
| **Total** | | **21/40** | **Needs work** |

## Anti-Patterns Verdict

**LLM assessment**: Not overtly "AI-generated template" at a glance — French copy is grounded, flat card system is coherent. However two tells surface: StatCard big-number/label pattern matches the banned hero-metric template (small scale, but pattern is there). Five identical ghost-style action buttons match the identical-card-grid lite variant. Together they give a "generated scaffold" feeling that contrasts with the Notion/Linear reference.

**Deterministic scan**: Clean — zero findings from detect.mjs across all four files.

## Overall Impression

A solid functional scaffold that hasn't been tuned for Alex operating at 7am on event day. The information hierarchy is flat. There is no clear answer to "what do I do next?" The single biggest opportunity: establish visual priority order so the most time-sensitive action is obvious at a glance.

## What's Working

1. Critical shift rows are the strongest element. Label + time + progress bar + count in one scannable row answers the most urgent operational question. Should be promoted above the action grid.
2. Reminder confirmation modal is well-designed. Shows recipient count, surfaces missing-message warning, provides a result slot.
3. Flat-by-default philosophy is respected throughout. No decorative shadows, no gradients, no chrome inflation.

## Priority Issues

**[P0] PublishToggle has no error recovery and no confirmation.**
- Why: Silent failure on API error. Accidental publish/unpublish on mobile has no recovery path.
- Fix: Add try/catch and error state inline. Add one-sentence confirmation for the unpublish direction.
- Command: /impeccable harden

**[P1] StatCard Restants highlight is semantically inverted.**
- Why: Orange fires when spots are available (> 0), not when they're scarce. Trains organizers to ignore the signal.
- Fix: Invert condition. Highlight when spotsLeft === 0 or spotsLeft / totalCapacity < 0.15.
- Command: /impeccable polish

**[P1] Action grid has no visual priority hierarchy.**
- Why: Five equal-weight ghost links. Primary workflows (shifts, registrations) have same visual weight as utilities (QR, PDF).
- Fix: Promote primary links to filled-primary style. Demote utilities to text-only. Align radius to design system pill shape.
- Command: /impeccable layout

**[P1] Button shape and color vocabulary is inconsistent with the design system.**
- Why: rounded-lg, rounded-xl, and rounded-full used interchangeably. bg-orange-600 on the reminder button violates La Règle du Bleu Unique.
- Fix: Normalize all action buttons to rounded-full. Replace bg-orange-600 on CTA with bg-blue-600.
- Command: /impeccable polish

**[P2] Communications section is too dense for a returning organizer.**
- Why: Three-bullet automatic reminders info block is static content that never changes. Pushes critical shifts off-screen on typical viewports.
- Fix: Collapse behind a details element or tooltip. The "actifs" status line already communicates enough.
- Command: /impeccable distill

## Persona Red Flags

**Alex (power-user organizer, desktop, time pressure):**
- Critical shifts section is the 4th visual block — her most urgent question is answered last.
- No direct link from each shift row to act on it. Three page loads for an operational action.
- "Dépublier" and "Modifier" are adjacent small touch targets — easy mobile mis-tap with no recovery.
- Inconsistent external-link signaling: Vue publique uses ↗, PDF export uses ↗, but not all external links do.

**Sam (screen reader / keyboard user):**
- Reminder modal is a div, not dialog — no role="dialog", no aria-modal, no focus trap, no focus management.
- PublishToggle "…" loading state has no aria-live region and no aria-busy.
- "Rappels automatiques ✓ actifs" heading contains a raw checkmark emoji in a p element, not a semantic heading.
- QR code link has no context: "QR code" for what? For this event? aria-label should clarify.

## Minor Observations

- criticalShifts filter (capacity - active >= 2) excludes single-capacity shifts entirely.
- "Restants" label is awkward French; "Places libres" or "Disponibles" is clearer.
- Vue publique link only appears when published; a disabled preview link for drafts would help organizers proof before publishing.
- Back link "← Événements" is body-weight text; navigation items per design system should use text-gray-500.

## Questions to Consider

- "If Alex opens this page at 7am on event day, what is the single action she needs in 30 seconds? Is that action the largest tap target on screen?"
- "What does this page look like for a fully-staffed event? Is there anything useful left, or does it collapse to a stat row and links?"
- "What would the page feel like if the title receded and the operational status section led?"
