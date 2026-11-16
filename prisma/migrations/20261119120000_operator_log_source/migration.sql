-- Automatic validation of new spaces (#1371, first pull request). The operator's log records how
-- an approval was taken: by the operator from the super admin space, or automatically. Additive,
-- nullable, no backfill: the previous release ignores the column.
ALTER TABLE "OperatorLog" ADD COLUMN "source" TEXT;
