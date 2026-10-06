// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { execFile } from "node:child_process"
import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
export type ProductBuild = {
  commit: string
  sourceTree: string
  productSourceSha256: string
  buildId: string
  snapshot: string
  builtAt: string
}
/** Require the actual listening process, not just an env var claiming a revision. */
export async function verifyProductBuild(baseUrl: string): Promise<ProductBuild> {
  const url = new URL(baseUrl)
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Product capture proof is local-only")
  const port = Number(url.port)
  if (!Number.isInteger(port) || port < 43100 || port > 43110) throw new Error("Dedicated video port required")
  const registry = JSON.parse(await readFile(path.resolve(`videos/output/product-server-${port}.json`), "utf8")) as ProductBuild & { pid: number; port: number }
  const { stdout: target } = await exec("git", ["rev-parse", "origin/main"])
  if (registry.commit !== target.trim()) throw new Error("Video server does not match target main; rebuild before recording")
  if (registry.port !== port || !Number.isInteger(registry.pid) || !/^\/(?:private\/)?tmp\/benevoles-video-production\.[A-Za-z0-9]+$/.test(registry.snapshot)) throw new Error("Invalid product server registry")
  const { stdout: listener } = await exec("lsof", ["-nP", "-a", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"])
  if (!listener.split("\n").includes(`p${registry.pid}`)) throw new Error("Video port is served by a different process")
  const { stdout: cwd } = await exec("lsof", ["-a", "-p", String(registry.pid), "-d", "cwd", "-Fn"])
  const expectedCwd = await realpath(path.join(registry.snapshot, ".next/standalone"))
  if (!cwd.split("\n").includes(`n${expectedCwd}`)) throw new Error("Video server is not running the registered standalone build")
  const disk = JSON.parse(await readFile(path.join(registry.snapshot, ".video-build.json"), "utf8")) as ProductBuild
  if (JSON.stringify(disk) !== JSON.stringify(Object.fromEntries(Object.entries(registry).filter(([key]) => !["pid", "port"].includes(key))))) throw new Error("Product build stamp changed since server launch")
  const buildId = (await readFile(path.join(registry.snapshot, ".next/BUILD_ID"), "utf8")).trim()
  const standaloneBuildId = (await readFile(path.join(expectedCwd, ".next/BUILD_ID"), "utf8")).trim()
  if (!registry.buildId || buildId !== registry.buildId || standaloneBuildId !== buildId) throw new Error("Compiled BUILD_ID differs from the capture proof")
  return disk
}
