-- Sector-scoped leaders (#1169). Additive, safe for pods still running the previous code: a
-- nullable column, a dropped NOT NULL, new indexes and a check that every existing row already
-- satisfies (roleName set, sectorId null). No existing row is rewritten: every current leader keeps
-- their exact poste and their link; nobody is widened to a sector.

-- AlterTable
ALTER TABLE "SectorLeader" ADD COLUMN "sectorId" TEXT;
ALTER TABLE "SectorLeader" ALTER COLUMN "roleName" DROP NOT NULL;

-- A leader is responsible for exactly one poste or one sector.
ALTER TABLE "SectorLeader" ADD CONSTRAINT "SectorLeader_scope_check"
  CHECK (("roleName" IS NULL) <> ("sectorId" IS NULL));

-- CreateIndex
CREATE INDEX "SectorLeader_sectorId_idx" ON "SectorLeader"("sectorId");
CREATE UNIQUE INDEX "SectorLeader_eventId_sectorId_email_key" ON "SectorLeader"("eventId", "sectorId", "email");

-- One row per sector and address, whatever its case or spaces, as for a poste (#342). Expression
-- index: it can't be declared in schema.prisma (see the comment on the model).
CREATE UNIQUE INDEX "SectorLeader_eventId_sectorId_email_ci_key" ON "SectorLeader"("eventId", "sectorId", lower(trim("email"))) WHERE "sectorId" IS NOT NULL;

-- AddForeignKey
-- NO ACTION, not RESTRICT: the app never deletes a sector (it archives it), and deleting the event
-- cascades to its sectors and its leaders in one statement, checked at its end.
ALTER TABLE "SectorLeader" ADD CONSTRAINT "SectorLeader_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
