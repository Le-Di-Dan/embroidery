-- DB6-S24 — immutability / append-only / column-scoped mutation-guard triggers.
-- Custom SQL migration (not drizzle-kit generated): Drizzle's table DSL has no
-- trigger primitive, so this file is hand-authored, same class as
-- 0026_enforce_vnd_currency_scale.sql being hand-reviewed CHECK DDL.
--
-- One shared trigger function backs every target below. It supports four
-- freeze modes selected by TG_ARGV[0]:
--   'always'               — row is frozen from the moment it exists
--   'frozen_when'          — frozen once OLD.<guard column> = <guard value>
--   'frozen_when_not'      — frozen once OLD.<guard column> <> <guard value>
--   'frozen_when_not_null' — frozen once OLD.<guard column> IS NOT NULL
-- TG_ARGV[1] = guard column name (ignored for 'always')
-- TG_ARGV[2] = guard comparison value (ignored for 'always' / 'frozen_when_not_null')
-- TG_ARGV[3] = delete policy: 'reject' | 'retention_exempt'
-- TG_ARGV[4..] = column names exempt from the freeze on UPDATE (may be none)
--
-- 'retention_exempt' lets an operator-run retention/cleanup job DELETE a
-- frozen row by setting `app.bypass_retention_trigger = 'on'` for that
-- session/transaction only (ADR-DB1-011); ordinary application sessions never
-- set this GUC, so DELETE stays rejected for them.
CREATE OR REPLACE FUNCTION public.fn_reject_mutation_conditional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mode text := TG_ARGV[0];
  v_guard_column text := NULLIF(TG_ARGV[1], '');
  v_guard_value text := TG_ARGV[2];
  v_delete_policy text := TG_ARGV[3];
  v_allowed text[] := coalesce(
    (SELECT array_agg(x) FROM unnest(TG_ARGV[4:TG_NARGS - 1]) AS x),
    ARRAY[]::text[]
  );
  v_frozen boolean;
  v_old jsonb;
  v_new jsonb;
  v_guard_old text;
  v_disallowed_change boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_guard_old := CASE WHEN v_guard_column IS NULL THEN NULL ELSE v_old ->> v_guard_column END;

  v_frozen := CASE v_mode
    WHEN 'always' THEN true
    WHEN 'frozen_when' THEN v_guard_old = v_guard_value
    WHEN 'frozen_when_not' THEN v_guard_old IS DISTINCT FROM v_guard_value
    WHEN 'frozen_when_not_null' THEN v_guard_old IS NOT NULL
    ELSE true
  END;

  IF TG_OP = 'DELETE' THEN
    IF v_frozen THEN
      IF v_delete_policy = 'retention_exempt'
         AND current_setting('app.bypass_retention_trigger', true) = 'on' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'immutability violation: DELETE on frozen row of table % is not permitted', TG_TABLE_NAME
        USING ERRCODE = '23000';
    END IF;
    RETURN OLD;
  END IF;

  -- TG_OP = 'UPDATE'
  IF NOT v_frozen THEN
    RETURN NEW;
  END IF;

  v_new := to_jsonb(NEW);

  SELECT bool_or(o.value IS DISTINCT FROM n.value) INTO v_disallowed_change
  FROM jsonb_each(v_old) o
  JOIN jsonb_each(v_new) n USING (key)
  WHERE NOT (o.key = ANY (v_allowed));

  IF coalesce(v_disallowed_change, false) THEN
    RAISE EXCEPTION 'immutability violation: UPDATE on frozen row of table % touches a protected column', TG_TABLE_NAME
      USING ERRCODE = '23000';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- CST-091 — always-frozen evidence tables (no exceptions, DELETE always rejected)
CREATE TRIGGER trg_approval_snapshots__reject_mutation
  BEFORE UPDATE OR DELETE ON "approval_snapshots"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint
CREATE TRIGGER trg_approval_snapshot_thread_colors__reject_mutation
  BEFORE UPDATE OR DELETE ON "approval_snapshot_thread_colors"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint
CREATE TRIGGER trg_approval_snapshot_agreement_acceptances__reject_mutation
  BEFORE UPDATE OR DELETE ON "approval_snapshot_agreement_acceptances"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint

-- CST-093 / CST-095 / CST-094(snapshot half) — always-frozen commercial/production/shipping evidence
CREATE TRIGGER trg_order_items__reject_mutation
  BEFORE UPDATE OR DELETE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint
CREATE TRIGGER trg_production_specifications__reject_mutation
  BEFORE UPDATE OR DELETE ON "production_specifications"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint
CREATE TRIGGER trg_shipping_snapshots__reject_mutation
  BEFORE UPDATE OR DELETE ON "shipping_snapshots"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'reject');
--> statement-breakpoint

-- CST-098 — append-only evidence tables (retention/cleanup job DELETE exemption)
CREATE TRIGGER trg_inventory_ledger_entries__reject_mutation
  BEFORE UPDATE OR DELETE ON "inventory_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_audit_events__reject_mutation
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_payment_provider_events__reject_mutation
  BEFORE UPDATE OR DELETE ON "payment_provider_events"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_payment_reconciliations__reject_mutation
  BEFORE UPDATE OR DELETE ON "payment_reconciliations"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_order_transitions__reject_mutation
  BEFORE UPDATE OR DELETE ON "order_transitions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_custom_request_transitions__reject_mutation
  BEFORE UPDATE OR DELETE ON "custom_request_transitions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_production_job_transitions__reject_mutation
  BEFORE UPDATE OR DELETE ON "production_job_transitions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_design_reviews__reject_mutation
  BEFORE UPDATE OR DELETE ON "design_reviews"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_request_moderation_notes__reject_mutation
  BEFORE UPDATE OR DELETE ON "request_moderation_notes"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_production_notes__reject_mutation
  BEFORE UPDATE OR DELETE ON "production_notes"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_notification_delivery_attempts__reject_mutation
  BEFORE UPDATE OR DELETE ON "notification_delivery_attempts"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_contact_verification_attempts__reject_mutation
  BEFORE UPDATE OR DELETE ON "contact_verification_attempts"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_customer_merge_events__reject_mutation
  BEFORE UPDATE OR DELETE ON "customer_merge_events"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_quotation_acceptances__reject_mutation
  BEFORE UPDATE OR DELETE ON "quotation_acceptances"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_shipping_fee_acknowledgements__reject_mutation
  BEFORE UPDATE OR DELETE ON "shipping_fee_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_asset_inspections__reject_mutation
  BEFORE UPDATE OR DELETE ON "asset_inspections"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint
CREATE TRIGGER trg_background_job_attempts__reject_mutation
  BEFORE UPDATE OR DELETE ON "background_job_attempts"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('always', '', '', 'retention_exempt');
--> statement-breakpoint

-- CST-099 — outbox_events column-scoped update (payload/identity frozen, dispatch columns mutable)
CREATE TRIGGER trg_outbox_events__reject_mutation
  BEFORE UPDATE OR DELETE ON "outbox_events"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional(
    'always', '', '', 'retention_exempt',
    'status', 'attempt_count', 'next_attempt_at', 'claimed_by', 'claimed_at', 'dispatched_at', 'last_error'
  );
--> statement-breakpoint

-- CST-100 — refunds column-scoped update (amount/target/currency frozen, decision columns mutable)
CREATE TRIGGER trg_refunds__reject_mutation
  BEFORE UPDATE OR DELETE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional(
    'always', '', '', 'reject',
    'status', 'method', 'transfer_reference', 'reason', 'customer_visible_reason',
    'approved_by_admin_id', 'executed_by_admin_id', 'approved_at', 'executed_at', 'updated_at'
  );
--> statement-breakpoint

-- CST-090 / CST-092 / CST-096 — frozen once status leaves DRAFT, except the legal advance + its own timestamp(s)
CREATE TRIGGER trg_design_versions__reject_mutation
  BEFORE UPDATE OR DELETE ON "design_versions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional(
    'frozen_when_not', 'status', 'DRAFT', 'reject',
    'status', 'sent_at', 'approved_at', 'superseded_at', 'voided_at', 'void_reason'
  );
--> statement-breakpoint
CREATE TRIGGER trg_quotation_versions__reject_mutation
  BEFORE UPDATE OR DELETE ON "quotation_versions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional(
    'frozen_when_not', 'status', 'DRAFT', 'reject',
    'status', 'sent_at', 'accepted_at', 'superseded_at', 'expired_at', 'void_reason'
  );
--> statement-breakpoint
CREATE TRIGGER trg_agreement_versions__reject_mutation
  BEFORE UPDATE OR DELETE ON "agreement_versions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional(
    'frozen_when_not', 'status', 'DRAFT', 'reject',
    'status', 'published_at', 'superseded_at', 'withdrawn_at', 'withdraw_reason'
  );
--> statement-breakpoint

-- CST-094 — shipping_details frozen once status = FROZEN, no exceptions (FROZEN is terminal)
CREATE TRIGGER trg_shipping_details__reject_mutation
  BEFORE UPDATE OR DELETE ON "shipping_details"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('frozen_when', 'status', 'FROZEN', 'reject');
--> statement-breakpoint

-- CST-097 — design_template_versions frozen once published_at is set, no exceptions
CREATE TRIGGER trg_design_template_versions__reject_mutation
  BEFORE UPDATE OR DELETE ON "design_template_versions"
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_mutation_conditional('frozen_when_not_null', 'published_at', '', 'reject');
