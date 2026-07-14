ALTER TABLE vip_subscription_requests
  ADD COLUMN IF NOT EXISTS payment_confirmation_reference CITEXT;

UPDATE vip_subscription_requests
   SET payment_confirmation_reference = 'LEGACY-' || id::text
 WHERE state = 'approved'
   AND payment_confirmation_reference IS NULL;

UPDATE users
   SET role = 'free', updated_at = now()
 WHERE role = 'vip';

ALTER TABLE vip_subscription_requests
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_user_id_fkey,
  ADD CONSTRAINT vip_subscription_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE vip_subscription_requests
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_reviewed_by_fkey,
  ADD CONSTRAINT vip_subscription_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE vip_subscription_requests
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_check,
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_state_integrity_check,
  ADD CONSTRAINT vip_subscription_requests_state_integrity_check CHECK (
    (state = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND activated_until IS NOT NULL AND payment_confirmation_reference IS NOT NULL)
    OR (state = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND activated_until IS NULL AND payment_confirmation_reference IS NULL)
    OR (state IN ('pending', 'cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL AND activated_until IS NULL AND payment_confirmation_reference IS NULL)
  );

ALTER TABLE vip_subscription_requests
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_confirmation_reference_check,
  ADD CONSTRAINT vip_subscription_requests_confirmation_reference_check CHECK (
    payment_confirmation_reference IS NULL
    OR (
      char_length(payment_confirmation_reference) BETWEEN 6 AND 100
      AND payment_confirmation_reference::text ~ '^[A-Za-z0-9_-]+$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vip_subscription_requests_confirmation_reference
  ON vip_subscription_requests(payment_confirmation_reference);
