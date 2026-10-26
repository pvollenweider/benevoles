-- Beta access for advanced features (#1168): when an owner turned on « Essayer les fonctions
-- avancées en bêta », and who. Additive and nullable, no backfill: every existing organisation
-- does not take part (nothing changes), and pods still running the previous code keep working.
-- The capabilities open for trial live in "PlatformSetting" (key "beta.capabilities"): no row
-- means none is open.
ALTER TABLE "Organization" ADD COLUMN "betaOptInAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "betaOptInById" TEXT;
