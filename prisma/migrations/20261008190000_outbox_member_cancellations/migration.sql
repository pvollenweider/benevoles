-- Emails cancelled for a deleted member (#667) or an absorbed record (#600) were stored as
-- « failed » with a reason code: shown as a technical failure and still re-sendable to the person
-- (#815). They become « cancelled » (#814), a final state the outbox and every retry ignore.
UPDATE "NotificationOutbox" SET "status" = 'cancelled', "claimedAt" = NULL
WHERE "status" = 'failed' AND "lastError" IN ('member_deleted', 'merged_member');
