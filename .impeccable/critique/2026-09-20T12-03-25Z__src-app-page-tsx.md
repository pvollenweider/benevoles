---
target: src/app/page.tsx
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-09-20T12-03-25Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Org page lists past published events as open ("N places à pourvoir"): no date filter, oldest first |
| 2 | Match System / Real World | 3 | Plain French; "Tester le projet" is a mailto link; header hard-codes "nos spectacles" |
| 3 | User Control and Freedom | 3 | Both CTAs are mailto with no fallback |
| 4 | Consistency and Standards | 2 | "Complet" is green here, blue in DESIGN.md, grey on the timeline; hero and feature blocks use different container widths |
| 5 | Error Prevention | 2 | Past events selectable; mailto-only contact |
| 6 | Recognition Rather Than Recall | 3 | Actions visible; GitHub ghost link competes with primary CTA |
| 7 | Flexibility and Efficiency | 2 | No login link anywhere for returning organizers |
| 8 | Aesthetic and Minimalist Design | 3 | Clean; default Tailwind blue-900 hero reads as generic SaaS |
| 9 | Error Recovery | 2 | Empty state ("Aucun événement en cours") offers no next step |
| 10 | Help and Documentation | 2 | No link to the guides or a "how it works" |
| **Total** | | **24/40** | **Acceptable** |

## Priority issues

- [P1] Past events shown as open on the org page (src/app/page.tsx:23-36, no endDate filter, orderBy startDate asc).
- [P1] Low-contrast text: footer (CGU, Confidentialite) and event location use text-gray-400 (2.54:1 on white); empty state too.
- [P1] No path to /admin/login from the landing page or footer.
- [P2] Landing page runs the full events query before deciding to render the marketing page (src/app/page.tsx:23 vs :45).
- [P2] Org page header ignores the organization name; copy assumes "spectacles".
- [P2] Status badge colors ("Complet" green) contradict DESIGN.md (full = blue) and the timeline (grey).
- [P3] Straight apostrophes, decorative arrow not aria-hidden on event cards, README screenshots predate the current mockup.

## Deterministic scan

detect.mjs: 2 advisory hits (rgba purple in the Gantt mockup, intentional illustration). Browser overlay not run: the app was not running locally.
