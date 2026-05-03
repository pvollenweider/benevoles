CREATE TABLE "PushSubscription" (
  "id"        TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_email_idx" ON "PushSubscription"("email");
