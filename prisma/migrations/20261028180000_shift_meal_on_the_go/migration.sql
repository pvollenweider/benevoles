-- « Repas sur le pouce possible » per shift (#1171, lot 2). Additive, default false.
ALTER TABLE "Shift" ADD COLUMN "mealOnTheGo" BOOLEAN NOT NULL DEFAULT false;
