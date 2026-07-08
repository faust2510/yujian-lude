# 遇见路得教材阅读系统设计

## 背景

当前课程模块已经支持课程单元、原创导读、阅读打卡和结课考试，但它还不是完整的教材阅读系统。用户明确希望把《婚姻的意义》这类教材纳入平台，让登录用户可以直接阅读全文，并把教材阅读和课程进度、考试、入池门槛连接起来。

用户已确认拥有《婚姻的意义》EPUB 用于平台登录用户阅读的授权。文件当前位于 `/Users/qwe/Downloads/婚姻的意义.epub`。实现时仍应避免把 EPUB 原文件提交到 GitHub；源文件应进入本地或服务器私有存储，解析后的章节内容进入数据库。

## 目标

第一期建设一个可扩展的教材系统，而不是只为一本书硬编码页面。

- 支持导入 EPUB 教材，并解析封面、目录和章节。
- 支持登录用户按章节阅读教材全文。
- 支持记录教材章节阅读进度。
- 支持课程单元绑定教材章节。
- 课程单元必须先完成绑定章节阅读，才能标记单元已读。
- 《婚姻的意义》课程使用该书章节作为主要教材来源，现有原创导读继续作为课程讲义和反思材料。
- 不把教材源文件放进公开静态目录，也不提交到仓库。

## 非目标

第一期不做以下内容：

- 不做全文搜索。
- 不做划线、批注、笔记。
- 不做复杂后台可视化 EPUB 编辑器。
- 不做公开下载整本书的接口。
- 不做 DRM 或强版权防复制技术，只做合理访问控制和不暴露源文件。
- 不重做课程考试逻辑，只让课程单元和教材章节阅读产生联动。

## 版权与访问控制

平台按“登录用户可阅读全文”的授权假设设计。为了降低误分发风险：

- EPUB 源文件保存在 `server/storage/textbooks/` 或服务器私有目录，不进入 `web-dist`。
- API 按章节返回正文，不提供整本书下载。
- 阅读接口需要登录。
- 每本教材保留 `license_note`、`source_filename`、`visibility` 字段。
- 默认 visibility 为 `login_required`。
- 后续如需将某教材限制为 VIP、指定课程、管理员可见，可在 `visibility` 上扩展，不影响第一期结构。

## 数据模型

新增表：

### `textbooks`

教材元数据。

- `id UUID PRIMARY KEY`
- `slug TEXT UNIQUE NOT NULL`
- `title TEXT NOT NULL`
- `author TEXT`
- `description TEXT`
- `cover_image TEXT`
- `source_filename TEXT`
- `license_note TEXT`
- `visibility TEXT NOT NULL DEFAULT 'login_required'`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `textbook_chapters`

教材章节。

- `id UUID PRIMARY KEY`
- `textbook_id UUID REFERENCES textbooks(id) ON DELETE CASCADE`
- `chapter_index INTEGER NOT NULL`
- `title TEXT NOT NULL`
- `body_html TEXT NOT NULL`
- `body_text TEXT`
- `source_href TEXT`
- `word_count INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`
- `UNIQUE(textbook_id, chapter_index)`

`body_html` 用于阅读器显示；导入时应做 HTML 清理，只保留正文需要的基础标签，如段落、标题、强调、列表、引用和脚注链接。

### `textbook_reading_progress`

用户教材章节阅读进度。

- `user_id UUID REFERENCES users(id) ON DELETE CASCADE`
- `chapter_id UUID REFERENCES textbook_chapters(id) ON DELETE CASCADE`
- `completed BOOLEAN NOT NULL DEFAULT FALSE`
- `completed_at TIMESTAMPTZ`
- `last_read_at TIMESTAMPTZ`
- `PRIMARY KEY(user_id, chapter_id)`

### `course_unit_readings`

课程单元绑定教材章节。

- `course_unit_id UUID REFERENCES course_units(id) ON DELETE CASCADE`
- `chapter_id UUID REFERENCES textbook_chapters(id) ON DELETE CASCADE`
- `required BOOLEAN NOT NULL DEFAULT TRUE`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `PRIMARY KEY(course_unit_id, chapter_id)`

一个课程单元可以绑定一个或多个章节。第一期《婚姻的意义》课程可按现有 10 个单元绑定相邻章节组。

## 后端 API

新增教材接口：

- `GET /api/textbooks`
  - 返回登录用户可见的教材列表和阅读概览。
- `GET /api/textbooks/:slug`
  - 返回教材元数据、章节目录、用户阅读进度。
- `GET /api/textbooks/:slug/chapters/:index`
  - 返回单章正文 HTML、前后章节、阅读状态。
- `POST /api/textbooks/:slug/chapters/:index/read`
  - 标记章节已读。

扩展课程详情接口：

- `GET /api/courses/:slug`
  - 每个 unit 增加 `readings` 数组，包含绑定教材章节的标题、教材 slug、章节 index、是否完成。

调整课程单元提交：

- `POST /api/courses/:slug/units/:index/submit`
  - 如果该单元存在 required 章节，必须全部完成阅读，才允许 `readConfirmed: true`。
  - 未完成时返回 409 和明确错误：`请先读完本单元绑定教材章节`。

新增导入脚本：

- `npm run import:textbook --prefix server -- --file "/Users/qwe/Downloads/婚姻的意义.epub" --slug meaning-of-marriage --course keller-meaning-of-marriage`
  - 解析 EPUB 元数据、封面、目录和正文。
  - upsert `textbooks` 与 `textbook_chapters`。
  - 可选按课程 slug 自动写入 `course_unit_readings` 初始绑定。

## 前端体验

### 课程页

课程单元展开后增加“教材阅读”区域：

- 显示绑定教材章节列表。
- 已读章节显示勾选。
- 未读章节提供“阅读章节”入口。
- 如果 required 章节未读，“我已阅读本单元”按钮禁用或点击后显示明确提示。

### 教材阅读器

新增页面：

- `/app/textbooks`
- `/app/textbooks/:slug`
- `/app/textbooks/:slug/chapters/:index`

阅读器布局：

- 顶部显示教材名、章节名、进度。
- 目录可折叠，移动端放在顶部或抽屉内。
- 正文使用可读排版：适中行宽、段落间距、基础字体大小。
- 底部有“标记本章已读”“上一章”“下一章”。
- 如果从课程单元进入，阅读完成后提供“回到课程单元”入口。

第一期不做复杂 UI 设置，但保留 CSS 类名，后续可加字体大小、行距、深色模式。

## EPUB 导入与清理

导入脚本流程：

1. 解压 EPUB 到临时目录。
2. 读取 `META-INF/container.xml` 找到 OPF。
3. 解析 OPF manifest、spine、metadata。
4. 读取 NCX 或 nav 文档生成章节标题。
5. 按 spine 顺序提取 HTML。
6. 清理 HTML：
   - 移除脚本、样式、外链事件属性。
   - 保留正文标签。
   - 图片第一期只保留封面；正文图片可暂时跳过或保留为私有资源引用。
7. 写入数据库。
8. 输出导入摘要：教材标题、章节数、是否绑定课程单元。

导入脚本不得把正文打印到终端，只输出元数据和统计。

## 《婚姻的意义》绑定策略

第一期使用现有 10 个课程单元作为教学结构，不改变课程考试：

1. 婚姻的秘密：服侍而非自我实现
2. 婚姻的权力：圣灵充满的婚姻
3. 婚姻的本质：盟约之爱
4. 婚姻的使命：彼此成全
5. 期中牧者确认
6. 恩典中的悔改
7. 单身与婚姻
8. 性与婚姻
9. 婚姻中的友谊与扶持
10. 结业牧者确认

导入后可先采用“顺序平均分配章节到 10 个单元”的自动绑定，再在后续管理功能中调整。为了第一期可落地，自动绑定结果只需要合理、可测试，不要求完全等同出版社章序教学法。

## 错误处理

- EPUB 文件不存在：导入脚本退出并提示路径。
- EPUB 缺少目录：按 spine 顺序生成章节标题，如“第 1 章”。
- 章节 HTML 为空：跳过并在导入摘要里报告。
- 教材未授权可见：API 返回 403。
- 课程单元绑定章节未读：提交单元返回 409。
- 导入重复执行：使用 slug 和 chapter index upsert，不产生重复教材。

## 测试与验收

自动化测试：

- EPUB 导入解析单测：给一个最小 EPUB fixture，确认能导入章节。
- HTML 清理测试：危险标签和事件属性被移除。
- API 测试：未登录不可读章节，登录可读章节。
- 课程提交测试：绑定章节未读时 409，读完后可提交单元。
- 迁移诊断测试：新增表存在。

浏览器冒烟：

- 打开教材库看到《婚姻的意义》。
- 打开教材目录和第一章正文。
- 标记第一章已读，目录进度更新。
- 从课程单元进入章节，读完后回到课程，单元阅读按钮可用。
- 移动端 390px 无横向溢出。

发布验证：

- `npm run test --prefix server`
- `npm run test --prefix web`
- `npm run migrate:up --prefix server`
- `npm run diagnose:schema --prefix server`
- `npm run verify:release --prefix server`

## 实施顺序

1. 数据库迁移：教材、章节、阅读进度、课程单元绑定。
2. EPUB 导入脚本和最小 fixture 测试。
3. 教材 API。
4. 课程 API 扩展与单元提交门槛。
5. 教材阅读器前端页面。
6. 课程页接入教材阅读入口。
7. 导入 `/Users/qwe/Downloads/婚姻的意义.epub` 到本地数据库。
8. 跑完整验证和浏览器冒烟。

## 开放问题

- 其他教材的授权状态需要逐本确认。
- 生产服务器私有存储路径需要部署时确定，建议 `/opt/yujian-lude/storage/textbooks` 或项目 `.env` 指定。
- 如果后续要做笔记、划线、搜索，应在第二期单独设计。
