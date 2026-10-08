import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import nextConfig from "../../../next.config"

// Brotli at Traefik and no X-Powered-By (#759 F7, #773).
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8")
const middlewares = read("k8s/middleware-compress.yaml")
const ingress = read("k8s/ingress.yaml")
const tokens = read("k8s/ingressroute-tokens.yaml")
const workflow = read(".github/workflows/deploy.yml")

describe("compression by Traefik", () => {
  it("compresses text only, and has the app answer uncompressed", () => {
    expect(middlewares).toMatch(/name: benevoles-compress\n[\s\S]*?compress:\n[\s\S]*?includedContentTypes:/)
    for (const type of ["text/html", "text/x-component", "text/css", "application/javascript", "application/json"]) {
      expect(middlewares).toContain(`- ${type}\n`)
    }
    for (const type of ["image/png", "image/jpeg", "video/mp4", "application/pdf"]) expect(middlewares).not.toContain(type)
    // Traefik never compresses a response that already has a Content-Encoding (the app's gzip).
    expect(middlewares).toMatch(/name: benevoles-identity-upstream\n[\s\S]*?customRequestHeaders:\n(\s+#.*\n)*\s+Accept-Encoding: ""/)
  })

  // Regression: with Traefik's default order (gzip first), Chrome's « gzip, deflate, br, zstd »
  // got gzip in production. The server preference puts zstd, then Brotli, before gzip.
  it("prefers zstd, then Brotli, then gzip when the browser expresses no preference", () => {
    const compress = middlewares.slice(middlewares.indexOf("name: benevoles-compress"), middlewares.indexOf("name: benevoles-identity-upstream"))
    const encodings = /encodings:\n((?:\s+- \S+\n)+)/.exec(compress)?.[1].match(/- (\S+)/g)?.map((e) => e.slice(2))
    expect(encodings).toEqual(["zstd", "br", "gzip"])
  })

  it("runs compress before the Accept-Encoding removal, on the Ingress and the token route", () => {
    expect(ingress).toContain(
      "traefik.ingress.kubernetes.io/router.middlewares: benevoles-benevoles-compress@kubernetescrd,benevoles-benevoles-identity-upstream@kubernetescrd",
    )
    const websecure = tokens.slice(tokens.indexOf("name: benevoles-app-tokens\n"), tokens.indexOf("name: benevoles-app-tokens-http"))
    expect(websecure).toMatch(/middlewares:\n\s+- name: benevoles-compress\n\s+- name: benevoles-identity-upstream\n/)
  })

  it("is applied by the deploy workflow before the routes that name it", () => {
    const at = (file: string) => workflow.indexOf(`kubectl apply -f k8s/${file}`)
    expect(at("middleware-compress.yaml")).toBeGreaterThan(-1)
    expect(at("middleware-compress.yaml")).toBeLessThan(at("ingress.yaml"))
    expect(at("middleware-compress.yaml")).toBeLessThan(at("ingressroute-tokens.yaml"))
  })
})

describe("next.config.ts", () => {
  it("sends no X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
