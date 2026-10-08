// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The app's version (package.json), for client components. `next build` inlines it from
 * next.config.ts (`env`), and vitest.config.mts sets it for the tests: importing package.json in a
 * client component put the whole file, dependencies and scripts included, in the page's
 * JavaScript (#773). Server code may keep reading package.json.
 */
export const APP_VERSION: string = process.env.APP_VERSION ?? ""
