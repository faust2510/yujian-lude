ALTER TYPE relationship_state ADD VALUE IF NOT EXISTS 'relationship_requested';
ALTER TYPE relationship_state ADD VALUE IF NOT EXISTS 'mutual_confirmed';

ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS confirmation_requested_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS confirmation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_a_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_b_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_a_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_b_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT;
