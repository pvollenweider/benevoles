-- ────────────────────────────────────────────────────────────────────────────
-- Member invites
--
-- Tokenised invitation a member receives by email for a given event.
-- The token is what pre-fills the public registration form. Stays valid
-- after first use so the volunteer can revisit/manage their registration.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE "MemberInvite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberInvite_token_key" ON "MemberInvite"("token");
CREATE INDEX "MemberInvite_token_idx" ON "MemberInvite"("token");
CREATE UNIQUE INDEX "MemberInvite_eventId_memberId_key" ON "MemberInvite"("eventId", "memberId");

ALTER TABLE "MemberInvite" ADD CONSTRAINT "MemberInvite_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberInvite" ADD CONSTRAINT "MemberInvite_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
