-- ============================================================
-- 遇见路得 · 初始数据 Seed（方案 v1 锁定数值）
-- 在 schema.sql 之后执行
-- ============================================================

-- ------------------------------------------------------------
-- app_settings — 所有可被管理员后台修改的配置
-- 数值全部来自《会员积分体系设计.md》封板版
-- ------------------------------------------------------------
-- 兼容早期 schema：打卡提交使用 ON CONFLICT (user_id, unit_id)，真实库必须有唯一索引。
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_attempts_user_unit_unique ON unit_attempts(user_id, unit_id);

INSERT INTO app_settings (key, value, label) VALUES

-- VIP 套餐定价（第一阶段纯软件便利，对标海外华人基督徒群体）
('pricing.vip_basic',   '{"price": 29, "currency": "CNY", "period": "month", "name": "基础 VIP"}', '基础 VIP 月费'),
('pricing.vip_pro',     '{"price": 59, "currency": "CNY", "period": "month", "name": "进阶 VIP"}', '进阶 VIP 月费'),

-- 积分奖励配置
('points.daily_checkin',      '{"amount": 10, "pool": "daily"}',    '每日签到积分'),
('points.profile_complete',   '{"amount": 50, "pool": "earned", "once": true}', '完善资料(一次性)'),
('points.endorsement_done',   '{"amount": 50, "pool": "earned", "once": true}', '完成背书(一次性)'),
('points.email_verified',     '{"amount": 20, "pool": "earned", "once": true}', '验证邮箱(一次性)'),
('points.course_complete',    '{"amount": 300, "pool": "earned"}',  '完成精品课(主要来源)'),
('points.intent_sent',        '{"amount": 10, "pool": "earned", "daily_cap": 1}', '看完资料并发意向(每日封顶1)'),

-- 兑换比例：100 分 = 1 天 VIP 体验
('redeem.vip_per_day',  '{"points": 100, "days": 1}',  'VIP 体验兑换比例'),

-- 完课奖励
('course.completion_vip_days', '{"days": 14}',          '完课赠送 VIP 体验天数'),
('course.exposure_multiplier', '{"value": 2.0}',        '完课曝光倍数(翻倍)'),

-- 曝光分配置（只认课程+背书，不认钱）
('exposure.base',                 '{"value": 100}',     '曝光基础分'),
('exposure.endorsement_bonus',    '{"value": 50}',      '教会背书加分'),

-- 匹配门槛（硬门槛：信仰测试通过 + 牧者/成熟引荐人背书 + 恋爱必修课）
('match.require_verified_pastor', 'true',  '进匹配池需已验证牧者或成熟引荐人背书'),
('match.require_faith_test',      'true',  '进匹配池需通过信仰知识测试'),
('match.require_light_course',    'true',  '进匹配池需完成恋爱必修课'),
('match.light_course_id', '"22222222-2222-2222-2222-222222222222"', '恋爱必修课课程 ID'),

-- 每日主动次数额度（VIP 便利点）
('limits.daily_intents_free',  '{"value": 3}',          '免费用户每日主动次数'),
('limits.daily_intents_vip',   '{"value": 15}',         'VIP 每日主动次数')

ON CONFLICT (key) DO NOTHING;

UPDATE app_settings
   SET value = '"22222222-2222-2222-2222-222222222222"',
       label = '恋爱必修课课程 ID',
       updated_at = now()
 WHERE key = 'match.light_course_id'
   AND value = '"11111111-1111-1111-1111-111111111111"';

-- ------------------------------------------------------------
-- 首门精品课：凯勒《婚姻的意义》（MVP 只做这一门）
-- 10 个单元，期中(第5单元)+结业(第10单元) 为牧者确认节点
-- ------------------------------------------------------------
INSERT INTO courses (id, slug, title, subtitle, description, is_published, sort_order)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'keller-meaning-of-marriage',
  '婚姻的意义',
  '提摩太·凯勒 著 · 改革宗婚姻神学经典',
  '以凯勒《婚姻的意义》为蓝本的深度查经课程。读材料、AI 出题问答、关键节点牧者确认，完成后获得「已完成婚姻装备」徽章、曝光翻倍与 14 天 VIP 体验。',
  TRUE,
  1
)
ON CONFLICT (slug) DO NOTHING;

-- 10 个单元（第 5、10 单元为牧者确认节点：期中 + 结业）
INSERT INTO course_units (course_id, unit_index, title, is_pastor_node) VALUES
('11111111-1111-1111-1111-111111111111',  1, '婚姻的秘密：服侍而非自我实现', FALSE),
('11111111-1111-1111-1111-111111111111',  2, '婚姻的权力：圣灵充满的婚姻', FALSE),
('11111111-1111-1111-1111-111111111111',  3, '婚姻的本质：盟约之爱', FALSE),
('11111111-1111-1111-1111-111111111111',  4, '婚姻的使命：彼此成全', FALSE),
('11111111-1111-1111-1111-111111111111',  5, '【期中 · 牧者确认】爱你心中的陌生人', TRUE),
('11111111-1111-1111-1111-111111111111',  6, '拥抱另一个自我：恩典中的悔改', FALSE),
('11111111-1111-1111-1111-111111111111',  7, '单身与婚姻：从永恒看当下', FALSE),
('11111111-1111-1111-1111-111111111111',  8, '性与婚姻：身体的盟约语言', FALSE),
('11111111-1111-1111-1111-111111111111',  9, '婚姻中的友谊与扶持', FALSE),
('11111111-1111-1111-1111-111111111111', 10, '【结业 · 牧者确认】走向终生的盟约', TRUE)
ON CONFLICT (course_id, unit_index) DO NOTHING;

-- ------------------------------------------------------------
-- 入池轻量课：恋爱必修课（无需牧者确认节点）
-- 作为匹配池前置门槛；凯勒深度课继续承担装备徽章/曝光奖励。
-- ------------------------------------------------------------
INSERT INTO courses (id, slug, title, subtitle, description, is_published, sort_order)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'christian-dating-basics',
  '恋爱必修课',
  '进入匹配池前的轻量关系预备',
  '面向进入匹配池前的基础预备课程。完成若干单元打卡即可，不需要牧者确认节点；重点帮助用户理解边界、沟通、责任与长期关系预备。',
  TRUE,
  2
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_units (course_id, unit_index, title, is_pastor_node) VALUES
('22222222-2222-2222-2222-222222222222', 1, '为什么先预备，再开始认识', FALSE),
('22222222-2222-2222-2222-222222222222', 2, '认识中的边界、节奏与诚实', FALSE),
('22222222-2222-2222-2222-222222222222', 3, '如何沟通信仰、家庭与未来期待', FALSE),
('22222222-2222-2222-2222-222222222222', 4, '从心动走向负责任的下一步', FALSE)
ON CONFLICT (course_id, unit_index) DO NOTHING;
