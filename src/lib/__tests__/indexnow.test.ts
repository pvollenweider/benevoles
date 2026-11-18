import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { changedUrls, indexNowBody, INDEXNOW_KEY, INDEXNOW_KEY_FILE } from "../../../scripts/indexnow.mjs"

// IndexNow after each deploy: only the apex pages whose source changed since the deployed commit.
const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset>
<url><loc>https://www.benevol.app/</loc><lastmod>2026-11-18T07:00:00.000Z</lastmod></url>
<url><loc>https://www.benevol.app/tarifs</loc><lastmod>2026-11-01T10:00:00.000Z</lastmod></url>
<url><loc>https://www.benevol.app/doc/rappels</loc></url>
<url><loc>https://www.benevol.app/blog/x</loc><lastmod>2026-11-17</lastmod></url>
<url><loc>https://fete.benevol.app/</loc><lastmod>2026-11-18T07:00:00.000Z</lastmod></url>
</urlset>`

describe("scripts/indexnow.mjs", () => {
  it("keeps the apex pages changed after the date, not the older ones, the undated ones or other hosts", () => {
    expect(changedUrls(xml, new Date("2026-11-10T00:00:00Z"))).toEqual(["https://www.benevol.app/", "https://www.benevol.app/blog/x"])
    expect(changedUrls(xml, new Date("2026-11-18T08:00:00Z"))).toEqual([])
  })

  it("sends the host, the key and where the key file is", () => {
    expect(indexNowBody(["https://www.benevol.app/"])).toEqual({
      host: "www.benevol.app",
      key: INDEXNOW_KEY,
      keyLocation: `https://www.benevol.app/${INDEXNOW_KEY_FILE}`,
      urlList: ["https://www.benevol.app/"],
    })
  })

  it("serves a key file that holds exactly the key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/)
    expect(fs.readFileSync(path.join(process.cwd(), "public", INDEXNOW_KEY_FILE), "utf8")).toBe(INDEXNOW_KEY)
  })

  it("runs in the deploy after the rollout, never failing it, with the deployed commit's date", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/deploy.yml"), "utf8")
    const step = workflow.indexOf("node scripts/indexnow.mjs")
    expect(step).toBeGreaterThan(workflow.indexOf("kubectl rollout status deployment/benevoles-app"))
    expect(workflow.slice(workflow.lastIndexOf("- name:", step), step)).toContain("continue-on-error: true")
    expect(workflow).toContain("SINCE: ${{ steps.deployed.outputs.date }}")
    expect(workflow).toMatch(/id: deployed[\s\S]*?echo "date=\$\(git show -s --format=%cI "\$deployed_sha"\)" >> "\$GITHUB_OUTPUT"/)
  })
})
