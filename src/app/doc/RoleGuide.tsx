import { legacyAnchorTargets, roleHasDocUnits, type DocRole, type DocUnit } from "@/lib/doc-units"
import { docUnitHeadingIds } from "@/lib/public-content"
import DocUnitIndex from "@/components/public/DocUnitIndex"
import LegacyAnchorRedirect from "./LegacyAnchorRedirect"

/**
 * A role's guide while it is split into units (#649): its title, the index of that role's units,
 * then the whole guide under « Le guide complet », rendered by the page from its Markdown source
 * (source of truth, also readable on GitHub) with its headings one level down (`shiftHeadings`,
 * the page decides it with roleHasDocUnits, as here). Until the guide has units, the page is the guide
 * alone. Old anchors that moved to a unit are followed client-side (LegacyAnchorRedirect).
 */
export default function RoleGuide({ role, units, title, html }: { role: DocRole; units: readonly DocUnit[]; title: string; html: string }) {
  const hasUnits = roleHasDocUnits(units, role)
  const targets = legacyAnchorTargets(role, units, docUnitHeadingIds)
  return (
    <>
      <h1>{title}</h1>
      {hasUnits && (
        <>
          <DocUnitIndex units={units} role={role} />
          <h2>Le guide complet</h2>
        </>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {Object.keys(targets).length > 0 && <LegacyAnchorRedirect targets={targets} />}
    </>
  )
}
