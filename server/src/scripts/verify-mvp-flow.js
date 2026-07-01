import pg from 'pg';
import { courseExamAnswers } from '../lib/course-exams.js';
import { QUESTIONS } from '../lib/faith-questions.js';

const { Pool } = pg;

const apiBase = process.env.API_BASE || 'http://localhost:8090/api';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[verify-mvp] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

class ApiClient {
  constructor(label) {
    this.label = label;
    this.cookie = '';
  }

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const error = new Error(`${this.label} ${method} ${path} failed: ${res.status} ${data?.error || text}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectStatus(client, method, path, body, status) {
  try {
    await client.request(method, path, body);
  } catch (err) {
    assert(err.status === status, `${client.label} ${method} ${path} expected ${status}, got ${err.status}`);
    return err.data;
  }
  throw new Error(`${client.label} ${method} ${path} expected ${status}, got 2xx`);
}

async function register(client, email, nickname) {
  const data = await client.post('/auth/register', {
    email,
    password: 'Passw0rd!2026',
    nickname,
  });
  assert(data.user?.id, `register ${email} did not return user id`);
  return data.user;
}

async function verifyDailyCheckin(client) {
  const before = await client.get('/me/points');
  assert(before.checkedInToday === false, 'new user should not be checked in yet');
  await client.post('/me/checkin', {});
  const after = await client.get('/me/points');
  assert(after.checkedInToday === true, 'checkin should persist checkedInToday');
  assert(after.daily === 10, `checkin should add 10 daily points, got ${after.daily}`);
  assert(after.earned === before.earned + 10, `checkin should add 10 earned points, got before=${before.earned} after=${after.earned}`);
  await expectStatus(client, 'POST', '/me/checkin', {}, 409);
}

async function makeAdmin(userId) {
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
}

async function completeProfile(client, index) {
  const profile = await client.put('/me/profile', {
    nickname: `路得测试${index}`,
    city: index === 1 ? '杭州' : index === 2 ? '上海' : '南京',
    birth_year: 1990 + index,
    education: index === 3 ? '博士' : '硕士',
    goal: 'serious',
    preference: '认真预备婚姻，愿意在教会群体中被认识和陪伴。',
    intro: `我是第 ${index} 位 MVP 验证用户，资料用于自动化闭环验收。`,
    privacy_ok: true,
  });
  assert(profile.completion === 100, `profile ${index} completion expected 100, got ${profile.completion}`);

  await client.put('/me/faith', {
    church_name: `测试长老教会 ${index}`,
    presbytery: '北美华人改革宗区会',
    region: index === 1 ? '加州湾区' : '纽约',
    denomination: '长老会',
    baptism_date: '2018-05-01',
    testimony: '我承认基督为主，愿意在婚恋中接受教会背书与属灵遮盖。',
    faith_years: 8,
    coworker: `测试同工 ${index}`,
  });
}

async function passFaithTest(client) {
  const answers = QUESTIONS.map((q) => ({ id: q.id, a: q.answer }));
  const result = await client.post('/faith-test/submit', { answers });
  assert(result.passed, `faith test expected passed, got ${result.score}/${result.total}`);
}

async function submitEndorsement(client, index) {
  const data = await client.post('/me/endorsements', {
    kind: 'pastor',
    name: `测试牧者 ${index}`,
    contact: `pastor${index}@example.test`,
    church: `测试长老教会 ${index}`,
    note: 'MVP 自动化验收背书。',
  });
  assert(data.endorsement?.id, `endorsement ${index} did not return id`);
  return data.endorsement.id;
}

async function reviewEndorsement(admin, id) {
  const data = await admin.post(`/admin/endorsements/${id}/review`, { decision: 'verified' });
  assert(data.ok, `admin review endorsement ${id} failed`);
}

async function completeLightCourse(client) {
  const list = await client.get('/courses');
  const course = list.courses.find((item) => item.slug === 'christian-dating-basics');
  assert(course, 'christian-dating-basics course not found');
  await client.post(`/courses/${course.slug}/enroll`, {});
  const detail = await client.get(`/courses/${course.slug}`);
  assert(detail.units?.length > 0, 'light course has no units');
  for (const unit of detail.units) {
    await client.post(`/courses/${course.slug}/units/${unit.unit_index}/submit`, {
      readConfirmed: true,
    });
  }
  const exam = await client.get(`/courses/${course.slug}/exam`);
  assert(exam.questions?.length > 0, 'light course exam should have questions');
  const result = await client.post(`/courses/${course.slug}/exam/submit`, {
    answers: courseExamAnswers(course.slug),
  });
  assert(result.passed, `light course exam expected passed, got ${result.score}/${result.total}`);
  const after = await client.get(`/courses/${course.slug}`);
  assert(after.progress?.state === 'completed', `light course expected completed, got ${after.progress?.state}`);
}

async function assertInPool(client, label) {
  const status = await client.get('/match/status');
  assert(status.inPool, `${label} should be in match pool: missing ${JSON.stringify(status.missing)}`);
}

async function onboard(client, admin, index) {
  await completeProfile(client, index);
  await passFaithTest(client);
  const endorsementId = await submitEndorsement(client, index);
  await reviewEndorsement(admin, endorsementId);
  await completeLightCourse(client);
  await assertInPool(client, `user ${index}`);
}

async function run() {
  const stamp = Date.now();
  const admin = new ApiClient('admin');
  const users = [1, 2, 3].map((index) => new ApiClient(`user${index}`));

  console.log('[verify-mvp] registering users...');
  const adminUser = await register(admin, `admin.${stamp}@example.test`, '测试管理员');
  await makeAdmin(adminUser.id);
  for (const [idx, client] of users.entries()) {
    await register(client, `user${idx + 1}.${stamp}@example.test`, `路得测试${idx + 1}`);
  }

  console.log('[verify-mvp] checking daily checkin...');
  await verifyDailyCheckin(users[0]);

  console.log('[verify-mvp] completing pool gates...');
  for (const [idx, client] of users.entries()) {
    await onboard(client, admin, idx + 1);
  }

  console.log('[verify-mvp] checking candidates and mutual match...');
  const candidates = await users[0].get('/match/candidates');
  assert(candidates.candidates?.length >= 2, `expected at least 2 candidates, got ${candidates.candidates?.length || 0}`);
  const user2 = await users[1].get('/auth/me');
  const user2Id = user2.user.id;
  await users[0].post(`/match/${user2Id}/intent`, { intent: 'like' });
  const user1 = await users[0].get('/auth/me');
  const mutual = await users[1].post(`/match/${user1.user.id}/intent`, { intent: 'like' });
  assert(mutual.mutual === true, 'second like should be mutual');

  console.log('[verify-mvp] checking chat...');
  const channels = await users[0].get('/chat/channels');
  assert(channels.channels?.length >= 1, 'expected chat channel after mutual match');
  const channelId = channels.channels[0].id;
  assert(channels.channels[0].other_id === user2Id, 'user1 channel should point to user2');
  const peerChannels = await users[1].get('/chat/channels');
  const peerChannel = peerChannels.channels?.find((channel) => channel.id === channelId);
  assert(peerChannel, 'user2 should see the same chat channel');
  assert(peerChannel.other_id === user1.user.id, 'user2 channel should point to user1');
  await users[0].post(`/chat/channels/${channelId}/messages`, { body: '你好，这是 MVP 私聊验收消息。' });
  const messages = await users[1].get(`/chat/channels/${channelId}/messages`);
  assert(messages.messages?.some((msg) => msg.body.includes('MVP 私聊验收消息')), 'chat message not visible to peer');
  await users[1].post(`/chat/channels/${channelId}/messages`, { body: '收到，这是 MVP 私聊回复。' });
  const replyMessages = await users[0].get(`/chat/channels/${channelId}/messages`);
  assert(replyMessages.messages?.some((msg) => msg.body.includes('MVP 私聊回复')), 'chat reply not visible to original sender');
  await expectStatus(users[2], 'GET', `/chat/channels/${channelId}/messages`, undefined, 403);

  console.log('[verify-mvp] checking community...');
  const post = await users[0].post('/community/posts', {
    content: 'MVP 全站广场验收帖 #遇见路得',
    title: 'MVP 验收',
  });
  assert(post.id, 'community post did not return id');
  const peerPosts = await users[1].get('/community/posts');
  assert(
    peerPosts.posts?.some((item) => item.id === post.id && item.content.includes('MVP 全站广场验收帖')),
    'community post should be visible in peer global post list'
  );
  const trendingPosts = await users[2].get('/community/feed/trending');
  assert(
    trendingPosts.posts?.some((item) => item.id === post.id && item.content.includes('MVP 全站广场验收帖')),
    'community post should be visible in peer trending feed'
  );
  await users[1].post(`/community/posts/${post.id}/comments`, { body: '这是一条 MVP 评论。' });
  const like = await users[2].post(`/community/posts/${post.id}/like`, {});
  assert(like.liked === true, 'third user should like the post');
  const comments = await users[0].get(`/community/posts/${post.id}/comments`);
  assert(
    comments.comments?.some((comment) => comment.body.includes('MVP 评论')),
    'expected peer community comment to be visible'
  );
  const likedFeed = await users[2].get('/community/posts');
  const likedPost = likedFeed.posts?.find((item) => item.id === post.id);
  assert(likedPost?.liked_by_me === true, 'liker should see liked_by_me on the post list');
  assert(likedPost?.like_count >= 1, 'post list should expose like count after peer like');
  assert(likedPost?.comment_count >= 1, 'post list should expose comment count after peer comment');

  console.log('[verify-mvp] PASS');
}

run()
  .catch((err) => {
    console.error('[verify-mvp] FAIL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
