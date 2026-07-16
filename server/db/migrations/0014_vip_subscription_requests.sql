DO $$
BEGIN
  CREATE TYPE vip_subscription_state AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vip_subscription_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier              TEXT NOT NULL CHECK (tier = 'basic'),
    plan_snapshot     JSONB NOT NULL,
    amount_minor      INTEGER NOT NULL CHECK (amount_minor > 0),
    currency          TEXT NOT NULL CHECK (char_length(currency) BETWEEN 3 AND 12),
    duration_days     SMALLINT NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
    payment_reference TEXT NOT NULL CHECK (char_length(payment_reference) BETWEEN 4 AND 32),
    applicant_note    TEXT,
    state             vip_subscription_state NOT NULL DEFAULT 'pending',
    reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    review_note       TEXT,
    activated_until   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (state = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND activated_until IS NOT NULL)
      OR (state = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND activated_until IS NULL)
      OR (state IN ('pending', 'cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL AND activated_until IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vip_subscription_requests_one_pending
  ON vip_subscription_requests(user_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_vip_subscription_requests_state
  ON vip_subscription_requests(state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vip_subscription_requests_user
  ON vip_subscription_requests(user_id, created_at DESC);

INSERT INTO app_settings (key, value, label)
VALUES (
  'pricing.vip_basic',
  '{"price":29,"currency":"CNY","period":"month","name":"基础 VIP","duration_days":30,"available":true,"payment_instructions":"请联系平台运营获取收款方式，付款后填写流水尾号。"}'::jsonb,
  '基础 VIP 月费'
)
ON CONFLICT (key) DO UPDATE
SET value = app_settings.value || '{"duration_days":30,"available":true,"payment_instructions":"请联系平台运营获取收款方式，付款后填写流水尾号。"}'::jsonb;

INSERT INTO app_settings (key, value, label)
VALUES (
  'pricing.vip_pro',
  '{"price":59,"currency":"CNY","period":"month","name":"进阶 VIP","duration_days":30,"available":false,"payment_instructions":"进阶套餐暂未开放。"}'::jsonb,
  '进阶 VIP 月费'
)
ON CONFLICT (key) DO UPDATE
SET value = app_settings.value || '{"duration_days":30,"available":false,"payment_instructions":"进阶套餐暂未开放。"}'::jsonb;
