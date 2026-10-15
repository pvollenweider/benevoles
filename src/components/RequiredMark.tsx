// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The visible « * » of a required field (#1003, DESIGN.md « Inputs / Fields »): decorative, hidden
 * from screen readers, which hear « obligatoire » once from the field's own `required` state
 * instead of « étoile ». The field must carry `required` (or the group's legend says it in words).
 */
export default function RequiredMark() {
  return <>{" "}<span aria-hidden="true">*</span></>
}
