ALTER TABLE "admin_accounts" DROP CONSTRAINT "ck_admin_accounts__status";--> statement-breakpoint
ALTER TABLE "admin_sessions" DROP CONSTRAINT "ck_admin_sessions__status";--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "ck_admin_accounts__status_allowed" CHECK ("admin_accounts"."status" in ('ACTIVE', 'LOCKED', 'DISABLED'));--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "ck_admin_sessions__status_allowed" CHECK ("admin_sessions"."status" in ('ACTIVE', 'EXPIRED', 'REVOKED'));