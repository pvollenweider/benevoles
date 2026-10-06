// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertAnswer, assertQuestionFixture, assertQuestionConfiguration, trainingQuestions, type QuestionSnapshot } from "./record-event-questions"
import { test } from "vitest"

test("record-event-questions guards", async () => {

  const snapshot: QuestionSnapshot = {
    organizationId: "video-questions", eventId: "video-questions-training", volunteerEmail: "video.questions.aline@example.org",
    confirmedRegistrationCount: 1,
    questions: trainingQuestions.map((q, i) => ({ ...q, options: [...q.options], id: `q${i}`, active: true })),
    answers: [{ questionId: "q0", value: "M" }, { questionId: "q1", value: "Oui" }, { questionId: "q2", value: ["Vélo", "Remorque"] }],
  }
  assertQuestionFixture(snapshot, snapshot.eventId, snapshot.volunteerEmail)
  assertQuestionConfiguration(snapshot, 4)
  assertAnswer(snapshot, "Taille de t-shirt", "M")
  assertAnswer(snapshot, "Matériel de transport", ["Vélo", "Remorque"])
  assertAnswer(snapshot, "Point de rendez-vous préféré", undefined)
  for (const patch of [{ organizationId: "default" }, { eventId: "real-event" }, { volunteerEmail: "person@gmail.com" }]) {
    assert.throws(() => assertQuestionFixture({ ...snapshot, ...patch }, snapshot.eventId, snapshot.volunteerEmail))
  }
  assert.throws(() => assertQuestionFixture({ ...snapshot, volunteerEmail: "video.questions.aline@example.org.evil" }, snapshot.eventId, "video.questions.aline@example.org.evil"))
  assert.throws(() => assertAnswer(snapshot, "Taille de t-shirt", "L"))
  assert.throws(() => assertAnswer(snapshot, "Missing", undefined))
  assert.throws(() => assertQuestionConfiguration({ ...snapshot, questions: snapshot.questions.map(q => ({ ...q, required: false })) }, 4))
  assert.throws(() => assertQuestionConfiguration({ ...snapshot, questions: snapshot.questions.map(q => ({ ...q, type: "text" })) }, 4))
  assert.throws(() => assertQuestionConfiguration({ ...snapshot, questions: snapshot.questions.map(q => ({ ...q, options: [] })) }, 4))
  const retired = { ...snapshot, questions: snapshot.questions.map(q => q.id === "q0" ? { ...q, active: false } : q) }
  assertAnswer(retired, "Taille de t-shirt", "M")
  assert.throws(() => assertQuestionConfiguration(retired, 4))
})
