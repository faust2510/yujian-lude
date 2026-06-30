# 遇见路得

自研的基督徒严肃婚恋服务原型。根路径提供官网首页，应用区挂载在 `/app`，后端 API 挂载在 `/api`。

## 当前版本

- 首页：项目根目录静态官网，作为用户第一入口。
- 应用区：React/Vite 单页应用，构建后由后端挂载到 `/app`。
- 后端：Node.js + Express + PostgreSQL，提供登录、资料、信仰测试、牧者背书、课程、匹配、私聊、广场和后台审核接口。
- 数据库：`server/db/schema.sql` 定义结构，`server/db/seed.sql` 提供基础种子数据。

## 运行方式

安装依赖：

```bash
npm install --prefix server
npm install --prefix web
```

准备本地 PostgreSQL 数据库并迁移：

```bash
createdb yujian_lude
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude' npm run migrate --prefix server
```

启动后端：

```bash
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude' PORT=8090 npm start --prefix server
```

开发应用区：

```bash
npm run dev --prefix web
```

生产构建应用区：

```bash
npm run build --prefix web
```

构建产物会直接输出到 `web-dist`。后端启动后访问：

- 官网首页：`http://localhost:8090/`
- 应用区：`http://localhost:8090/app`
- 健康检查：`http://localhost:8090/api/health`

## 真实 MVP 闭环验收

建议使用独立本地数据库，避免污染已有数据：

```bash
dropdb --if-exists yujian_lude_mvp_verify
createdb yujian_lude_mvp_verify
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' npm run migrate --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' PORT=8090 npm start --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' API_BASE='http://localhost:8090/api' npm run verify:mvp --prefix server
```

`verify:mvp` 会自动创建 3 个普通用户和 1 个管理员，并跑通资料、信仰测试、背书提交与审核、恋爱必修课、入池、匹配、私聊和全站广场互动。

更贴近真实用户行为的多账号验收可以用独立端口和数据库运行：

```bash
dropdb --if-exists yujian_lude_real_users_verify
createdb yujian_lude_real_users_verify
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' npm run migrate --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' PORT=8091 npm start --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' API_BASE='http://localhost:8091/api' npm run verify:real-users --prefix server
```

`verify:real-users` 会创建 5 个普通用户和 1 个管理员，覆盖签到持久化、未入池限制、多人入池、候选匹配、双向私聊、第三人无权访问私聊、全站帖跨账号可见、关注流、搜索、收藏、评论、点赞、通知、小组发帖审核、申请制小组审批和活动报名。

## 常用检查

```bash
node --test server/src/lib/*.test.js
npm run build --prefix web
```

## 下一步建议

建议按这个顺序继续做：

1. 把部署脚本固化为一键构建、同步和健康检查。
2. 增加后台运营面板的搜索、筛选和审计记录。
3. 接入真实 AI 咨询服务，并做用量扣减与风控。
4. 补齐订单、支付记录、退款说明和投诉处理链路。
