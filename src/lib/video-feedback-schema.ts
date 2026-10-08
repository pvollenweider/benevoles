// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { FEEDBACK_CONTEXTS, type FeedbackBody } from "@/lib/video-feedback"

/**
 * Body of POST /api/public/video-feedback (#646). Kept apart from `src/lib/video-feedback.ts`,
 * which the VideoFeedback component bundles for the browser, so zod stays out of the public pages'
 * JavaScript (#773).
 */
export const feedbackBodySchema = z.object({
  videoId: z.string().regex(/^[A-Z][A-Z0-9_]+$/).max(100),
  revision: z.number().int().min(1).max(100_000),
  useful: z.boolean(),
  context: z.enum(FEEDBACK_CONTEXTS),
}) satisfies z.ZodType<FeedbackBody>
