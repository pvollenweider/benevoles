"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { signOutOfAdmin } from "./sign-out"

/**
 * « Se déconnecter » as a plain button, for a page without the top bar (the front-desk landing
 * page, #1142). Same sign-out as the user menu (./sign-out.ts). The focus outline is the global
 * one for buttons (src/app/globals.css).
 */
export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOutOfAdmin()}
      className="inline-flex items-center justify-center min-h-11 px-4 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700"
    >
      Se déconnecter
    </button>
  )
}
