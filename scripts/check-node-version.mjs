#!/usr/bin/env node
// Runs automatically before `npm run dev` and `npm run test:e2e` (see package.json's
// predev/pretest:e2e scripts — npm's own lifecycle convention, no extra wiring needed).
//
// Added after #228: a shell with no active Node version manager silently ran `next dev` under an
// unrelated system Node install instead of the version pinned in .nvmrc. Nothing crashed or
// warned — nodemailer's configured connection/greeting/socket timeouts just failed to fire under
// that version, turning every email-sending route into a several-minutes-long hang with no error
// at all. `engines` + engine-strict in .npmrc only catches this at `npm install` time, not when
// node_modules was already installed correctly and someone's shell just isn't on the right Node
// right now — this catches that case too, loudly, before anything has a chance to hang silently.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const expected = readFileSync(path.join(root, ".nvmrc"), "utf-8").trim()
const expectedMajor = expected.split(".")[0]
const actualMajor = process.versions.node.split(".")[0]

if (actualMajor !== expectedMajor) {
  console.error(`
✖ Wrong Node version: this shell is running Node ${process.versions.node}, but this project
  needs Node ${expected} (see .nvmrc) — mismatches here have silently broken email sending
  before (#228), with no error, just a multi-minute hang.

  Fix: nvm use   (or: n ${expected} / fnm use)
`)
  process.exit(1)
}
