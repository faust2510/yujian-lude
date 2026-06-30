import pg from 'pg';
import { QUESTIONS } from '../lib/faith-questions.js';

const { Pool } = pg;

const apiBase = process.env.API_BASE || 'http://localhost:8091/api';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[verify-real-users] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

class ApiClient {
  constructor(label) {
    this.label = label;
    this.cookie = '';
    this.user = null;
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
  patch(path, body) { return this.request('PATCH', path, body); }
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
  client.user = data.user;
  return data.user;
}

async function makeAdmin(userId) {
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
}

async function completeProfile(client, index) {
  const profile = await client.put('/me/profile', {
    nickname: `实战用户${index}`,
    city: index % 2 === 0 ? '上海' : '杭州',
    birth_year: 1990 + index,
    education: index === 4 ? '本科' : '硕士',
    goal: 'serious',
    preference: '愿意在教会群体中认真认识，预备进入婚姻。',
    intro: `我是第 ${index} 位真实用户验收账号。`,
    privacy_ok: true,
  });
  assert(profile.completion === 100, `${client.label} profile completion expected 100, got ${profile.completion}`);

  await client.put('/me/faith', {
    church_name: `实战长老教会 ${index}`,
    presbytery: '华人改革宗区会',
    region: index % 2 === 0 ? '上海' : '杭州',
    denomination: '长老会',
    baptism_date: '2019-04-21',
    testimony: '我承认基督为主，愿意在婚恋中接受教会群体的认识与陪伴。',
    faith_years: 7,
    coworker: `实战同工 ${index}`,
  });
}

async function passFaithTest(client) {
  const answers = QUESTIONS.map((q) => ({ id: q.id, a: q.answer }));
  const result = await client.post('/faith-test/submit', { answers });
  assert(result.passed, `${client.label} faith test expected passed, got ${result.score}/${result.total}`);
}

async function submitEndorsement(client, index) {
  const data = await client.post('/me/endorsements', {
    kind: 'pastor',
    name: `实战牧者 ${index}`,
    contact: `real-pastor-${index}@example.test`,
    church: `实战长老教会 ${index}`,
    note: '真实用户流程验收背书。',
  });
  assert(data.endorsement?.id, `${client.label} endorsement did not return id`);
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
      passed: true,
      score: 1,
      qaLog: [{ q: 'real-user-flow', a: 'done' }],
    });
  }
}

async function onboard(client, admin, index) {
  await completeProfile(client, index);
  await passFaithTest(client);
  const endorsementId = await submitEndorsement(client, index);
  await reviewEndorsement(admin, endorsementId);
  await completeLightCourse(client);
  const status = await client.get('/match/status');
  assert(status.inPool, `${client.label} should be in pool: ${JSON.stringify(status.missing)}`);
}

async function verifyDailyCheckin(client) {
  const before = await client.get('/me/points');
  assert(before.checkedInToday === false, 'fresh user should not start checked in');
  const checkin = await client.post('/me/checkin', {});
  assert(checkin.checkedInToday === true, 'checkin response should mark checkedInToday');
  assert(checkin.daily === 10, `checkin response should show daily 10, got ${checkin.daily}`);
  const after = await client.get('/me/points');
  assert(after.checkedInToday === true, 'checkin should persist across later reads');
  assert(after.daily === 10, `daily points should persist for today, got ${after.daily}`);
  await expectStatus(client, 'POST', '/me/checkin', {}, 409);
}

async function verifyMatchAndChat(users) {
  const [alice, bob, cara, dan, partial] = users;
  const aliceCandidates = await alice.get('/match/candidates');
  const candidateIds = new Set((aliceCandidates.candidates || []).map((candidate) => candidate.id));
  for (const peer of [bob, cara, dan]) {
    assert(candidateIds.has(peer.user.id), `${alice.label} should see ${peer.label} as a candidate`);
  }
  assert(!candidateIds.has(partial.user.id), 'incomplete user should not appear as a candidate');

  const partialStatus = await partial.get('/match/status');
  assert(partialStatus.inPool === false, 'partial user should not be in match pool');
  await expectStatus(partial, 'POST', `/match/${alice.user.id}/intent`, { intent: 'like' }, 403);

  await alice.post(`/match/${bob.user.id}/intent`, { intent: 'like' });
  const mutual = await bob.post(`/match/${alice.user.id}/intent`, { intent: 'like' });
  assert(mutual.mutual === true, 'second like should create a mutual match');

  const aliceChannels = await alice.get('/chat/channels');
  const bobChannels = await bob.get('/chat/channels');
  const aliceChannel = aliceChannels.channels?.find((channel) => channel.other_id === bob.user.id);
  assert(aliceChannel, 'alice should see chat channel with bob');
  const bobChannel = bobChannels.channels?.find((channel) => channel.id === aliceChannel.id);
  assert(bobChannel, 'bob should see the same chat channel');

  await alice.post(`/chat/channels/${aliceChannel.id}/messages`, { body: 'Alice 实战消息。' });
  await bob.post(`/chat/channels/${aliceChannel.id}/messages`, { body: 'Bob 实战回复。' });
  const aliceMessages = await alice.get(`/chat/channels/${aliceChannel.id}/messages`);
  const bobMessages = await bob.get(`/chat/channels/${aliceChannel.id}/messages`);
  assert(aliceMessages.messages?.some((msg) => msg.body.includes('Bob 实战回复')), 'alice should see bob reply');
  assert(bobMessages.messages?.some((msg) => msg.body.includes('Alice 实战消息')), 'bob should see alice message');
  await expectStatus(cara, 'GET', `/chat/channels/${aliceChannel.id}/messages`, undefined, 403);
}

async function verifyCommunity(users) {
  const [alice, bob, cara, dan, partial] = users;
  await expectStatus(partial, 'POST', '/community/posts', { content: '未入池用户不应能发帖' }, 403);

  const stamp = Date.now();
  const content = `真实用户验收广场帖 ${stamp} #真实验收`;
  const post = await alice.post('/community/posts', {
    title: '真实用户验收',
    content,
  });
  assert(post.id, 'global community post did not return id');

  const bobPosts = await bob.get('/community/posts');
  assert(bobPosts.posts?.some((item) => item.id === post.id && item.content === content), 'bob should see alice post in global list');
  const caraTrending = await cara.get('/community/feed/trending');
  assert(caraTrending.posts?.some((item) => item.id === post.id), 'cara should see alice post in trending feed');
  const search = await bob.get('/community/posts/search?q=%E7%9C%9F%E5%AE%9E%E7%94%A8%E6%88%B7%E9%AA%8C%E6%94%B6');
  assert(search.posts?.some((item) => item.id === post.id), 'search should find alice post');
  const hashtags = await bob.get('/community/hashtags');
  assert(hashtags.hashtags?.some((tag) => tag.tag === '真实验收'), 'hashtag list should include post tag');

  await bob.post(`/community/posts/${post.id}/comments`, { body: 'Bob 看到并评论。' });
  const like = await cara.post(`/community/posts/${post.id}/like`, {});
  assert(like.liked === true, 'cara should like the post');
  const bookmark = await dan.post(`/community/posts/${post.id}/bookmark`, {});
  assert(bookmark.bookmarked === true, 'dan should bookmark the post');

  const commentsForCara = await cara.get(`/community/posts/${post.id}/comments`);
  assert(commentsForCara.comments?.some((comment) => comment.body.includes('Bob 看到并评论')), 'peer comment should be visible');
  const danBookmarks = await dan.get('/community/bookmarks');
  assert(danBookmarks.posts?.some((item) => item.id === post.id), 'bookmark list should include bookmarked post');

  await bob.post(`/community/follow/${alice.user.id}`, {});
  const following = await bob.get('/community/following');
  assert(following.following?.some((item) => item.user_id === alice.user.id), 'bob should follow alice');
  const followingFeed = await bob.get('/community/feed/following');
  assert(followingFeed.posts?.some((item) => item.id === post.id), 'following feed should include followed user post');
  const profile = await bob.get(`/community/user/${alice.user.id}/profile`);
  assert(profile.profile?.id === alice.user.id, 'user profile should load for post author');
  const userPosts = await bob.get(`/community/user/${alice.user.id}/posts`);
  assert(userPosts.posts?.some((item) => item.id === post.id), 'user timeline should include author post');

  const notifications = await alice.get('/community/notifications');
  assert(notifications.unread >= 2, `alice should have unread notifications after comment and like, got ${notifications.unread}`);

  const group = await alice.post('/community/groups', {
    name: `实战开放小组 ${stamp}`,
    description: '真实用户验收小组',
    category: 'interest',
    join_policy: 'open',
  });
  assert(group.id, 'group creation should return id');
  const join = await bob.post(`/community/groups/${group.id}/join`, {});
  assert(join.state === 'approved', 'open group join should auto approve');
  const groupPost = await alice.post('/community/posts', {
    group_id: group.id,
    title: '小组待审帖',
    content: `小组待审验收帖 ${stamp} #待审泄漏`,
  });
  const ownerPending = await alice.get(`/community/posts?group_id=${group.id}`);
  assert(
    ownerPending.posts?.some((item) => item.id === groupPost.id && item.moderation === 'pending'),
    'group owner should see pending group post for moderation'
  );
  const beforeModeration = await bob.get(`/community/posts?group_id=${group.id}`);
  assert(!beforeModeration.posts?.some((item) => item.id === groupPost.id), 'pending group post should not be visible before moderation');
  const pendingFollowing = await bob.get('/community/feed/following');
  assert(!pendingFollowing.posts?.some((item) => item.id === groupPost.id), 'pending group post should not leak into following feed');
  const pendingSearch = await bob.get('/community/posts/search?q=%E5%B0%8F%E7%BB%84%E5%BE%85%E5%AE%A1%E9%AA%8C%E6%94%B6');
  assert(!pendingSearch.posts?.some((item) => item.id === groupPost.id), 'pending group post should not leak into search');
  const pendingUserPosts = await bob.get(`/community/user/${alice.user.id}/posts`);
  assert(!pendingUserPosts.posts?.some((item) => item.id === groupPost.id), 'pending group post should not leak into user timeline');
  const pendingHashtags = await bob.get('/community/hashtags');
  assert(!pendingHashtags.hashtags?.some((tag) => tag.tag === '待审泄漏'), 'pending group post should not affect hashtag discovery');
  await expectStatus(bob, 'GET', `/community/posts/${groupPost.id}/comments`, undefined, 403);
  await expectStatus(bob, 'POST', `/community/posts/${groupPost.id}/comments`, { body: '不应评论待审帖' }, 403);
  await expectStatus(cara, 'POST', `/community/posts/${groupPost.id}/like`, {}, 403);
  await expectStatus(dan, 'POST', `/community/posts/${groupPost.id}/bookmark`, {}, 403);
  await alice.patch(`/community/posts/${groupPost.id}/moderate`, { action: 'approve' });
  const afterModeration = await bob.get(`/community/posts?group_id=${group.id}`);
  assert(afterModeration.posts?.some((item) => item.id === groupPost.id), 'approved group post should be visible to group member');

  const event = await alice.post(`/community/groups/${group.id}/events`, {
    title: '实战线上分享',
    description: '验收活动创建与报名',
    location: 'Zoom',
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert(event.id, 'event creation should return id');
  const rsvp = await bob.post(`/community/events/${event.id}/rsvp`, { status: 'going' });
  assert(rsvp.ok, 'event RSVP should succeed');
  const events = await bob.get(`/community/groups/${group.id}/events`);
  assert(events.events?.some((item) => item.id === event.id && item.my_rsvp === 'going'), 'events list should show my RSVP');

  const applyGroup = await alice.post('/community/groups', {
    name: `实战申请小组 ${stamp}`,
    description: '真实用户验收申请制小组',
    category: 'interest',
    join_policy: 'apply',
  });
  assert(applyGroup.id, 'apply group creation should return id');
  const applyJoin = await bob.post(`/community/groups/${applyGroup.id}/join`, {});
  assert(applyJoin.state === 'pending', 'apply group join should be pending');
  const pendingMembers = await alice.get(`/community/groups/${applyGroup.id}/pending`);
  assert(pendingMembers.pending?.some((item) => item.user_id === bob.user.id), 'owner should see pending group application');
  await alice.patch(`/community/groups/${applyGroup.id}/members/${bob.user.id}`, { action: 'approve' });
  const bobGroupDetail = await bob.get(`/community/groups/${applyGroup.id}`);
  assert(bobGroupDetail.group?.my_membership_state === 'approved', 'approved applicant should become group member');
}

async function run() {
  const stamp = Date.now();
  const admin = new ApiClient('admin');
  const users = ['alice', 'bob', 'cara', 'dan', 'partial'].map((label) => new ApiClient(label));

  console.log('[verify-real-users] registering users...');
  const adminUser = await register(admin, `real.admin.${stamp}@example.test`, '实战管理员');
  await makeAdmin(adminUser.id);
  for (const [index, client] of users.entries()) {
    await register(client, `real.${client.label}.${stamp}@example.test`, `实战${client.label}`);
    if (index < 4) await onboard(client, admin, index + 1);
  }

  console.log('[verify-real-users] checking daily checkin...');
  await verifyDailyCheckin(users[0]);

  console.log('[verify-real-users] checking match and chat...');
  await verifyMatchAndChat(users);

  console.log('[verify-real-users] checking community...');
  await verifyCommunity(users);

  console.log('[verify-real-users] PASS');
}

run()
  .catch((err) => {
    console.error('[verify-real-users] FAIL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
