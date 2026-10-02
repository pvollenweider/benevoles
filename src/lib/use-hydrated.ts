// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useSyncExternalStore } from "react"

const noSubscription = () => () => {}

/**
 * false in the server-rendered HTML, true once React has hydrated the component on the client.
 * No effect and no extra render: useSyncExternalStore picks the server snapshot during
 * hydration and the client one afterwards. For controls that must not act before their handlers
 * are attached (a form submitted before hydration reloads the page and loses what was typed).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}
