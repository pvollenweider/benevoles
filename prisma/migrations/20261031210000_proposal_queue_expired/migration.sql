-- A queued proposal run that never started (#1172): told apart from one that stopped while running
-- (lease_expired). The constraint is widened, every existing value kept; no row is rewritten.
ALTER TABLE "ProposalRun" DROP CONSTRAINT "ProposalRun_stop_reason_check";
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_stop_reason_check" CHECK ("stopReason" IN ('budget', 'iterations', 'deadline', 'cancelled', 'lease_expired', 'error', 'no_other', 'queue_expired'));
