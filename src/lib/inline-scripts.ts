// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { CLEAN_PATH_SCRIPT } from "./clean-path"

/**
 * The app's own inline scripts: constant strings, never built from request or user data. The
 * enforced script policy allows each of them by its sha256 hash (src/lib/security-headers.ts), so a
 * change of one byte here changes its hash there, and no other inline script can run. Next.js's own
 * inline scripts carry the request's nonce instead.
 */

/**
 * Applies the saved or system theme of the content pages before paint (ContentShell): scoped to
 * the script's parent element, never <html>.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("doc-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var el = document.currentScript && document.currentScript.parentElement;
    if (el) el.classList.toggle("dark", dark);
  } catch (e) {}
})();
`

/**
 * The « Imprimer » button of the HTML print pages (exports, badges, sheets): a `data-print` button
 * and this script at the end of the body, instead of an inline `onclick`, which the policy refuses.
 */
export const PRINT_BUTTON_SCRIPT =
  "document.querySelectorAll('[data-print]').forEach(function(b){b.addEventListener('click',function(){window.print()})})"

/** The print button script, as the HTML print pages put it before `</body>`. */
export const PRINT_BUTTON_SCRIPT_TAG = `<script>${PRINT_BUTTON_SCRIPT}</script>`

/** Every inline script of the app, for the policy's hashes. */
export const INLINE_SCRIPTS: readonly string[] = [CLEAN_PATH_SCRIPT, THEME_INIT_SCRIPT, PRINT_BUTTON_SCRIPT]
