import { createHash } from "crypto"
import { docUnitAudience, docUnitsByGroup, type DocRole, type DocUnit } from "@/lib/doc-units"
import { docUnitQuestionAnchors, docUnitSections } from "@/lib/doc-search"
import DocUnitFilterList, { type DocIndexGroup } from "./DocUnitFilterList"
import { freshness } from "@/lib/freshness"

/** The id of « Toutes les fiches », which names its region (prefixed: never a Markdown heading's slug). */
const INDEX_HEADING_ID = "doc-toutes-les-fiches"

/**
 * The index of the documentation units (#649): a « ## » heading, then one « ### » heading per group
 * and the list of its units, each linked by its title and followed by its summary, with a filter
 * above them (DocUnitFilterList: every link is server-rendered, the field appears once hydrated).
 * On /doc (every unit, no `role`), each group heading has the group's id, the target of a unit's
 * breadcrumb, and each unit says who it is for. On a guide's page, only that role's units, without
 * ids (the guide's own heading ids stay as they were) and without « Pour : », which would only
 * repeat the page's audience. The filter also searches every « ## » and « ### » heading of a
 * unit's page, server-rendered with it, and the body words and ranking of the MiniSearch index
 * (src/lib/doc-search-index.ts), fetched from /api/public/doc-index on the reader's first
 * interaction: a unit found by a heading or by its body links to the matching headings under the
 * result.
 */
export default function DocUnitIndex({ units, role, now = new Date() }: { units: readonly DocUnit[]; role?: DocRole; now?: Date }) {
  const groups: DocIndexGroup[] = docUnitsByGroup(units, role).map(({ group, units: inGroup }) => ({
    id: group.id,
    title: group.title,
    anchor: role ? undefined : group.id,
    items: inGroup.map((unit) => {
      const questions = docUnitQuestionAnchors(unit.body)
      const label = freshness(unit.freshness ?? {}, now)
      return {
        ...(label ? { freshness: label } : {}),
        slug: unit.slug,
        title: unit.title,
        summary: unit.summary,
        questions: questions.map((q) => q.text),
        questionIds: questions.map((q) => q.id),
        sections: docUnitSections(unit.body),
        audience: role ? undefined : docUnitAudience(unit),
      }
    }),
  }))
  if (groups.length === 0) return null
  return (
    <section aria-labelledby={INDEX_HEADING_ID}>
      <h2 id={INDEX_HEADING_ID}>Toutes les fiches</h2>
      <DocUnitFilterList groups={groups} role={role} indexVersion={docIndexVersion(units)} />
    </section>
  )
}

/**
 * A fingerprint of the units' content, added to the index URL: the index is rebuilt at every
 * deploy (its route is static), and a changed guide changes the URL, so no browser keeps the
 * previous index for the hour it may cache it.
 */
export function docIndexVersion(units: readonly DocUnit[]): string {
  const hash = createHash("sha256")
  for (const unit of units) hash.update(`${unit.slug}\n${unit.title}\n${unit.summary}\n${unit.body}\n`)
  return hash.digest("hex").slice(0, 12)
}
