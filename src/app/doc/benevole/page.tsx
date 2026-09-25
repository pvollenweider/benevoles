import fs from "fs"
import path from "path"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"

export const metadata = { title: "Guide bénévole — benevol.app" }

// Rendered from the repo's own GUIDE_BENEVOLE.md — see src/app/doc/admin/page.tsx for why the
// Dockerfile needs an explicit COPY for this file under output: "standalone".
export default function DocBenevolePage() {
  const raw = fs.readFileSync(path.join(process.cwd(), "GUIDE_BENEVOLE.md"), "utf-8")
  // shiftHeadings: false — see src/app/doc/admin/page.tsx.
  const body = raw.replace(/^# .+\n/, "")
  const html = renderEventPageMarkdown(body, { shiftHeadings: false })

  return (
    <>
      <h1>Guide bénévole</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
