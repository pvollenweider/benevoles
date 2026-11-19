-- Message template library (#1414): a category per template. Additive and safe for running pods:
-- one column with a NOT NULL default, so the previous release keeps inserting and reading its rows
-- while the migration runs, and every existing template gets « Autres ».
--
-- Library templates copy their category (one of LIBRARY_CATEGORIES, src/lib/message-template-category.ts);
-- a template written by hand uses « Autres ». Nothing is added automatically.

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Autres';
