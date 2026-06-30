# 遇见路得运营后台与账户安全设计

日期：2026-06-30

## 目标

本轮把遇见路得从“可演示 MVP”推进到“可运营、可控风险”的内测版本。先补运营后台 v1，再补账户安全 v1。老家服务器部署进入下一轮部署计划，不在本轮同时修改服务器环境。

## 范围

| 模块 | 本轮纳入 | 本轮不纳入 |
|---|---|---|
| 运营后台 | 概览、待办、用户筛选与封禁、背书状态筛选、举报处理、社区管理员申请、牧者认证入口、管理员审计日志 | 复杂 CRM、导出报表、客服工单 |
| 账户安全 | 登录失败限流、密码找回/重置、改密后撤销其他 session、邮箱验证前端入口、基础安全文案统一 | 第三方邮件服务商、OAuth、2FA |
| 部署 | README 记录下一步部署到老家服务器的边界 | 本轮不 SSH 部署，不改线上服务 |

## 运营后台设计

后台保留 `/app/admin`，标签调整为：

1. 概览：显示用户数、VIP、待审背书、课程完成、待处理举报、牧者认证、社区管理员申请和最近审计记录。
2. 背书：支持 `pending / verified / rejected` 状态切换。
3. 用户：支持关键词、角色、封禁、邮箱验证筛选；可封禁/解封；可调整 `free / vip / pastor / admin` 角色。
4. 举报：支持查看 pending/resolved/dismissed；处理为 resolved/dismissed；帖子类举报可顺手删除目标帖子。
5. 认证/申请：审核牧者认证与社区管理员申请。
6. 配置：保留已有平台设置编辑。

后端新增 `admin_audit_logs` 表，并在以下操作写审计：

- 修改平台设置。
- 审核背书。
- 封禁/解封用户。
- 改用户角色。
- 处理举报。
- 删除帖子。
- 审核社区管理员申请。
- 审核牧者认证。

审计字段：`actor_id`、`action`、`target_type`、`target_id`、`detail`、`created_at`。

## 账户安全设计

### 登录失败限制

新增 `login_attempts` 表，按邮箱和 IP 记录失败次数。连续失败 5 次后锁定 15 分钟。成功登录后清空对应失败记录。

### 密码找回

新增 `password_reset_tokens` 表，存 `token_hash` 而不是明文 token。接口：

- `POST /api/auth/forgot-password`：总是返回 `{ ok: true }`，避免邮箱枚举；仅显式开启 `EXPOSE_DEV_TOKENS=true` 时可返回 `devToken`。
- `POST /api/auth/reset-password`：校验 token 后更新密码，标记 token 已使用，并撤销该用户全部旧 session。

### 改密码会话处理

用户在资料页修改密码成功后，删除该用户除当前 session 以外的其他 session。当前会话保留，避免用户刚改完密码就被踢出。

### 邮箱验证入口

复用已有 `send-verify` 和 `verify`。前端新增：

- 个人中心/资料页可看到邮箱验证状态。
- 未验证时可重发验证邮件。
- `/app/verify-email?token=...` 显示验证结果。

默认不返回 `devToken`；仅本地显式开启 `EXPOSE_DEV_TOKENS=true` 时返回调试 token，生产环境不返回 token。

## 数据与兼容

本项目当前 `schema.sql` 是 fresh install 脚本。本轮同步更新 `schema.sql` 和 `diagnose:schema`，保证 fresh DB 和 release 验收覆盖新增表。旧库保留数据上线时仍需单独写增量 SQL，不在本轮自动迁移旧库。

## 验收标准

| 验收项 | 通过标准 |
|---|---|
| 运营后台 | 管理员可看到概览、筛选用户、封禁/解封、切换背书状态、处理举报、审核认证/申请 |
| 审计 | 上述关键管理员操作均写入 `admin_audit_logs`，后台能看到最近记录 |
| 登录安全 | 错误密码达到阈值后返回 429，成功登录会清空失败记录 |
| 密码重置 | 忘记密码不泄漏邮箱存在性，重置成功后旧密码失效、旧 session 失效 |
| 邮箱验证 | 未验证用户可重发验证；验证链接可显示成功/失败 |
| 质量 | `npm run verify:release --prefix server` 通过 |
