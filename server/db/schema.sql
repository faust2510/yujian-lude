-- ============================================================
-- 遇见路得 · 数据库 Schema（PostgreSQL）
-- 方案 v1 封板版落地 — 见《会员积分体系设计.md》
-- ------------------------------------------------------------
-- 设计原则：
--   1. 信任网络是核心 → 牧者/引荐人背书是决定性字段（faith_profiles + endorsements）
--   2. 曝光只认课程完成度 + 教会背书，不认钱 → exposure_score 不受 VIP 影响
--   3. 积分两个池子分开 → daily_credits（清零）与 earned_points（累积）
--   4. 价格/积分配置可被管理员改 → app_settings 集中存放，不写死在代码里
--   5. 邮箱+密码认证，session cookie
-- ============================================================

-- 扩展：UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- 扩展：大小写不敏感文本（用于邮箱字段）
CREATE EXTENSION IF NOT EXISTS "citext";

-- 版本化增量迁移记录。schema.sql 仍作为 fresh install 初始化脚本。
CREATE TABLE schema_migrations (
    version    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 枚举类型
-- ------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('free', 'vip', 'pastor', 'admin');  -- v3: 新增 pastor 角色
CREATE TYPE endorsement_kind AS ENUM ('pastor', 'referrer');          -- 牧者 / 引荐人
CREATE TYPE endorsement_state AS ENUM ('pending', 'verified', 'rejected'); -- 待背书/已背书/驳回
CREATE TYPE match_status     AS ENUM ('suggested', 'intent_sent', 'matched', 'under_review', 'approved', 'declined');
CREATE TYPE course_state     AS ENUM ('not_started', 'in_progress', 'pastor_review', 'completed');
CREATE TYPE points_pool      AS ENUM ('daily', 'earned');             -- 每日池(清零) / 赚取池(累积)
CREATE TYPE ledger_direction AS ENUM ('credit', 'debit');            -- 进账 / 出账

-- ============================================================
-- 1. users — 账户与分级
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT UNIQUE NOT NULL,              -- 邮箱登录（大小写不敏感）
    password_hash   TEXT NOT NULL,                       -- bcrypt
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    role            user_role NOT NULL DEFAULT 'free',
    vip_until       TIMESTAMPTZ,                         -- VIP 到期时间；NULL=非VIP。完课送14天体验写这里
    is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
    last_checkin_on DATE,                                -- 最近签到日期（判定当天是否已签）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. profiles — 婚恋基础资料（接住前端现有字段）
-- ============================================================
CREATE TABLE profiles (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nickname     TEXT,
    city         TEXT,
    birth_year   INTEGER,                                -- 前端 birthYear，校验 1940..(今年-18)
    education    TEXT,                                   -- 本科/硕士/博士...
    goal         TEXT,                                   -- 婚恋目标
    preference   TEXT,                                   -- 期望对象
    intro        TEXT,                                   -- 自我介绍
    privacy_ok   BOOLEAN NOT NULL DEFAULT FALSE,         -- 隐私授权
    completion   SMALLINT NOT NULL DEFAULT 0,            -- 资料完整度 0-100（服务端计算）
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. faith_profiles — 信仰档案（信任网络核心，六项信仰字段）
-- ============================================================
CREATE TABLE faith_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    church_name    TEXT,        -- 所属教会 / 堂会
    presbytery     TEXT,        -- 区会 / 宗派（同区会优先匹配）
    region         TEXT,        -- 地区
    denomination   TEXT,        -- 信仰背景 / 宗派细分（改革宗/长老会/广义福音派...）
    baptism_date   DATE,        -- 受洗时间
    testimony      TEXT,        -- 见证
    faith_years    SMALLINT,    -- 信主 / 决志年数
    coworker       TEXT,        -- 同工 / 负责人（选填）
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. endorsements — 牧者/引荐人背书（必填且决定性最大）
--    硬门槛：至少 1 个 verified 的 pastor 背书才进匹配池
--    两步走：MVP 人工抽查(admin 改 state)；二期邮件链接自动确认
-- ============================================================
CREATE TABLE endorsements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            endorsement_kind NOT NULL,           -- pastor / referrer
    name            TEXT NOT NULL,                       -- 牧者/引荐人姓名
    contact         TEXT NOT NULL,                       -- 联系方式（邮箱/电话）
    church          TEXT,                                -- 其所在教会
    state           endorsement_state NOT NULL DEFAULT 'pending',
    verify_token    TEXT,                                -- 二期：邮件确认 token
    verified_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES users(id),           -- MVP：哪个 admin 抽查通过的
    note            TEXT,                                -- 审核备注
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_endorsements_user ON endorsements(user_id);
CREATE INDEX idx_endorsements_state ON endorsements(state);

-- ============================================================
-- 5. courses / course_units / course_progress — 婚姻课程（曝光主货币）
-- ============================================================
CREATE TABLE courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT UNIQUE NOT NULL,                  -- keller-meaning-of-marriage
    title         TEXT NOT NULL,                         -- 婚姻的意义
    subtitle      TEXT,                                  -- 提摩太·凯勒 著 · 改革宗婚姻神学
    description   TEXT,
    cover_image   TEXT,
    is_published  BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order    SMALLINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_units (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    unit_index       SMALLINT NOT NULL,                  -- 1..10+ 单元序号
    title            TEXT NOT NULL,
    material         TEXT,                               -- 阅读材料（或指向 RAG 资料的引用）
    is_pastor_node   BOOLEAN NOT NULL DEFAULT FALSE,     -- 是否关键节点(需牧者确认) — 期中+结业 2-3个
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, unit_index)
);

CREATE TABLE course_progress (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    state            course_state NOT NULL DEFAULT 'not_started',
    units_done       SMALLINT NOT NULL DEFAULT 0,        -- 已完成单元数
    pastor_confirmed SMALLINT NOT NULL DEFAULT 0,        -- 已通过的牧者节点数
    completed_at     TIMESTAMPTZ,                        -- 整门完成时间（触发 +300分、翻倍曝光、徽章、14天VIP）
    badge_awarded    BOOLEAN NOT NULL DEFAULT FALSE,     -- 「已完成婚姻装备」徽章
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, course_id)
);

-- 单元级答题记录（AI 出题问答判定）
CREATE TABLE unit_attempts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id      UUID NOT NULL REFERENCES course_units(id) ON DELETE CASCADE,
    passed       BOOLEAN NOT NULL DEFAULT FALSE,
    score        SMALLINT,
    qa_log       JSONB,                                  -- AI 问答记录
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, unit_id)
);
CREATE INDEX idx_unit_attempts_user ON unit_attempts(user_id);

-- ============================================================
-- 6. exposure — 曝光分（只认课程 + 背书，钱买不到）
--    匹配排序读这张表；VIP 不影响它
-- ============================================================
CREATE TABLE exposure (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_score     INTEGER NOT NULL DEFAULT 100,         -- 基础分
    endorsement_bonus INTEGER NOT NULL DEFAULT 0,        -- 教会背书加分
    course_multiplier NUMERIC(3,1) NOT NULL DEFAULT 1.0, -- 完课翻倍 → 2.0
    computed_score INTEGER NOT NULL DEFAULT 100,         -- = (base+bonus)*multiplier，服务端算
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. points_ledger — 积分流水（两个池子分开）
--    daily 池当天清零；earned 池累积。balance 由聚合计算或单独维护
-- ============================================================
CREATE TABLE points_ledger (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pool         points_pool NOT NULL,                   -- daily / earned
    direction    ledger_direction NOT NULL,              -- credit / debit
    amount       INTEGER NOT NULL CHECK (amount > 0),
    reason       TEXT NOT NULL,                          -- checkin / profile_done / endorsement_done / email_verified / course_done / intent_sent / redeem_vip
    ref_id       UUID,                                   -- 关联对象（课程/兑换等）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_points_ledger_user ON points_ledger(user_id, created_at DESC);

-- 用户当前积分余额（缓存表，避免每次聚合）
CREATE TABLE points_balance (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    earned_total INTEGER NOT NULL DEFAULT 0,             -- 累积池余额
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. matches — 匿名匹配与意向流转
-- ============================================================
CREATE TABLE matches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 发起方
    target_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 候选方
    reason       TEXT,                                   -- 匹配理由
    status       match_status NOT NULL DEFAULT 'suggested',
    intent_sent_at TIMESTAMPTZ,                          -- 最近一次真实表达心动的时间；跳过不刷新
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, target_id)
);
CREATE INDEX idx_matches_user ON matches(user_id);

-- 「谁看过我」（VIP 便利）
CREATE TABLE profile_views (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profile_views_viewed ON profile_views(viewed_id, viewed_at DESC);

-- ============================================================
-- 9. ai_consultations — AI 咨询记录（完全免费、不限量，仅留痕）
-- ============================================================
CREATE TABLE ai_consultations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question     TEXT NOT NULL,
    answer       TEXT,
    rag_sources  JSONB,                                  -- 命中的知识库片段引用
    out_of_scope BOOLEAN NOT NULL DEFAULT FALSE,         -- 超范围 → 引导找牧者
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_consultations_user ON ai_consultations(user_id, created_at DESC);

-- ============================================================
-- 10. app_settings — 管理员可改的全局配置（不写死在代码）
--     价格、积分奖励、兑换比例、每日额度等全放这里
-- ============================================================
CREATE TABLE app_settings (
    key          TEXT PRIMARY KEY,
    value        JSONB NOT NULL,
    label        TEXT,                                   -- 后台显示用
    updated_by   UUID REFERENCES users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 管理员操作审计
CREATE TABLE admin_audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    target_type  TEXT NOT NULL,
    target_id    UUID,
    detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_admin_audit_logs_actor ON admin_audit_logs(actor_id, created_at DESC);

-- ============================================================
-- 11. sessions — 登录会话（session cookie）
-- ============================================================
CREATE TABLE sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT UNIQUE NOT NULL,                   -- 随机会话 token，存进 httpOnly cookie
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- 登录失败限流
CREATE TABLE login_attempts (
    email          CITEXT NOT NULL,
    ip             INET NOT NULL,
    failed_count   SMALLINT NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (email, ip)
);
CREATE INDEX idx_login_attempts_locked ON login_attempts(locked_until);

-- ============================================================
-- 12. faith_tests — 信仰知识测试（v2 新增，入池前提）
--     不通过可用平台，但不进匹配池（与牧者背书并行的软门槛）
-- ============================================================
CREATE TABLE faith_tests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score        SMALLINT NOT NULL,                      -- 答对题数（满分 20）
    passed       BOOLEAN NOT NULL,                       -- score >= 15 视为通过
    answers      JSONB,                                  -- 用户答题记录 [{q:1,a:"B"},...]
    attempt_no   SMALLINT NOT NULL DEFAULT 1,            -- 第几次尝试（允许重考）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_faith_tests_user ON faith_tests(user_id, created_at DESC);

-- ============================================================
-- 13. pastor_letters — 牧者介绍信（v2 新增）
--     非强制；有介绍信信任分更高；仅双方（配对成功后）可见
-- ============================================================
CREATE TABLE pastor_letters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 被介绍的用户
    pastor_name     TEXT NOT NULL,
    pastor_contact  TEXT NOT NULL,                       -- 邮箱/电话
    family_note     TEXT,                                -- 家庭情况
    faith_note      TEXT,                                -- 信仰情况
    spiritual_note  TEXT,                                -- 属灵生命状态
    church_life_note TEXT,                               -- 教会生活参与
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,      -- 管理员核实真实性
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pastor_letters_user ON pastor_letters(user_id);

-- ============================================================
-- v3 新表
-- ============================================================

-- 14. relationships — 关系确认生命周期
CREATE TYPE relationship_state AS ENUM ('chatting', 'exam_required', 'pastoral_review', 'confirmed', 'ended');
CREATE TABLE relationships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state           relationship_state NOT NULL DEFAULT 'chatting',
    -- 考试门槛（发起确认前双方必须完成恋爱课+考试）
    user_a_exam_passed  BOOLEAN NOT NULL DEFAULT FALSE,
    user_b_exam_passed  BOOLEAN NOT NULL DEFAULT FALSE,
    -- 牧者审核（双方牧者各自点头）
    pastor_a_approved   BOOLEAN NOT NULL DEFAULT FALSE,
    pastor_b_approved   BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at    TIMESTAMPTZ,                         -- 关系正式确立时间
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_a, user_b)
);
CREATE INDEX idx_relationships_users ON relationships(user_a, user_b);

-- 15. chat_channels — 匹配后的私聊通道
CREATE TABLE chat_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_a      UUID NOT NULL REFERENCES users(id),
    user_b      UUID NOT NULL REFERENCES users(id),
    opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ,                             -- 进入确认期后关闭匹配，但聊天保留
    UNIQUE (user_a, user_b)
);
CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id  UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at);

-- 16. course_exam_attempts — 恋爱课考试记录（发起关系确认的前提）
CREATE TABLE course_exam_attempts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID NOT NULL REFERENCES courses(id),
    score       SMALLINT NOT NULL,
    passed      BOOLEAN NOT NULL,
    answers     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_user_course ON course_exam_attempts(user_id, course_id, created_at DESC);

-- 17. community_groups — 小组（地区+兴趣混合分类）
CREATE TYPE group_category AS ENUM ('region', 'interest', 'presbytery', 'denomination', 'global');
CREATE TYPE group_join_policy AS ENUM ('open', 'apply');
CREATE TABLE community_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    category    group_category NOT NULL DEFAULT 'interest',
    join_policy group_join_policy NOT NULL DEFAULT 'apply',
    cover_image TEXT,                                    -- 小组封面图 URL
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. community_posts — 社群帖子（发帖需进入匹配池）
CREATE TYPE post_state AS ENUM ('visible', 'pinned', 'removed', 'featured');
CREATE TYPE post_type AS ENUM ('post', 'event', 'announcement');
CREATE TYPE moderation_state AS ENUM ('approved', 'pending', 'rejected');
CREATE TABLE community_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id        UUID REFERENCES community_groups(id),    -- NULL = 全站广场
    post_type       post_type NOT NULL DEFAULT 'post',
    title           TEXT,
    body            TEXT NOT NULL,
    image_url       TEXT,                                    -- 图文混排图片 URL
    state           post_state NOT NULL DEFAULT 'visible',
    moderation      moderation_state NOT NULL DEFAULT 'approved',
    pinned_by       UUID REFERENCES users(id),
    featured_by     UUID REFERENCES users(id),               -- 精华帖标记
    removed_by      UUID REFERENCES users(id),
    removed_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_group ON community_posts(group_id, created_at DESC);
CREATE INDEX idx_posts_moderation ON community_posts(group_id, moderation) WHERE moderation = 'pending';

-- 19. community_admin_applications — 社区管理员申请
CREATE TYPE comm_admin_state AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE community_admin_applications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id    UUID REFERENCES community_groups(id),
    reason      TEXT,                                    -- 申请理由
    state       comm_admin_state NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. pastor_certifications — 牧者认证申请
CREATE TYPE pastor_cert_state AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE pastor_certifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    church_name     TEXT NOT NULL,
    denomination    TEXT,
    ordination_year SMALLINT,
    contact_email   TEXT NOT NULL,
    supporting_docs JSONB,                               -- 文件链接/说明
    state           pastor_cert_state NOT NULL DEFAULT 'pending',
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 21. community_likes — 帖子点赞
-- ============================================================
CREATE TABLE community_likes (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id   UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

-- ============================================================
-- 22. community_comments — 帖子评论（支持嵌套回复）
-- ============================================================
CREATE TABLE community_comments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id      UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id    UUID REFERENCES community_comments(id) ON DELETE CASCADE,  -- NULL = 根评论
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post ON community_comments(post_id, created_at);

-- ============================================================
-- 23. community_follows — 用户关注
-- ============================================================
CREATE TABLE community_follows (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_follows_follower ON community_follows(follower_id);
CREATE INDEX idx_follows_followee ON community_follows(followee_id);

-- ============================================================
-- 24. community_hashtags — 话题标签
-- ============================================================
CREATE TABLE community_hashtags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag        TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 25. community_post_hashtags — 帖子-标签关联
-- ============================================================
CREATE TABLE community_post_hashtags (
    post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    hashtag_id UUID NOT NULL REFERENCES community_hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
);

-- ============================================================
-- 26. notifications — 通知系统
-- ============================================================
CREATE TYPE notif_kind AS ENUM ('like', 'comment', 'reply', 'follow', 'group_join', 'post_approved', 'post_featured', 'event_new', 'report_resolved');
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 被通知者
    actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 操作者
    kind        notif_kind NOT NULL,
    post_id     UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    comment_id  UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

-- 邮箱验证 token
CREATE TABLE email_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 密码找回 token（只存 hash）
CREATE TABLE password_reset_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC);

-- ============================================================
-- v4 社区升级新表
-- ============================================================

-- 27. community_memberships — 小组成员关系
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE membership_state AS ENUM ('approved', 'pending', 'rejected', 'kicked');
CREATE TABLE community_memberships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    role        membership_role NOT NULL DEFAULT 'member',
    state       membership_state NOT NULL DEFAULT 'approved',
    approved_by UUID REFERENCES users(id),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, group_id)
);
CREATE INDEX idx_memberships_group ON community_memberships(group_id, state);
CREATE INDEX idx_memberships_user ON community_memberships(user_id);

-- 28. community_bookmarks — 帖子收藏
CREATE TABLE community_bookmarks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

-- 29. community_reports — 举报
CREATE TYPE report_target AS ENUM ('post', 'comment', 'user');
CREATE TYPE report_reason AS ENUM ('spam', 'inappropriate', 'fraud', 'harassment', 'other');
CREATE TYPE report_state AS ENUM ('pending', 'resolved', 'dismissed');
CREATE TABLE community_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type report_target NOT NULL,
    target_id   UUID NOT NULL,
    reason      report_reason NOT NULL,
    detail      TEXT,
    state       report_state NOT NULL DEFAULT 'pending',
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_state ON community_reports(state, created_at DESC);

-- 30. community_events — 线上活动
CREATE TABLE community_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    post_id     UUID REFERENCES community_posts(id) ON DELETE SET NULL,  -- 关联帖子
    title       TEXT NOT NULL,
    description TEXT,
    location    TEXT,                                    -- 线上会议链接/线下地址
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ,
    max_attendees SMALLINT,                              -- NULL = 不限
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_group ON community_events(group_id, starts_at);

-- 31. community_event_rsvps — 活动报名
CREATE TABLE community_event_rsvps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'going',           -- 'going'|'interested'|'cancelled'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);
