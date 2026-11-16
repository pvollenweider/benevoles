// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The few APIs the application uses that a browser of its build targets lacks (#1343, package.json
 * « browserslist »: Safari 15.4). Installed before anything else by instrumentation-client.ts. A
 * build target only rewrites syntax; a missing API needs its function.
 */

type AbortSignalStatics = { timeout?: (ms: number) => AbortSignal }

/** AbortSignal.timeout (Safari 16.0): a signal that aborts by itself, with a « TimeoutError ». */
export function installAbortSignalTimeout(target: AbortSignalStatics = AbortSignal as unknown as AbortSignalStatics): void {
  if (typeof target.timeout === "function") return
  target.timeout = (ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException("signal timed out", "TimeoutError")), ms)
    return controller.signal
  }
}

export function installBrowserPolyfills(): void {
  if (typeof AbortSignal !== "undefined") installAbortSignalTimeout()
}
