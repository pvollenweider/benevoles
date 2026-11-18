// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// The application files of the production image belong to root: the server runs as nextjs and can
// read them, never rewrite them. Only the two cache folders Next.js writes belong to nextjs; in
// Kubernetes they are emptyDir volumes over a read-only root filesystem (k8s-hardening.test.ts).
const root = path.join(__dirname, "..", "..", "..")
const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf-8")
const runner = dockerfile.slice(dockerfile.indexOf(" AS runner\n"))

/** The instructions of the runner stage, continuation lines joined, comments left out. */
const instructions = runner
  .replace(/\\\n/g, " ")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))

/** The commands of the RUN instructions that start with `name`. */
const commands = (name: string) =>
  instructions
    .filter((l) => l.startsWith("RUN "))
    .flatMap((l) => l.slice(4).split(/&&|;|\|/))
    .map((c) => c.trim().replace(/\s+/g, " "))
    .filter((c) => c.split(" ")[0] === name)

const WRITABLE_APP_DIRS = [".next/cache", ".next/server/route-cache"]

describe("ownership of the application files in the Docker image", () => {
  it("reads the runner stage", () => {
    expect(runner.startsWith(" AS runner\n")).toBe(true)
    expect(instructions.filter((l) => l.startsWith("COPY ")).length).toBeGreaterThan(20)
    expect(instructions).toContain("WORKDIR /app")
  })

  it("no COPY gives a file to the runtime user: they all stay root's", () => {
    for (const line of instructions.filter((l) => l.startsWith("COPY ") || l.startsWith("ADD "))) {
      expect(line, line).not.toMatch(/--chown|--chmod/)
    }
  })

  it("the only chown is on the two cache folders the server writes, never recursive", () => {
    expect(commands("chown")).toEqual([`chown nextjs:nodejs ${WRITABLE_APP_DIRS.join(" ")}`])
    expect(commands("mkdir")).toEqual([`mkdir -p ${WRITABLE_APP_DIRS.join(" ")}`])
  })

  it("no chmod opens a file for writing", () => {
    expect(commands("chmod").length).toBeGreaterThan(0)
    for (const c of commands("chmod")) expect(c, c).toMatch(/^chmod \+x \S+$/)
  })

  it("the cache folders are created after every file is copied into /app, and before the user changes", () => {
    const mkdir = instructions.findIndex((l) => l.startsWith("RUN mkdir -p .next/cache"))
    const lastAppCopy = instructions.findLastIndex((l) => l.startsWith("COPY ") && / \.\/\S*$/.test(l))
    const user = instructions.findIndex((l) => l.startsWith("USER "))
    expect(lastAppCopy).toBeGreaterThan(-1)
    expect(mkdir).toBeGreaterThan(lastAppCopy)
    expect(user).toBeGreaterThan(mkdir)
  })

  it("no COPY fills a cache folder: a volume mounted there hides nothing", () => {
    for (const dir of WRITABLE_APP_DIRS) {
      for (const line of instructions.filter((l) => l.startsWith("COPY "))) {
        expect(line.split(" ").at(-1), line).not.toMatch(new RegExp(`^\\./${dir.replace(/\./g, "\\.")}(/|$)`))
      }
    }
    // The builder removes Turbopack's build cache, so the standalone copy brings no .next/cache.
    expect(dockerfile).toMatch(/npm run build && rm -rf \.next\/cache\n/)
  })

  it("root does everything up to a single USER nextjs, which only the port, the entrypoint and the command follow", () => {
    expect(instructions.filter((l) => l.startsWith("USER "))).toEqual(["USER nextjs"])
    const after = instructions.slice(instructions.indexOf("USER nextjs") + 1).map((l) => l.split(" ")[0])
    expect(after.sort()).toEqual(["CMD", "ENTRYPOINT", "EXPOSE"])
  })
})

// Next.js writes a page it renders again (a revalidation delay, revalidatePath, revalidateTag, a
// cached function or fetch) next to the pages of the build, in .next/server/app, or in
// .next/cache/fetch-cache. The first is read-only in the image and in Kubernetes: no route of the
// build is rendered again today (90 prerendered routes, none with a delay, measured on the image).
// Whoever adds one first measures where Next.js writes it (`docker diff`) and gives it a volume.
describe("no page of the build is rendered again on disk", () => {
  const sources: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "generated") continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) sources.push(full)
    }
  }
  walk(path.join(root, "src"))

  it("reads the application sources", () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("no revalidation delay, no on-demand revalidation, no cached function or fetch", () => {
    const patterns = [
      /export const revalidate\b/,
      /\b(revalidatePath|revalidateTag|updateTag|unstable_cache|cacheLife|cacheTag)\s*\(/,
      /["']use cache(: \w+)?["']/,
      /cache:\s*["']force-cache["']/,
      /next:\s*\{\s*(revalidate|tags)\b/,
    ]
    const found = sources
      .filter((file) => patterns.some((re) => re.test(fs.readFileSync(file, "utf-8"))))
      .map((file) => path.relative(root, file))
    expect(found).toEqual([])
  })
})
