-- Custom questions of an event's sign-up form and their answers (#483).
CREATE TABLE "EventQuestion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventQuestion_type_check" CHECK ("type" IN ('text', 'yesno', 'single', 'multiple'))
);
CREATE INDEX "EventQuestion_eventId_position_idx" ON "EventQuestion"("eventId", "position");
ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "values" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionAnswer_questionId_volunteerId_key" ON "QuestionAnswer"("questionId", "volunteerId");
CREATE INDEX "QuestionAnswer_eventId_idx" ON "QuestionAnswer"("eventId");
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EventQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
