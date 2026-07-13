import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import test from 'node:test';

const serverRoot = new URL('../..', import.meta.url);

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited before becoming healthy (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not become healthy in time');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 1_000).unref();
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function withServer(run) {
  const port = await availablePort();
  const output = [];
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:1/process_resilience_test',
      NODE_ENV: 'test',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl, child);
    await run(baseUrl, child);
  } catch (error) {
    error.message += `\nserver output:\n${output.join('')}`;
    throw error;
  } finally {
    await stopServer(child);
  }
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  return { response, body: await response.json() };
}

async function assertHealthy(baseUrl, child) {
  assert.equal(child.exitCode, null);
  const health = await jsonRequest(`${baseUrl}/api/health`);
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
}

test('non-string registration password returns 400 and keeps the process healthy', async () => {
  await withServer(async (baseUrl, child) => {
    const result = await jsonRequest(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-password@example.com', password: 12345678 }),
    });

    assert.equal(result.response.status, 400);
    await assertHealthy(baseUrl, child);
  });
});

test('invalid VIP days return 400 before authentication and keep the process healthy', async () => {
  await withServer(async (baseUrl, child) => {
    const result = await jsonRequest(`${baseUrl}/api/vip/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days: {} }),
    });

    assert.equal(result.response.status, 400);
    await assertHealthy(baseUrl, child);
  });
});

test('invalid textbook chapter index returns 400 before authentication and keeps the process healthy', async () => {
  await withServer(async (baseUrl, child) => {
    const result = await jsonRequest(`${baseUrl}/api/textbooks/meaning-of-marriage/chapters/not-a-number`);

    assert.equal(result.response.status, 400);
    await assertHealthy(baseUrl, child);
  });
});

test('async route rejection reaches error middleware and keeps the process healthy', async () => {
  await withServer(async (baseUrl, child) => {
    const result = await jsonRequest(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'database-error@example.com', password: 'valid-password' }),
    });

    assert.equal(result.response.status, 500);
    assert.equal(result.body.error, '服务器内部错误');
    await assertHealthy(baseUrl, child);
  });
});
