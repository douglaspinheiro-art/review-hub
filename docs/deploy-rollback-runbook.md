# Deploy and Rollback Runbook

## Preconditions

- `main` branch green on CI (`lint`, `test`, `build`).
- No pending critical incidents.
- Database migration reviewed and reversible.

## Deploy Procedure

1. Confirm release scope (frontend + edge functions + migrations).
2. Apply Supabase migrations in order.
3. Deploy Supabase edge functions changed in the release.
4. Deploy frontend artifact.
5. Run smoke tests:
   - Login and dashboard load.
   - Protected route access by plan.
   - Newsletter unsubscribe link.
   - Automation trigger endpoint auth.

## Rollback Procedure

1. Frontend rollback:
   - Re-deploy previous stable artifact.
2. Edge functions rollback:
   - Re-deploy previous function versions for affected endpoints.
3. Data rollback:
   - Prefer forward-fix migrations.
   - If needed, restore from pre-release backup/snapshot.
4. Validate smoke tests again.

## Incident Response

1. Triage severity (`SEV-1`, `SEV-2`, `SEV-3`).
2. Freeze deploys while incident is active.
3. Collect evidence:
   - Browser console and `client_error_events`.
   - Supabase function logs.
4. Mitigate (feature flag, rollback, hotfix).
5. Publish status update and ETA.
6. Run postmortem within 48h with action items.

## Operational Alerts (minimum)

- Error volume spike on `client_error_events`.
- Edge function non-2xx rate above baseline.
- Cron worker failures in `process-scheduled-messages` and `trigger-automations`.
