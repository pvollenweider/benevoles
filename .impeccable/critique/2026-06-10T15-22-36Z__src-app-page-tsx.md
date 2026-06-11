---
target: src/app/page.tsx
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-06-10T15-22-36Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No loading state or async feedback on mailto CTA; static page otherwise. CTA gives no confirmation that clicking opens a mail client. |
| 2 | Match System / Real World | 3 | Copy is clear and plain-language throughout. Minor: "Tester le projet" on a mailto link is ambiguous — does it start a trial, schedule a demo, or just send an email? |
| 3 | User Control and Freedom | 2 | Primary CTA (mailto:) hijacks mail client with no warning or alternative path. Ghost CTA at bottom repeats the same action. No "what does this cost/how do I sign up" path. |
| 4 | Consistency and Standards | 3 | CTA style inconsistent: hero uses filled white pill, bottom CTA uses outline blue pill — both call the same action. Focus outline offsets differ between CTAs (offset-3 vs offset-2). |
| 5 | Error Prevention | 2 | Both primary CTAs are mailto: links. Users without a mail client get a broken experience. No fallback, no copy-to-clipboard, no web form. |
| 6 | Recognition Rather Than Recall | 3 | All key actions visible. GitHub ghost link in hero competes with primary CTA without clear visual hierarchy difference. |
| 7 | Flexibility and Efficiency | 1 | Zero self-serve path. One rigid action (email) for every persona. GitHub is the only escape valve for any other intent. |
| 8 | Aesthetic and Minimalist Design | 3 | Largely clean. Three-column identical card grid reads as template scaffolding. Hero-to-features ratio is well-managed. |
| 9 | Error Recovery | 2 | No web form means no error recovery context. Mailto silently fails on systems without a configured mail client with no indication to the user. |
| 10 | Help and Documentation | 1 | No documentation, FAQ, demo link, or README link. GitHub link gets to source code; does not explain the product to a non-developer. |
| **Total** | | **23/40** | **Acceptable — significant improvements still needed** |

## Anti-Patterns Verdict

**LLM assessment**: Does not immediately read as AI-generated. The blue-900 hero departs from the cream/beige 2026 default. The copy voice is specific and honest. GitHub presence is real, not decorative.

Where the seams show: the three-column secondary feature grid is textbook AI scaffolding — identical structure, identical cadence, identical absence of visual personality. No image, no screenshot, no demonstrating evidence anywhere on the page. The page describes features in prose but shows nothing. The bottom CTA section is the "closing conversion section" template beat: centered text + small paragraph + pill CTA, structurally identical to 40,000 other landing pages.

**Deterministic scan**: Detector returned [] — no automated anti-pattern hits. No gradient text, no side-stripe borders, no uppercase tracked eyebrows in markup.

**Visual overlays**: Browser automation not available; no injection attempted.

## Overall Impression

The redesign solved the P0s from last time: GitHub is present, the blue hero gives it identity. But the improvement revealed the next layer of problems. The page is now a credible description of Benevol and a completely ineffective demonstration of it. A product whose entire value proposition is "voir la timeline Gantt" never shows one. The friction problem (emailing strangers to get access) is still P0-adjacent. At 23/40, the page sits in "Acceptable" — for a landing page that must convert cold traffic, that is not acceptable.

## What's Working

1. **Hero color and copy alignment are honest.** bg-blue-900 gives the page an identity that isn't the SaaS cream default. The h1 is a genuine benefit statement, not a category claim.
2. **Community section is the most differentiated section.** It trusts the visitor, is honest about project status, and the 2-column layout breaks the centered-block pattern everywhere else.
3. **Accessibility hygiene is above average.** sr-only labels on new-tab links, aria-hidden on decorative SVGs, focus-visible on all interactive elements, textWrap: balance on headings.

## Priority Issues

**[P1] Primary CTA uses mailto: with no fallback and no signal of what happens**
- Why it matters: On machines without a configured mail client, clicking the only CTA silently fails. On mobile, a native dialog appears with no warning. "Tester le projet" implies a self-serve trial, not "email us."
- Fix: Replace or augment with a minimal web form or copy-to-email button. Change label to "Demander un accès" or "Nous contacter." Add a parenthetical promise ("réponse sous 48h").
- Suggested command: /impeccable harden

**[P1] No product evidence anywhere on the page**
- Why it matters: The core value proposition is a Gantt timeline — an unusual affordance most event managers have never seen. Describing it in a subordinate clause and never showing it asks visitors to trust an unverifiable claim.
- Fix: Add a product visual — real screenshot, stylized mockup, or simplified SVG — immediately below or inside the primary feature card.
- Suggested command: /impeccable craft (product screenshot/illustration section)

**[P1] Three-column secondary feature grid is identical-card scaffolding**
- Why it matters: Three li elements with identical structure (bold title + gray paragraph), no visual differentiation despite meaningfully different user-value. "Gantt timeline" (unique USP) treated identically to "exports Excel" (hygiene feature).
- Fix: Either collapse into primary feature prose, or give each a distinctive visual accent (icon, data example, bold pull-quote number) that earns the grid.
- Suggested command: /impeccable layout

**[P2] Bottom CTA is a structural duplicate of hero CTA with a weaker style**
- Why it matters: Same action, different visual weight — hero uses filled primary pill, bottom CTA uses outline ghost pill. The same action appearing twice with inconsistent styling undermines both.
- Fix: Either remove the bottom CTA section or give it a different job with new information. If both kept, they must use consistent pill style.
- Suggested command: /impeccable clarify

**[P2] No motion, no entrance animation, no page-load character**
- Why it matters: Brand register explicitly permits ambitious first-load motion. A fully static page with no imagery and no motion relies entirely on copy to carry the brand.
- Fix: Simple entrance reveal (h1 fade-up, 400ms, prefers-reduced-motion respected) plus hero background texture or depth treatment.
- Suggested command: /impeccable animate

## Persona Red Flags

**Jordan (First-Timer / prospective event organizer)**
- h1 addresses bénévoles, not the organizer reading the page. "Vos bénévoles s'inscrivent" — Jordan IS the organizer, not the volunteer.
- "Tester le projet" as first CTA with mailto is ambiguous. Jordan expects a demo link or sandbox, not "compose an email."
- No product screenshot. Jordan can't visualize whether this would work for her festival.
- After reading the page, all decision-blocking unknowns remain: what does the admin interface look like, how many steps is setup, does it require technical knowledge.

**Casey (Distracted mobile user)**
- On mobile, the "Tester le projet" CTA triggers a native mail-compose dialog. If Casey arrived from a social post, this is a wrong door with no "back" signal, no "this is for organizers" disclaimer.
- GitHub ghost link in hero has no explicit padding; hit area may fall below 44px on small screens (depends on font-size/line-height combination).

**Riley (Stress tester / OSS contributor)**
- No live demo link. Only self-serve path is cloning the repo. Nothing on the page says that's an option.
- No contribution guide linked, no issue count, no star count — signals that communicate "real project" to a technical evaluator are absent.

## Minor Observations

- text-blue-200 on bg-blue-900 for hero paragraph is borderline; verify 3:1 at 18px/400 weight.
- sr-only "Fonctionnalités" label is semantically correct but disconnected from what visual users see; consider whether aria-labelledby is earning its place.
- focus-visible:outline-offset-3 (hero) vs outline-offset-2 (community + bottom CTA): inconsistent focus treatment on same-action CTAs.
- PublicFooter emits mt-12 internally; combined with bottom CTA py-14, bottom spacing exceeds top hero spacing — rhythm inverts.
- Confirm meta description exists in layout.tsx.

## Questions to Consider

- "Utilisé pour de vrais événements" — which ones? A single named example ("festival X, 120 bénévoles, 2025") would do more credibility work than five paragraphs of feature description.
- Is email-us-for-access sustainable, or is self-serve signup the medium-term plan? If the latter, hint at it: "accès sur demande, bientôt en libre-service."
- What does success look like for this page — 1 new org/month, or any developer can self-host? These are different landing pages.
