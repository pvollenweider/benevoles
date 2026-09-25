import fs from "fs"
import path from "path"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"

export const metadata = { title: "Guide administrateur — benevol.app" }

// Rendered from the repo's own GUIDE_ADMIN.md (source of truth, also readable on GitHub) — see
// the Dockerfile, which copies this file into the runtime image alongside prisma/ since
// `output: "standalone"` only traces files Next itself detects, not an fs.readFileSync path.
export default function DocAdminPage() {
  const raw = fs.readFileSync(path.join(process.cwd(), "GUIDE_ADMIN.md"), "utf-8")
  // The file's own "# Guide administrateur" becomes this page's <h1> instead of a duplicate —
  // shiftHeadings: false because the remaining headings (##, ###...) already sit one level
  // below it and must render at their literal depth, not shifted again.
  const body = raw.replace(/^# .+\n/, "")
  const html = renderEventPageMarkdown(body, { shiftHeadings: false })

  return (
    <>
      <h1>Guide administrateur</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
