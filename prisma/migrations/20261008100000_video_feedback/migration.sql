-- « Cette vidéo vous a-t-elle été utile ? » (#646): anonymous Oui/Non answers per video and
-- revision. New table, no relation to any other table, no personal data. Additive only.

-- CreateTable
CREATE TABLE "VideoFeedback" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "useful" BOOLEAN NOT NULL,
    "context" TEXT NOT NULL,
    "answeredOn" DATE NOT NULL,

    CONSTRAINT "VideoFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoFeedback_videoId_revision_idx" ON "VideoFeedback"("videoId", "revision");

-- CreateIndex
CREATE INDEX "VideoFeedback_answeredOn_idx" ON "VideoFeedback"("answeredOn");
