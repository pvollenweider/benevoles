-- « cancelled » (#814): an email of an organisation that is deactivated or no longer exists is never
-- sent. The outbox marks it cancelled at send time, and the deactivation cancels every pending one,
-- so a later reactivation never sends them. Final state, like « sent »: never picked up again.
ALTER TABLE "NotificationOutbox" DROP CONSTRAINT "NotificationOutbox_status_check";
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));
