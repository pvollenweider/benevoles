-- Push with a targeted message (#468): what was asked and what came of it, apart from the emails.
ALTER TABLE "TargetedMessage" ADD COLUMN "pushRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TargetedMessage" ADD COLUMN "pushDevices" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TargetedMessage" ADD COLUMN "pushSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TargetedMessage" ADD COLUMN "pushFailed" INTEGER NOT NULL DEFAULT 0;
