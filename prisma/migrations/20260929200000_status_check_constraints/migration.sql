-- Closed value sets for status-like string columns (#321), mirrored by src/lib/statuses.ts
-- (a unit test keeps both in sync). NOT VALID: enforced for every new or updated row, without
-- scanning existing ones, so this can't fail on an unexpected legacy value, and it stays
-- compatible with the previous code (values unchanged, no column type change).

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_status_check" CHECK ("status" IN ('active', 'waiting', 'offered', 'cancelled', 'deleted')) NOT VALID;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_source_check" CHECK ("source" IN ('public_form', 'admin_manual')) NOT VALID;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_status_check" CHECK ("status" IN ('open', 'full', 'closed', 'cancelled')) NOT VALID;
ALTER TABLE "Event" ADD CONSTRAINT "Event_publicStatus_check" CHECK ("publicStatus" IN ('draft', 'published', 'archived')) NOT VALID;
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_role_check" CHECK ("role" IN ('admin', 'super_admin')) NOT VALID;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed')) NOT VALID;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_actorType_check" CHECK ("actorType" IN ('admin', 'volunteer', 'system')) NOT VALID;
ALTER TABLE "OrgLog" ADD CONSTRAINT "OrgLog_actorType_check" CHECK ("actorType" IN ('admin', 'system')) NOT VALID;
