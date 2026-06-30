import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(serverRoot, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const baseDatabaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/yujian_lude';
const tempDbName = `yujian_lude_release_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const releasePort = Number(process.env.RELEASE_VERIFY_PORT || 8092);

let serverProcess = null;
let tempDatabaseCreated = false;
let cleanupStarted = false;
let exiting = false;

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function connectionUrlWithDatabase(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function maintenanceUrl(connectionString) {
  return connectionUrlWithDatabase(connectionString, 'postgres');
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    ...extra,
  };
}

function runCommand(label, command, args, options = {}) {
  console.log(`\n[verify:release] ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: childEnv(options.env),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with ${signal || `exit ${code}`}`));
    });
  });
}

async function withAdminPool(callback) {
  const pool = new Pool({ connectionString: maintenanceUrl(baseDatabaseUrl) });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function createTempDatabase() {
  console.log(`\n[verify:release] 创建临时数据库：${tempDbName}`);
  await withAdminPool(async (pool) => {
    await pool.query(`CREATE DATABASE ${quoteIdent(tempDbName)}`);
  });
  tempDatabaseCreated = true;
}

async function dropTempDatabase() {
  if (!tempDatabaseCreated) return;
  console.log(`\n[verify:release] 删除临时数据库：${tempDbName}`);
  await withAdminPool(async (pool) => {
    await pool.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()`,
      [tempDbName]
    );
    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(tempDbName)}`);
  });
  tempDatabaseCreated = false;
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findPort(startPort) {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    throw new Error('RELEASE_VERIFY_PORT must be an integer from 1 to 65535');
  }
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + 49}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForHealth(apiBase, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverProcess && hasExited(serverProcess)) {
      throw new Error(`server exited before health check with ${serverProcess.signalCode || `code ${serverProcess.exitCode}`}`);
    }

    try {
      const res = await fetch(`${apiBase}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.ok === true) return;
        lastError = new Error(`health body was not ok: ${JSON.stringify(body)}`);
      } else {
        lastError = new Error(`health returned ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }

    await delay(500);
  }

  throw new Error(`health check did not pass within ${timeoutMs}ms: ${lastError?.message || 'unknown error'}`);
}

async function smokeRoute(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
}

async function smokeRoutes(baseUrl, apiBase) {
  console.log('\n[verify:release] 探测首页、应用区和健康检查');
  await waitForHealth(apiBase);
  await smokeRoute(`${apiBase}/health`);
  await smokeRoute(`${apiBase}/live`);
  await smokeRoute(`${apiBase}/ready`);
  await smokeRoute(`${baseUrl}/`);
  await smokeRoute(`${baseUrl}/app`);
  await smokeRoute(`${baseUrl}/app/login`);
}

async function startServer(tempDatabaseUrl, port) {
  console.log(`\n[verify:release] 启动后端临时服务：http://localhost:${port}`);
  serverProcess = spawn('npm', ['start', '--prefix', 'server'], {
    cwd: projectRoot,
    env: childEnv({
      DATABASE_URL: tempDatabaseUrl,
      PORT: String(port),
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      COOKIE_SECURE: 'true',
      NODE_ENV: 'production',
      EXPOSE_DEV_TOKENS: 'false',
    }),
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('[verify:release] 后端启动失败：', err.message);
  });
}

async function stopServer() {
  if (!serverProcess || hasExited(serverProcess)) return;
  console.log('\n[verify:release] 停止后端临时服务');
  serverProcess.kill('SIGTERM');
  const exit = once(serverProcess, 'exit');
  const forced = delay(5_000).then(async () => {
    if (!hasExited(serverProcess)) serverProcess.kill('SIGKILL');
    if (!hasExited(serverProcess)) await once(serverProcess, 'exit');
  });
  await Promise.race([exit, forced]);
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  await stopServer();
  await dropTempDatabase();
}

async function exitAfterCleanup(code, message) {
  if (exiting) return;
  exiting = true;
  console.error(message);
  try {
    await cleanup();
  } finally {
    process.exit(code);
  }
}

process.once('SIGINT', () => {
  void exitAfterCleanup(130, '\n[verify:release] 收到 SIGINT，正在清理临时服务和数据库。');
});

process.once('SIGTERM', () => {
  void exitAfterCleanup(143, '\n[verify:release] 收到 SIGTERM，正在清理临时服务和数据库。');
});

process.once('uncaughtException', (err) => {
  void exitAfterCleanup(1, `\n[verify:release] 未捕获异常：${err.message}`);
});

process.once('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  void exitAfterCleanup(1, `\n[verify:release] 未处理 Promise 拒绝：${message}`);
});

async function run() {
  const tempDatabaseUrl = connectionUrlWithDatabase(baseDatabaseUrl, tempDbName);
  const port = await findPort(releasePort);
  const baseUrl = `http://localhost:${port}`;
  const apiBase = `${baseUrl}/api`;

  console.log('[verify:release] 开始上线前完整体检。');
  console.log('[verify:release] 提示：会创建并删除一个临时 fresh DB；脚本自身不会主动打印连接串或 secret。');

  await runCommand('前端 lint', 'npm', ['run', 'lint', '--prefix', 'web']);
  await runCommand('前端 build', 'npm', ['run', 'build', '--prefix', 'web']);
  await runCommand('后端 lib 单测', 'npm', ['run', 'test', '--prefix', 'server']);

  await createTempDatabase();
  await runCommand('fresh DB 迁移和 seed', 'npm', ['run', 'migrate', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  await runCommand('fresh DB schema 诊断', 'npm', ['run', 'diagnose:schema', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  await runCommand('fresh DB 增量迁移演练', 'npm', ['run', 'migrate:up', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  await runCommand('fresh DB 增量迁移 dry-run', 'npm', ['run', 'migrate:up', '--prefix', 'server', '--', '--dry-run'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });

  await startServer(tempDatabaseUrl, port);
  await smokeRoutes(baseUrl, apiBase);

  await runCommand('MVP 闭环验收', 'npm', ['run', 'verify:mvp', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl, API_BASE: apiBase },
  });
  await runCommand('真实多用户回归验收', 'npm', ['run', 'verify:real-users', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl, API_BASE: apiBase, EXPECT_NO_DEV_TOKENS: 'true' },
  });

  console.log('\n[verify:release] PASS：上线前体检完成。');
}

run()
  .catch((err) => {
    console.error('\n[verify:release] FAIL：', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
