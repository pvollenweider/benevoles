import Link from "next/link"
import { legacyAnchorTargets, roleHasDocUnits, type DocRole, type DocUnit } from "@/lib/doc-units"
import { DOC_FAQ, docFaqHref } from "@/lib/doc-faq"
import { docUnitHeadingIds } from "@/lib/public-content"
import DocUnitIndex from "@/components/public/DocUnitIndex"
import LegacyAnchorRedirect from "./LegacyAnchorRedirect"

/**
 * The id of the « Questions fréquentes » block. Not « questions-frequentes »: that old anchor of
 * both guides now leads to their FAQ unit (legacy), and an id still on the page would keep it here.
 */
const FAQ_HEADING_ID = "faq-du-guide"

/**
 * A role's guide while it is split into units (#649): its title, the questions its readers ask
 * most (DOC_FAQ, src/lib/doc-faq.ts), the index of that role's units, then the whole guide under
 * « Le guide complet », rendered by the page from its Markdown source (source of truth, also
 * readable on GitHub) with its headings one level down (`shiftHeadings`, the page decides it with
 * roleHasDocUnits, as here). Until the guide has units, the page is the guide alone; once no guide
 * is left (`html` null, the volunteer guide), the page is the questions and the index alone. Old
 * anchors that moved to a unit are followed client-side (LegacyAnchorRedirect).
 */
export default function RoleGuide({ role, units, title, html }: { role: DocRole; units: readonly DocUnit[]; title: string; html: string | null }) {
  const hasUnits = roleHasDocUnits(units, role)
  const targets = legacyAnchorTargets(role, units, docUnitHeadingIds)
  const faq = DOC_FAQ[role].filter((item) => units.some((u) => u.slug === item.unit))
  return (
    <>
      <h1>{title}</h1>
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
      {html !== null && (
        <>
          {hasUnits && <h2>Le guide complet</h2>}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
      {Object.keys(targets).length > 0 && <LegacyAnchorRedirect targets={targets} />}
    </>
  )
}
