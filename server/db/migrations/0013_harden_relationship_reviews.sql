ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS pastor_a_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pastor_b_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pastor_a_endorsement_id UUID REFERENCES endorsements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pastor_b_endorsement_id UUID REFERENCES endorsements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pastor_a_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pastor_b_approved_at TIMESTAMPTZ;

ALTER TABLE relationships
  DROP CONSTRAINT IF EXISTS relationships_user_a_user_b_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_one_active_pair
  ON relationships(user_a, user_b)
  WHERE state <> 'ended';

CREATE INDEX IF NOT EXISTS idx_relationships_pending_review
  ON relationships(state, created_at)
  WHERE state IN ('mutual_confirmed', 'pastoral_review');
