// 遇见路得 后端入口
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { attachUser } from './auth.js';

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

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser); // 解析 session cookie → req.user

// 健康检查
app.get('/api/health', (_req, res) => res.json({ ok: true, service: '遇见路得', ts: Date.now() }));

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

// 静态前端：首页在项目根目录，React 应用区构建产物挂到 /app。
const projectRoot = path.resolve(__dirname, '../../');
const appRoot = path.join(projectRoot, 'web-dist');

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
