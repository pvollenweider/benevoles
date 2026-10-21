-- « Qui est inscrit » (#1068 follow-up): the organisation's default for its NEW events. Additive:
-- one column; no existing event or consent is rewritten (each event keeps its own value).
ALTER TABLE "Organization" ADD COLUMN "shiftRosterDefault" BOOLEAN NOT NULL DEFAULT true;
