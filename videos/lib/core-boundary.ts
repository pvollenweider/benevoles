// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import path from "node:path"
import ts from "typescript"

/** A source file of the core: its path is relative to the repository root, with POSIX separators. */
export type BoundaryFile = { path: string; source: string }
export type BoundaryViolation = { path: string; line: number; kind: "import" | "token"; detail: string }
export type BoundaryOptions = { coreRoot: string; allowedPackages: string[]; forbiddenTokens: RegExp[] }

/**
 * What the generic engine must never name: the product, its mail catcher, its media host, its
 * locale and time zone, the ports of its local stack, and the ids of its known videos. The first
 * nine patterns are fixed; the catalog ids are added by the caller, each as a whole word so that
 * `GLOBAL_SEARCH` does not flag `GLOBAL_SEARCHER`.
 */
export function forbiddenTokens(catalogIds: string[]): RegExp[] {
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return [
    /benevol/i,
    /mailpit/i,
    /medias\./i,
    /fr-CH/i,
    /Europe\/Zurich/i,
    /\b431(?:0\d|1[0-4])\b/,
    /\b45433\b/,
    /\b41026\b/,
    /\b48026\b/,
    ...catalogIds.map(id => new RegExp(`\\b${escaped(id)}\\b`, "i")),
  ]
}

/** The package of a bare specifier: `@scope/pkg/sub` -> `@scope/pkg`, `pkg/sub` -> `pkg`. */
function packageName(specifier: string): string {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]
}

/**
 * Node built-ins, relative paths that stay inside the core, and declared packages are allowed.
 * A relative path is normalized against the importing file's directory, so `../core/../lib/x`
 * cannot hide where it really goes.
 */
function importAllowed(specifier: string, importingFile: string, options: BoundaryOptions): boolean {
  if (specifier.startsWith("node:")) return true
  if (/^\.\.?($|\/)/.test(specifier)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importingFile), specifier))
    const coreRoot = options.coreRoot.replace(/\/+$/, "")
    return resolved === coreRoot || resolved.startsWith(`${coreRoot}/`)
  }
  return options.allowedPackages.includes(packageName(specifier))
}

/**
 * The specifier a node imports, when it imports one: import and export declarations (including
 * side-effect and type-only ones), `import x = require(…)`, import type nodes, and calls to
 * `import(…)` and `require(…)`.
 */
function importedSpecifier(node: ts.Node): ts.Node | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier
  if (ts.isImportEqualsDeclaration(node)) {
    return ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : undefined
  }
  if (ts.isImportTypeNode(node)) return ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return node.arguments[0]
    if (ts.isIdentifier(node.expression) && node.expression.text === "require") return node.arguments[0]
  }
  return undefined
}

/** Reads the imports with the TypeScript parser; a specifier it cannot read is refused. */
function importViolations(file: BoundaryFile, sourceFile: ts.SourceFile, options: BoundaryOptions): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []
  const visit = (node: ts.Node): void => {
    const specifier = importedSpecifier(node)
    if (specifier) {
      const line = sourceFile.getLineAndCharacterOfPosition(specifier.getStart(sourceFile)).line + 1
      if (!ts.isStringLiteralLike(specifier)) {
        violations.push({ path: file.path, line, kind: "import", detail: "computed specifier" })
      } else if (!importAllowed(specifier.text, file.path, options)) {
        violations.push({ path: file.path, line, kind: "import", detail: specifier.text })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return violations
}

/** Searches the raw text, comments and strings included, so a token cannot hide in prose. */
function tokenViolations(file: BoundaryFile, sourceFile: ts.SourceFile, tokens: RegExp[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []
  for (const token of tokens) {
    const flags = token.flags.includes("g") ? token.flags : `${token.flags}g`
    for (const match of file.source.matchAll(new RegExp(token.source, flags))) {
      violations.push({
        path: file.path,
        line: sourceFile.getLineAndCharacterOfPosition(match.index!).line + 1,
        kind: "token",
        detail: match[0],
      })
    }
  }
  return violations
}

export function boundaryViolations(files: BoundaryFile[], options: BoundaryOptions): BoundaryViolation[] {
  return files.flatMap(file => {
    const sourceFile = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    return [
      ...importViolations(file, sourceFile, options),
      ...tokenViolations(file, sourceFile, options.forbiddenTokens),
    ]
  })
}
