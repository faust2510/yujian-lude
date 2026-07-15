ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vip_pro_until TIMESTAMPTZ;

ALTER TABLE vip_subscription_requests
  DROP CONSTRAINT IF EXISTS vip_subscription_requests_tier_check,
  ADD CONSTRAINT vip_subscription_requests_tier_check
    CHECK (tier IN ('basic', 'pro'));

INSERT INTO app_settings (key, value, label)
VALUES (
  'pricing.vip_basic',
  '{"price":29,"currency":"CNY","period":"month","name":"基础 VIP","duration_days":30,"available":true,"payment_instructions":"请联系平台运营获取收款方式，付款后填写流水尾号。"}'::jsonb,
  '基础 VIP 月费'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, label)
VALUES (
  'pricing.vip_pro',
  '{"price":59,"currency":"CNY","period":"month","name":"进阶 VIP","duration_days":30,"available":true,"payment_instructions":"请联系平台运营获取收款方式，付款后填写流水尾号。"}'::jsonb,
  '进阶 VIP 月费'
)
ON CONFLICT (key) DO UPDATE
SET value = app_settings.value || '{"available":true,"payment_instructions":"请联系平台运营获取收款方式，付款后填写流水尾号。"}'::jsonb;
