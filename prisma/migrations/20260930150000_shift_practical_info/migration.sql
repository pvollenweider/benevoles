-- Practical info per shift (#397): a contact person and a short instruction, shown to the
-- volunteers of the shift with its place. Nullable, no default: expand-only.

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "instructions" TEXT;
