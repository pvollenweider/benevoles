import { Fragment } from "react"
import Link from "next/link"
import { docUnitAudience, docUnitsByGroup, type DocRole, type DocUnit } from "@/lib/doc-units"

/**
 * The index of the documentation units (#649), server-rendered (plain links, no script): a « ## »
 * heading, then one « ### » heading per group and the list of its units, each linked by its title
 * and followed by its summary. On /doc (every unit, no `role`), each group heading has the group's
 * id, the target of a unit's breadcrumb, and each unit says who it is for. On a guide's page, only
 * that role's units, without ids: the guide's own heading ids stay as they were.
 */
export default function DocUnitIndex({ units, role }: { units: readonly DocUnit[]; role?: DocRole }) {
  const groups = docUnitsByGroup(units, role)
  if (groups.length === 0) return null
  return (
    <>
      <h2>Pages par thème</h2>
      {groups.map(({ group, units: inGroup }) => (
        <Fragment key={group.id}>
          <h3 id={role ? undefined : group.id}>{group.title}</h3>
          <ul>
            {inGroup.map((unit) => (
              <li key={unit.slug}>
                <Link href={`/doc/${unit.slug}`}>{unit.title}</Link>&nbsp;: {unit.summary}
                {!role && <> Pour&nbsp;: {docUnitAudience(unit)}.</>}
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </>
  )
}
