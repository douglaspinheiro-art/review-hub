-- Round 5: Allow team members (admin/operator/viewer) to read audit_logs
-- for stores they are authorized to access. Previously only the store owner
-- (user_id = auth.uid()) could read audit entries.

CREATE POLICY "audit_logs_collaborator_read"
  ON audit_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth_team_read_store(store_id)
  );
