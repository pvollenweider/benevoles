import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

// Plain HTTP answered Traefik's bare 404 for every non-token URL (#759): a catch-all route on the
// web entry point now redirects every benevol.app host to https.
const manifest = readFileSync(join(process.cwd(), "k8s/ingressroute-http.yaml"), "utf8")
const tokens = readFileSync(join(process.cwd(), "k8s/ingressroute-tokens.yaml"), "utf8")
const workflow = readFileSync(join(process.cwd(), ".github/workflows/deploy.yml"), "utf8")

describe("HTTP to HTTPS route (#759)", () => {
  it("listens on the web entry point only and redirects with the https middleware", () => {
    const entryPoints = /entryPoints:\s*\n((?:\s*- \S+\s*\n)+)/.exec(manifest)?.[1].match(/- (\S+)/g)
    expect(entryPoints).toEqual(["- web"])
    expect(manifest).toMatch(/middlewares:\s*\n\s*- name: benevoles-https-redirect/)
    // The middleware it uses is the permanent redirectScheme of the token routes.
    expect(tokens).toMatch(/name: benevoles-https-redirect[\s\S]*?redirectScheme:\s*\n\s*scheme: https\s*\n\s*permanent: true/)
  })

  it("covers the apex and every subdomain", () => {
    const match = /match: (.+)/.exec(manifest)?.[1] ?? ""
    expect(match).toContain("Host(`benevol.app`)")
    const regexp = new RegExp(/HostRegexp\(`([^`]+)`\)/.exec(match)![1])
    for (const host of ["www.benevol.app", "medias.benevol.app", "fete-du-village.benevol.app"]) expect(regexp.test(host), host).toBe(true)
    expect(regexp.test("evil-benevol.app")).toBe(false)
  })

  it("sends the bare domain straight to www over https, in one hop, above the catch-all", () => {
    const regex = /redirectRegex:\s*\n\s*regex: '([^']+)'/.exec(manifest)?.[1] ?? ""
    const replacement = /replacement: '([^']+)'/.exec(manifest)?.[1] ?? ""
    expect(manifest).toMatch(/redirectRegex:[\s\S]*?permanent: true/)
    const redirect = (url: string) => url.replace(new RegExp(regex), replacement.replace("${1}", "$1"))
    expect(redirect("http://benevol.app/tarifs?utm=x")).toBe("https://www.benevol.app/tarifs?utm=x")
    expect(redirect("http://benevol.app/")).toBe("https://www.benevol.app/")
    expect(new RegExp(regex).test("http://www.benevol.app/")).toBe(false)
    const routes = [...manifest.matchAll(/priority: (\d+)\s*\n\s*match: (.+)\s*\n\s*middlewares:\s*\n\s*- name: (\S+)/g)]
    const apex = routes.find((r) => r[3] === "benevoles-apex-www-redirect")
    expect(apex?.[2]).toBe("Host(`benevol.app`)")
    expect(Number(apex?.[1])).toBeGreaterThan(Number(routes.find((r) => r[3] === "benevoles-https-redirect")?.[1]))
  })

  it("stays under the token route, which keeps its own unlogged HTTP route", () => {
    const priority = Number(/priority: (\d+)/.exec(manifest)?.[1])
    const tokenPriorities = [...tokens.matchAll(/priority: (\d+)/g)].map((m) => Number(m[1]))
    expect(Math.max(...tokenPriorities)).toBeGreaterThan(priority)
  })

  it("is applied by the deploy workflow, after the file that defines its middleware", () => {
    const tokensAt = workflow.indexOf("kubectl apply -f k8s/ingressroute-tokens.yaml")
    const httpAt = workflow.indexOf("kubectl apply -f k8s/ingressroute-http.yaml")
    expect(tokensAt).toBeGreaterThan(-1)
    expect(httpAt).toBeGreaterThan(tokensAt)
  })
})
