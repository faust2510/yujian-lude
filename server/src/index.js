// 遇见路得 后端入口
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { attachUser } from './auth.js';
import { query } from './db.js';
import { formatReadiness } from './lib/readiness.js';

import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import pointsRoutes from './routes/points.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import vipRoutes from './routes/vip.routes.js';
import matchRoutes from './routes/match.routes.js';
import aiRoutes from './routes/ai.routes.js';
import adminRoutes from './routes/admin.routes.js';
import faithTestRoutes from './routes/faith-test.routes.js';
import pastorLetterRoutes from './routes/pastor-letter.routes.js';
import relationshipRoutes from './routes/relationships.routes.js';
import communityRoutes from './routes/community.routes.js';
import pastorCertRoutes from './routes/pastor-cert.routes.js';
import chatRoutes from './routes/chat.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const projectRoot = path.resolve(__dirname, '../../');
const appRoot = path.join(projectRoot, 'web-dist');

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser); // 解析 session cookie → req.user

// 健康检查
app.get('/api/health', (_req, res) => res.json({ ok: true, service: '遇见路得', ts: Date.now() }));
app.get('/api/live', (_req, res) => res.json({ ok: true, service: '遇见路得', ts: Date.now() }));
app.get('/api/ready', async (_req, res) => {
  const results = await Promise.all([
    checkDatabase(),
    checkTable('users'),
    checkTable('sessions'),
    checkStaticApp(),
  ]);
  const body = formatReadiness(results);
  res.status(body.ok ? 200 : 503).json(body);
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', pointsRoutes);
app.use('/api', coursesRoutes);
app.use('/api', vipRoutes);
app.use('/api', matchRoutes);
app.use('/api', aiRoutes);
app.use('/api', faithTestRoutes);
app.use('/api', pastorLetterRoutes);
app.use('/api', relationshipRoutes);
app.use('/api', communityRoutes);
app.use('/api', pastorCertRoutes);
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);

app.get('/app', (_req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'));
});
app.use('/app', express.static(appRoot, { index: 'index.html' }));
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'));
});

app.use(express.static(projectRoot, { index: 'index.html', extensions: ['html'] }));

// 兜底错误处理
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log(`遇见路得 后端已启动：http://localhost:${config.port}`);
});

async function checkDatabase() {
  try {
    await query('SELECT 1');
    return { name: 'database', ok: true };
  } catch (error) {
    return { name: 'database', ok: false, error };
  }
}

async function checkTable(tableName) {
  try {
    const { rows } = await query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
    return { name: `table:${tableName}`, ok: rows[0]?.table_name === tableName };
  } catch (error) {
    return { name: `table:${tableName}`, ok: false, error };
  }
}

async function checkStaticApp() {
  try {
    await fs.access(path.join(appRoot, 'index.html'));
    return { name: 'static_app', ok: true };
  } catch (error) {
    return { name: 'static_app', ok: false, error };
  }
}
