-- Follow-up question (#1016): a question shown only for some answers of a parent question of the
-- same event. Additive: existing questions have no parent and stay asked to everyone.
ALTER TABLE "EventQuestion" ADD COLUMN "parentId" TEXT;
ALTER TABLE "EventQuestion" ADD COLUMN "showIfValues" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EventQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
