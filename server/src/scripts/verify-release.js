import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { verifyAuthEmailTokenFlow } from './auth-email-acceptance.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(serverRoot, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const baseDatabaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/yujian_lude';
const tempDbName = `yujian_lude_release_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const releasePort = Number(process.env.RELEASE_VERIFY_PORT || 8092);
const meaningOfMarriageEpubPath = process.env.MEANING_OF_MARRIAGE_EPUB_PATH
  || path.join(os.homedir(), 'Downloads', '婚姻的意义.epub');

let serverProcess = null;
let smtpServer = null;
const smtpMessages = [];
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

function handleSmtpConnection(socket) {
  let buffer = '';
  let acceptingData = false;
  socket.setEncoding('utf8');
  socket.write('220 release.example.test ESMTP\r\n');

  socket.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.length) {
      if (acceptingData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        smtpMessages.push(buffer.slice(0, end));
        buffer = buffer.slice(end + 5);
        acceptingData = false;
        socket.write('250 2.0.0 queued\r\n');
        continue;
      }

      const lineEnd = buffer.indexOf('\r\n');
      if (lineEnd < 0) return;
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);
      const command = line.split(' ', 1)[0].toUpperCase();

      if (command === 'EHLO' || command === 'HELO') {
        socket.write('250-release.example.test\r\n250 PIPELINING\r\n');
      } else if (command === 'DATA') {
        acceptingData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (command === 'QUIT') {
        socket.end('221 2.0.0 bye\r\n');
      } else if (['MAIL', 'RCPT', 'RSET', 'NOOP'].includes(command)) {
        socket.write('250 2.0.0 ok\r\n');
      } else {
        socket.write('250 2.0.0 ok\r\n');
      }
    }
  });
}

async function startSmtpSink() {
  smtpMessages.length = 0;
  smtpServer = net.createServer(handleSmtpConnection);
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    smtpServer.once('error', onError);
    smtpServer.listen(0, '127.0.0.1', () => {
      smtpServer.off('error', onError);
      resolve();
    });
  });
  return smtpServer.address().port;
}

async function stopSmtpSink() {
  if (!smtpServer) return;
  const current = smtpServer;
  smtpServer = null;
  await new Promise((resolve, reject) => {
    current.close((error) => error ? reject(error) : resolve());
  });
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

async function startServer(tempDatabaseUrl, port, smtpPort) {
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
      PUBLIC_APP_URL: 'https://release.example.test/app',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_FROM: '遇见路得发布验收 <no-reply@release.example.test>',
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
  await stopSmtpSink();
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

  await runCommand('前端 test', 'npm', ['run', 'test', '--prefix', 'web']);
  await runCommand('前端 lint', 'npm', ['run', 'lint', '--prefix', 'web']);
  await runCommand('前端 build', 'npm', ['run', 'build', '--prefix', 'web']);
  await runCommand('后端完整测试', 'npm', ['run', 'test', '--prefix', 'server'], {
    env: { TEST_DATABASE_URL: baseDatabaseUrl },
  });

  await createTempDatabase();
  await runCommand('fresh DB 迁移和 seed', 'npm', ['run', 'migrate', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  if (!existsSync(meaningOfMarriageEpubPath)) {
    throw new Error('缺少《婚姻的意义》EPUB；请通过 MEANING_OF_MARRIAGE_EPUB_PATH 指定授权文件');
  }
  await runCommand('fresh DB 导入《婚姻的意义》教材', 'npm', [
    'run',
    'import:textbook',
    '--prefix',
    'server',
    '--',
    '--file',
    meaningOfMarriageEpubPath,
    '--slug',
    'meaning-of-marriage',
    '--course',
    'keller-meaning-of-marriage',
    '--license-note',
    '用户确认拥有平台登录用户阅读授权',
  ], { env: { DATABASE_URL: tempDatabaseUrl } });
  await runCommand('fresh DB schema 诊断', 'npm', ['run', 'diagnose:schema', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  await runCommand('fresh DB 增量迁移演练', 'npm', ['run', 'migrate:up', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });
  await runCommand('fresh DB 增量迁移 dry-run', 'npm', ['run', 'migrate:up', '--prefix', 'server', '--', '--dry-run'], {
    env: { DATABASE_URL: tempDatabaseUrl },
  });

  const smtpPort = await startSmtpSink();
  await startServer(tempDatabaseUrl, port, smtpPort);
  await smokeRoutes(baseUrl, apiBase);

  console.log('\n[verify:release] 验收注册验证与密码重置邮件令牌的一次性消费');
  await verifyAuthEmailTokenFlow({
    apiBase,
    smtpMessages,
    email: `release.auth.${Date.now()}.${crypto.randomBytes(3).toString('hex')}@example.test`,
    password: 'Passw0rd!2026',
    newPassword: 'NewPassw0rd!2026',
  });

  await runCommand('MVP 闭环验收', 'npm', ['run', 'verify:mvp', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl, API_BASE: apiBase },
  });
  await runCommand('真实多用户回归验收', 'npm', ['run', 'verify:real-users', '--prefix', 'server'], {
    env: { DATABASE_URL: tempDatabaseUrl, API_BASE: apiBase, EXPECT_NO_DEV_TOKENS: 'true' },
  });
  if (smtpMessages.length < 1) {
    throw new Error('production mail verification did not deliver to the local SMTP sink');
  }

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
