CREATE UNIQUE INDEX IF NOT EXISTS idx_points_admin_adjustment_operation
  ON points_ledger(reason, ref_id)
  WHERE reason = 'points.admin_adjustment' AND ref_id IS NOT NULL;
