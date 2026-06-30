# 遇见路得部署 Runbook

这份 runbook 用于服务器恢复在线后的发布。它不包含任何密码、token 或面板凭据；真实值只放在服务器 `.env` 或运维面板里。

## 1. 本地发布质检

在本机先跑完整 release gate：

```bash
npm run verify:release --prefix server
git status --short
```

验收通过后再推送 `main`。不要在有未确认脏状态时部署。

## 2. 服务器备份

在服务器进入应用目录，并从服务器本地 `.env` 读取环境变量：

```bash
set -euo pipefail
cd /opt/yujian-lude
set -a
. server/.env
set +a

export RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
export BACKUP_DIR="/opt/yujian-lude/backups/$RELEASE_ID"
mkdir -p "$BACKUP_DIR"
git rev-parse HEAD > "$BACKUP_DIR/git-revision.txt"
pg_dump --format=custom --file="$BACKUP_DIR/database.dump" "$DATABASE_URL"
tar -czf "$BACKUP_DIR/web-dist.tgz" web-dist
```

备份完成后确认文件存在：

```bash
test -s "$BACKUP_DIR/database.dump"
test -s "$BACKUP_DIR/git-revision.txt"
test -s "$BACKUP_DIR/web-dist.tgz"
```

## 3. 发布部署

```bash
set -euo pipefail
cd /opt/yujian-lude
git fetch origin main
git checkout main
git reset --hard origin/main

npm ci --prefix server
npm ci --prefix web
npm run build --prefix web
npm run migrate:up --prefix server
```

重启服务。按服务器实际进程管理器选择一种：

```bash
sudo systemctl restart yujian-lude
# 或：
pm2 restart yujian-lude
```

发布后探测：

```bash
curl -fsS http://127.0.0.1:8090/api/live
curl -fsS http://127.0.0.1:8090/api/ready
curl -fsS http://127.0.0.1:8090/app/login >/dev/null
```

如果服务器走 nginx 和域名，再从公网探测一次 `/api/ready`、`/app` 和 `/app/login`。

## 4. 回滚

优先回滚代码和构建产物：

```bash
set -euo pipefail
cd /opt/yujian-lude
export BACKUP_DIR="/opt/yujian-lude/backups/<release-id>"
git reset --hard "$(cat "$BACKUP_DIR/git-revision.txt")"
tar -xzf "$BACKUP_DIR/web-dist.tgz" -C .
npm ci --prefix server
sudo systemctl restart yujian-lude
curl -fsS http://127.0.0.1:8090/api/ready
```

只有在数据库迁移已经破坏数据或无法启动时，才恢复数据库备份。恢复前先停服务并额外保存当前故障现场：

```bash
set -euo pipefail
sudo systemctl stop yujian-lude
pg_dump --format=custom --file="$BACKUP_DIR/database.before-restore.dump" "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" "$BACKUP_DIR/database.dump"
sudo systemctl start yujian-lude
curl -fsS http://127.0.0.1:8090/api/ready
```

数据库恢复是高风险动作；执行后记录恢复使用的 `BACKUP_DIR`、恢复时间、当前 git commit 和 `/api/ready` 结果。
