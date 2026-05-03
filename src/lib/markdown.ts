/**
 * Minimal Markdown renderer for use in emails and raw HTML.
 * Uses inline styles — no CSS classes.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Renders a small subset of Markdown to HTML with inline styles.
 * Supported: **bold**, [link](url), `- bullet` lists, \n newlines.
 * Text segments are HTML-escaped; already-processed HTML is not double-escaped.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  let inList = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.match(/^-\s+/)) {
      // Bullet item
      if (!inList) {
        output.push('<ul style="padding-left:1.2em;margin:0.5em 0;list-style:disc">')
        inList = true
      }
      const itemText = line.replace(/^-\s+/, "")
      output.push(`<li>${renderInline(itemText)}</li>`)
    } else {
      if (inList) {
        output.push("</ul>")
        inList = false
      }
      if (line === "") {
        output.push("<br>")
      } else {
        output.push(`<p style="margin:0.25em 0">${renderInline(line)}</p>`)
      }
    }
  }

  if (inList) {
    output.push("</ul>")
  }

  return output.join("")
}

/** Renders inline markdown (**bold**, [link](url)) within a single line. */
function renderInline(text: string): string {
  // Process bold and links by splitting on known patterns.
  // We build the result segment by segment to avoid double-escaping.
  let result = ""
  let remaining = text

  while (remaining.length > 0) {
    // Try to match **bold** first
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
    // Try to match [link](url)
    const linkMatch = remaining.match(/^(.*?)\[(.+?)\]\(([^)]+)\)/)

    if (!boldMatch && !linkMatch) {
      // No more special syntax
      result += escapeHtml(remaining)
      break
    }

    // Pick whichever match comes first (shorter prefix)
    const boldPos = boldMatch ? boldMatch[1].length : Infinity
    const linkPos = linkMatch ? linkMatch[1].length : Infinity

    if (boldPos <= linkPos && boldMatch) {
      result += escapeHtml(boldMatch[1])
      result += `<strong>${escapeHtml(boldMatch[2])}</strong>`
      remaining = remaining.slice(boldMatch[0].length)
    } else if (linkMatch) {
      result += escapeHtml(linkMatch[1])
      result += `<a href="${escapeHtml(linkMatch[3])}" style="color:#2563eb">${escapeHtml(linkMatch[2])}</a>`
      remaining = remaining.slice(linkMatch[0].length)
    } else {
      result += escapeHtml(remaining)
      break
    }
  }

  return result
}

/**
 * Replaces {{prenom}}, {{créneau}}, {{date}}, {{heure}} in text with provided values.
 * Unknown keys are left as-is.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  })
}
