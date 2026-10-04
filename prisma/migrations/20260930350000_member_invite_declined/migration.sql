-- A member can answer « Je ne suis pas disponible » from their invitation link (#558). Nullable,
-- additive: every existing row keeps answering "no answer yet" (declinedAt null).
ALTER TABLE "MemberInvite" ADD COLUMN "declinedAt" TIMESTAMP(3);
