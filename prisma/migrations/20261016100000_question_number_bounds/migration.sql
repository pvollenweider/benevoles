-- « Nombre » questions (#1015): a fifth type, and its bounds. Whole numbers 0 or more: a null
-- minValue means 0, a null maxValue no upper bound; both null for the other types.
ALTER TABLE "EventQuestion" DROP CONSTRAINT "EventQuestion_type_check";
ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_type_check" CHECK ("type" IN ('text', 'yesno', 'single', 'multiple', 'number'));
ALTER TABLE "EventQuestion" ADD COLUMN "minValue" INTEGER;
ALTER TABLE "EventQuestion" ADD COLUMN "maxValue" INTEGER;
ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_bounds_check"
  CHECK (("minValue" IS NULL OR "minValue" >= 0) AND ("maxValue" IS NULL OR "maxValue" >= COALESCE("minValue", 0)));
