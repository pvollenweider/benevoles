import { docUnitAudience, docUnitsByGroup, type DocRole, type DocUnit } from "@/lib/doc-units"
import { docUnitQuestions } from "@/lib/doc-search"
import DocUnitFilterList, { type DocIndexGroup } from "./DocUnitFilterList"

/**
 * The index of the documentation units (#649): a « ## » heading, then one « ### » heading per group
 * and the list of its units, each linked by its title and followed by its summary, with a filter
 * above them (DocUnitFilterList: every link is server-rendered, the field appears once hydrated).
 * On /doc (every unit, no `role`), each group heading has the group's id, the target of a unit's
 * breadcrumb, and each unit says who it is for. On a guide's page, only that role's units, without
 * ids (the guide's own heading ids stay as they were) and without « Pour : », which would only
 * repeat the page's audience. The filter also searches the questions a unit's page answers (its
 * « ### » headings), passed as plain strings.
 */
export default function DocUnitIndex({ units, role }: { units: readonly DocUnit[]; role?: DocRole }) {
  const groups: DocIndexGroup[] = docUnitsByGroup(units, role).map(({ group, units: inGroup }) => ({
    id: group.id,
    title: group.title,
    anchor: role ? undefined : group.id,
    items: inGroup.map((unit) => ({
      slug: unit.slug,
      title: unit.title,
      summary: unit.summary,
      questions: docUnitQuestions(unit.body),
      audience: role ? undefined : docUnitAudience(unit),
    })),
  }))
  if (groups.length === 0) return null
  return (
    <>
      <h2>Toutes les fiches</h2>
      <DocUnitFilterList groups={groups} />
    </>
  )
}
