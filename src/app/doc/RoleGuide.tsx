import Link from "next/link"
import { legacyAnchorTargets, roleHasDocUnits, type DocRole, type DocUnit } from "@/lib/doc-units"
import { DOC_FAQ, DOC_FAQ_HEADING_ID as FAQ_HEADING_ID, docFaqHref } from "@/lib/doc-faq"
import { docUnitHeadingIds } from "@/lib/public-content"
import DocUnitIndex from "@/components/public/DocUnitIndex"
import DocFrame from "@/components/public/DocFrame"
import LegacyAnchorRedirect from "./LegacyAnchorRedirect"

/**
 * A role's guide, split into units (#649): its title, its introduction (GUIDE_ADMIN.md or
 * GUIDE_BENEVOLE.md, rendered by the page from its Markdown source, the source of truth also
 * readable on GitHub), the questions its readers ask most (DOC_FAQ, src/lib/doc-faq.ts), then the
 * index of that role's units, its groups in the role's order (DOC_ROLE_GROUP_ORDER). One <h1>,
 * then the « Questions fréquentes » and « Toutes les fiches » <h2>, the groups as <h3> under the
 * latter. Old anchors that moved to a unit are followed client-side (LegacyAnchorRedirect).
 */
export default function RoleGuide({ role, units, title, html }: { role: DocRole; units: readonly DocUnit[]; title: string; html: string }) {
  const hasUnits = roleHasDocUnits(units, role)
  const targets = legacyAnchorTargets(role, units, docUnitHeadingIds)
  const faq = DOC_FAQ[role].filter((item) => units.some((u) => u.slug === item.unit))
  return (
    <DocFrame>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {hasUnits && faq.length > 0 && (
        <section aria-labelledby={FAQ_HEADING_ID}>
          <h2 id={FAQ_HEADING_ID}>Questions fréquentes</h2>
          <ul>
            {faq.map((item) => (
              <li key={item.question}>
                <Link href={docFaqHref(item)}>{item.question}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {hasUnits && <DocUnitIndex units={units} role={role} />}
      {Object.keys(targets).length > 0 && <LegacyAnchorRedirect targets={targets} />}
    </DocFrame>
  )
}
