## Problem

The Google OAuth callback (`google-oauth-callback`) saves tokens by `UPDATE stores`. That fires the trigger `trg_audit_store_changes` → `audit_store_changes()` → `write_audit_log()`, which inserts into `audit_logs` **without setting `result`**. Since `audit_logs.result` is `NOT NULL`, the UPDATE fails:

> Failed to save tokens: null value in column "result" of relation "audit_logs" violates not-null constraint

This blocks every store update by any path (not just GA4 OAuth). Root cause is in the DB function, not the edge function.

## Fix

Single migration to patch `public.write_audit_log` so it always provides `result`:

```sql
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_resource text,
  p_store_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_result text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, store_id, action, resource, metadata, ip, result)
  VALUES (auth.uid(), p_store_id, p_action, p_resource, p_metadata, p_ip, COALESCE(p_result, 'success'));
END;
$$;
```

Default value preserves the existing 5-arg call signature used by `audit_store_changes()`, so no other code needs changes.

## Verification

After the migration:
1. Retry the GA4 OAuth flow — popup should show "✓ Conectado!".
2. Confirm a row was written to `audit_logs` with `action='update_store'`, `result='success'`.

## Out of scope

No edge function or frontend changes. The audit-log trigger keeps firing as designed; it just stops violating the constraint.