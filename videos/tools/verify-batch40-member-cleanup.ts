// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { verifyRecordedMemberCleanup } from "../lib/record-member-cleanup"
verifyRecordedMemberCleanup("videos/output/members-import").then(() => console.log("Actual bulk cleanup verified: two extras deleted, registered member deactivated, original registration preserved")).catch(error => { console.error(error instanceof Error ? error.message : "Bulk cleanup verification failed"); process.exitCode = 1 })
