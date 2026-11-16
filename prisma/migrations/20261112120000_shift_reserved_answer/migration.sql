-- #962: reserve a poste to volunteers who answered a choice question of the event.
ALTER TABLE "Shift" ADD COLUMN "reservedQuestionId" TEXT;
ALTER TABLE "Shift" ADD COLUMN "reservedAnswers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- SetNull is the database's safety net only: the admin API refuses to delete a question a poste
-- depends on, so this never runs through the app.
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_reservedQuestionId_fkey"
  FOREIGN KEY ("reservedQuestionId") REFERENCES "EventQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Shift_reservedQuestionId_idx" ON "Shift"("reservedQuestionId");
