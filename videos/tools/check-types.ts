// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Include video tooling explicitly: the application tsconfig may omit these files. */
import ts from "typescript"

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".")
const files = [
  ...ts.sys.readDirectory("videos/lib", [".ts", ".tsx"]),
  ...ts.sys.readDirectory("videos/tools", [".ts", ".tsx"]),
  "scripts/seed-video-scenario.ts",
  "scripts/seed-video-operator.ts",
]
const program = ts.createProgram(files, { ...parsed.options, noEmit: true, incremental: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n",
  }))
  process.exitCode = 1
} else {
  console.log(`Video tools type-check passed (${files.length} explicit source files; transitive imports checked).`)
}
