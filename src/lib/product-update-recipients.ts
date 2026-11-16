// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ORGANIZER_ROLE, OWNER_ROLE } from "./permissions"

/**
 * Who the product-update emails (#200) reach, as a Prisma `where` fragment on AdminUser, besides
 * the opt-in itself: owners, organisers and super admins. An allow-list: a front-desk account
 * (#1142) is opted in by the column's default like any account, but it does not administer
 * anything and gets no product news. The send and the two counts shown to the super admin use it,
 * so the number announced is the number written to.
 */
export const PRODUCT_UPDATE_RECIPIENT_WHERE = { role: { in: [OWNER_ROLE, ORGANIZER_ROLE, "super_admin"] as string[] } }
