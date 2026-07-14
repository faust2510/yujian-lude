import pg from 'pg';
import { courseExamAnswers } from '../lib/course-exams.js';
import { QUESTIONS } from '../lib/faith-questions.js';
import { createPublicToken, hashToken } from '../lib/auth-security.js';

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
  delete(path, body) { return this.request('DELETE', path, body); }
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

async function markEmailVerified(userId) {
  await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
}

async function createPasswordResetToken(userId) {
  const token = createPublicToken();
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + INTERVAL '1 hour')`,
    [userId, hashToken(token)]
  );
  return token;
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

async function submitEndorsement(client, index, override = {}) {
  const data = await client.post('/me/endorsements', {
    kind: override.kind || 'pastor',
    name: override.name || `实战牧者 ${index}`,
    contact: override.contact || `real-pastor-${index}@example.test`,
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

async function completeCourse(client, {
  slug,
  label,
  expectedUnits,
  expectedQuestions,
  expectedPassThreshold,
  expectedState,
  isMatchGateCourse,
}) {
  const list = await client.get('/courses');
  const course = list.courses.find((item) => item.slug === slug);
  assert(course, `${slug} course not found`);
  assert(course.is_match_gate_course === isMatchGateCourse, `${client.label} ${label} match-gate flag mismatch`);
  if (isMatchGateCourse) {
    assert(course.reward_points === 0, `${client.label} ${label} should not grant deep-course points`);
    assert(course.reward_vip_days === 0, `${client.label} ${label} should not grant VIP days`);
  } else {
    assert(course.reward_points > 0, `${client.label} ${label} should expose completion point reward`);
    assert(course.reward_vip_days > 0, `${client.label} ${label} should expose VIP day reward`);
  }
  await client.post(`/courses/${course.slug}/enroll`, {});
  const detail = await client.get(`/courses/${course.slug}`);
  assert(detail.units?.length === expectedUnits, `${client.label} ${label} expected ${expectedUnits} units, got ${detail.units?.length || 0}`);
  for (const unit of detail.units) {
    assert(unit.material?.includes('学习目标'), `${client.label} ${label} unit ${unit.unit_index} missing learning objective`);
    assert(unit.material?.includes('反思题'), `${client.label} ${label} unit ${unit.unit_index} missing reflection question`);
    assert(unit.material?.includes('讨论题'), `${client.label} ${label} unit ${unit.unit_index} missing discussion question`);
    for (const reading of unit.readings?.filter((item) => item.required) || []) {
      const chapter = await client.get(
        `/textbooks/${reading.textbook_slug}/chapters/${reading.chapter_index}`,
      );
      assert(chapter.chapter?.body_html, `${client.label} ${label} required textbook chapter should be readable`);
      await client.post(
        `/textbooks/${reading.textbook_slug}/chapters/${reading.chapter_index}/read`,
        {},
      );
    }
    await client.post(`/courses/${course.slug}/units/${unit.unit_index}/submit`, {
      readConfirmed: true,
    });
  }
  const exam = await client.get(`/courses/${course.slug}/exam`);
  assert(exam.questions?.length === expectedQuestions, `${client.label} ${label} expected ${expectedQuestions} exam questions, got ${exam.questions?.length || 0}`);
  assert(exam.passThreshold === expectedPassThreshold, `${client.label} ${label} expected pass threshold ${expectedPassThreshold}, got ${exam.passThreshold}`);
  const result = await client.post(`/courses/${course.slug}/exam/submit`, {
    answers: courseExamAnswers(course.slug),
  });
  assert(result.passed, `${client.label} ${label} exam expected passed, got ${result.score}/${result.total}`);
  const after = await client.get(`/courses/${course.slug}`);
  assert(after.progress?.state === expectedState, `${client.label} ${label} expected ${expectedState}, got ${after.progress?.state}`);
  assert(after.progress?.latest_exam?.passed === true, `${client.label} ${label} latest exam should be passed`);
}

async function completeLightCourse(client) {
  await completeCourse(client, {
    slug: 'christian-dating-basics',
    label: 'light course',
    expectedUnits: 8,
    expectedQuestions: 8,
    expectedPassThreshold: 6,
    expectedState: 'completed',
    isMatchGateCourse: true,
  });
}

async function completeDeepMarriageCourse(client, reviewer, endorsementId, outsider) {
  const pointsBefore = await client.get('/me/points');
  await completeCourse(client, {
    slug: 'keller-meaning-of-marriage',
    label: 'deep marriage course',
    expectedUnits: 10,
    expectedQuestions: 10,
    expectedPassThreshold: 8,
    expectedState: 'pastor_review',
    isMatchGateCourse: false,
  });
  const request = await client.post('/courses/keller-meaning-of-marriage/pastor-review', {
    endorsement_id: endorsementId,
    note: '请核对结课考试与课程反思记录。',
  });
  assert(request.pastorReview?.id, `${client.label} should create a pastor review request`);
  const pending = await reviewer.get('/course-pastor-reviews');
  assert(pending.reviews?.some((item) => item.id === request.pastorReview.id), 'pastor review queue should include the request');
  const outsiderPending = await outsider.get('/course-pastor-reviews');
  assert(!outsiderPending.reviews?.some((item) => item.id === request.pastorReview.id), 'unassigned users must not see the review');
  await expectStatus(outsider, 'PATCH', `/course-pastor-reviews/${request.pastorReview.id}`, {
    action: 'approve',
  }, 404);
  await expectStatus(reviewer, 'PATCH', `/course-pastor-reviews/${request.pastorReview.id}`, {
    action: 'reject',
  }, 400);
  const rejected = await reviewer.patch(`/course-pastor-reviews/${request.pastorReview.id}`, {
    action: 'reject',
    note: '请补充第十单元的冲突反思记录。',
  });
  assert(rejected.state === 'rejected', 'reviewer should be able to reject with a reason');
  const afterReject = await client.get('/courses/keller-meaning-of-marriage');
  assert(afterReject.progress?.pastor_review?.review_note?.includes('冲突反思'), 'student should see the rejection reason');

  const reapplied = await client.post('/courses/keller-meaning-of-marriage/pastor-review', {
    endorsement_id: endorsementId,
    note: '已补充第十单元反思，请再次确认。',
  });
  assert(reapplied.pastorReview?.id && reapplied.pastorReview.id !== request.pastorReview.id, 'reapplication should create a new review row');

  const approvalAttempts = await Promise.allSettled(
    Array.from({ length: 5 }, () => reviewer.patch(
      `/course-pastor-reviews/${reapplied.pastorReview.id}`,
      { action: 'approve', note: '课程记录与考试均已核对。' },
    )),
  );
  const approvals = approvalAttempts.filter(result => result.status === 'fulfilled');
  const conflicts = approvalAttempts.filter(result => result.status === 'rejected' && result.reason?.status === 409);
  assert(approvals.length === 1, `concurrent approval expected one success, got ${approvals.length}`);
  assert(conflicts.length === 4, `concurrent approval expected four conflicts, got ${conflicts.length}`);
  const reviewed = approvals[0].value;
  assert(reviewed.courseState === 'completed', `pastor approval should complete course, got ${reviewed.courseState}`);
  const detail = await client.get('/courses/keller-meaning-of-marriage');
  assert(detail.progress?.state === 'completed', `${client.label} deep course should complete after pastor approval`);
  assert(detail.progress?.pastor_review?.state === 'approved', `${client.label} course detail should expose approved review`);
  const pointsAfter = await client.get('/me/points');
  assert(pointsAfter.earned === pointsBefore.earned + 300, `deep course should grant exactly 300 points once, got ${pointsAfter.earned - pointsBefore.earned}`);
  const accountAfter = await client.get('/auth/me');
  const vipDaysRemaining = (new Date(accountAfter.user?.vip_until).getTime() - Date.now()) / 86_400_000;
  assert(vipDaysRemaining > 13 && vipDaysRemaining < 15, `deep course should grant about 14 VIP days once, got ${vipDaysRemaining.toFixed(2)}`);
  const rewardRows = await pool.query(
    `SELECT count(*)::int AS n
       FROM points_ledger ledger
       JOIN courses course ON course.id = ledger.ref_id
      WHERE ledger.user_id = $1
        AND ledger.reason = 'points.course_complete'
        AND course.slug = 'keller-meaning-of-marriage'`,
    [client.user.id]
  );
  assert(rewardRows.rows[0].n === 1, `deep course reward ledger expected one row, got ${rewardRows.rows[0].n}`);
  const history = await pool.query(
    `SELECT state FROM course_pastor_reviews review
       JOIN courses course ON course.id = review.course_id
      WHERE review.user_id = $1 AND course.slug = 'keller-meaning-of-marriage'
      ORDER BY review.created_at`,
    [client.user.id]
  );
  assert(history.rows.some(row => row.state === 'rejected'), 'review history should retain the rejected request');
  assert(history.rows.some(row => row.state === 'approved'), 'review history should retain the approved request');
}

async function onboard(client, admin, index, endorsementOverride = {}) {
  await completeProfile(client, index);
  await passFaithTest(client);
  const endorsementId = await submitEndorsement(client, index, endorsementOverride);
  await reviewEndorsement(admin, endorsementId);
  await completeLightCourse(client);
  const status = await client.get('/match/status');
  assert(status.inPool, `${client.label} should be in pool: ${JSON.stringify(status.missing)}`);
  return endorsementId;
}

async function verifyAiConsultation(client) {
  const scoped = await client.post('/ai/ask', { question: '如果对方聊天很频繁，我怎样设定边界？' });
  assert(scoped.outOfScope === false, `${client.label} AI should answer in-scope relationship boundary questions`);
  assert(scoped.sources?.length >= 1, `${client.label} AI answer should include sources`);
  const out = await client.post('/ai/ask', { question: '请直接判断这个人是不是神预定给我的配偶' });
  assert(out.outOfScope === true, `${client.label} AI should refuse prophecy-like questions`);
  const history = await client.get('/ai/history');
  assert(history.history?.length >= 2, `${client.label} AI history should include recent consultations`);
}

async function verifyRelationshipConfirmation(alice, bob, reviewer, outsider) {
  const initiated = await alice.post('/relationships/initiate', { partner_id: bob.user.id });
  assert(initiated.relationship?.id, 'relationship initiate should return relationship');
  const relationshipId = initiated.relationship.id;

  const first = await alice.post(`/relationships/${relationshipId}/request-confirmation`, {});
  assert(first.relationship?.state === 'relationship_requested', `expected relationship_requested, got ${first.relationship?.state}`);
  const second = await bob.post(`/relationships/${relationshipId}/request-confirmation`, {});
  assert(second.relationship?.state === 'mutual_confirmed', `expected mutual_confirmed, got ${second.relationship?.state}`);
  await expectStatus(outsider, 'POST', `/relationships/${relationshipId}/pastor-approve`, { side: 'user_a' }, 403);
  const aSide = await reviewer.post(`/relationships/${relationshipId}/pastor-approve`, { side: 'user_a' });
  assert(aSide.relationship?.state === 'pastoral_review', `expected pastoral_review, got ${aSide.relationship?.state}`);
  const bSide = await reviewer.post(`/relationships/${relationshipId}/pastor-approve`, { side: 'user_b' });
  assert(bSide.relationship?.state === 'confirmed', `expected confirmed, got ${bSide.relationship?.state}`);
  const mine = await alice.get('/relationships/mine');
  assert(mine.relationship?.state === 'confirmed', 'confirmed relationship should appear in mine');
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
  assert(after.earned === before.earned + 10, `checkin should add 10 earned points, got before=${before.earned} after=${after.earned}`);
  await expectStatus(client, 'POST', '/me/checkin', {}, 409);
}

async function verifyAccountSecurity(stamp) {
  const lockedUser = new ApiClient('locked-user');
  await register(lockedUser, `real.locked.${stamp}@example.test`, '锁定测试');

  const attacker = new ApiClient('attacker');
  for (let index = 0; index < 4; index += 1) {
    await expectStatus(attacker, 'POST', '/auth/login', {
      email: lockedUser.user.email,
      password: 'WrongPassw0rd!',
    }, 401);
  }
  await expectStatus(attacker, 'POST', '/auth/login', {
    email: lockedUser.user.email,
    password: 'WrongPassw0rd!',
  }, 429);
  await expectStatus(attacker, 'POST', '/auth/login', {
    email: lockedUser.user.email,
    password: 'Passw0rd!2026',
  }, 429);

  const resetUser = new ApiClient('reset-user');
  await register(resetUser, `real.reset.${stamp}@example.test`, '重置测试');
  const resetRequest = new ApiClient('reset-request');
  const forgot = await resetRequest.post('/auth/forgot-password', { email: resetUser.user.email });
  assert(forgot.ok, 'forgot password should return ok');
  if (process.env.EXPECT_NO_DEV_TOKENS === 'true') {
    assert(!forgot.devToken, 'production-style verification must not expose reset devToken');
  }
  const resetToken = forgot.devToken || await createPasswordResetToken(resetUser.user.id);

  const reset = await resetRequest.post('/auth/reset-password', {
    token: resetToken,
    new_password: 'NewPassw0rd!2026',
  });
  assert(reset.ok, 'reset password should succeed');
  await expectStatus(resetRequest, 'POST', '/auth/reset-password', {
    token: resetToken,
    new_password: 'AnotherPassw0rd!2026',
  }, 400);

  const oldSession = await resetUser.get('/auth/me');
  assert(oldSession.user === null, 'password reset should revoke existing sessions');
  await expectStatus(resetRequest, 'POST', '/auth/login', {
    email: resetUser.user.email,
    password: 'Passw0rd!2026',
  }, 401);
  const login = await resetRequest.post('/auth/login', {
    email: resetUser.user.email,
    password: 'NewPassw0rd!2026',
  });
  assert(login.user?.id === resetUser.user.id, 'new password should allow login');
}

async function verifyMatchAndChat(users, admin) {
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
  await verifyRelationshipConfirmation(alice, bob, admin, cara);
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
  return { postId: post.id };
}

async function verifyAdminOps(admin, users, communityResult) {
  const [alice, bob, , dan, partial] = users;
  const stats = await admin.get('/admin/stats');
  assert(stats.users >= 1, 'admin stats should include users');
  assert(typeof stats.pendingReports === 'number', 'admin stats should include pending reports');
  assert(Array.isArray(stats.auditLogs), 'admin stats should include recent audit logs');

  const userSearch = await admin.get(`/admin/users?q=${encodeURIComponent(alice.user.email)}`);
  assert(userSearch.users?.some((item) => item.id === alice.user.id), 'admin user search should find alice');

  await expectStatus(admin, 'POST', `/admin/users/${admin.user.id}/ban`, { ban: true }, 400);
  await expectStatus(admin, 'POST', `/admin/users/${admin.user.id}/role`, { role: 'vip' }, 400);
  await expectStatus(admin, 'PUT', '/admin/settings/unknown.setting', { value: true }, 400);
  await expectStatus(admin, 'PUT', '/admin/settings/points.daily_checkin', { value: { amount: -1, pool: 'daily' } }, 400);
  const settings = await admin.get('/admin/settings');
  assert(Array.isArray(settings.settings), 'admin settings should return rows for the settings UI');
  await admin.put('/admin/settings/match.light_course_id', { value: '22222222-2222-2222-2222-222222222222' });

  await admin.post(`/admin/users/${partial.user.id}/ban`, { ban: true });
  const bannedSession = await partial.get('/auth/me');
  assert(bannedSession.user === null, 'banning a user should revoke their active session');
  await admin.post(`/admin/users/${partial.user.id}/ban`, { ban: false });
  await admin.post(`/admin/users/${partial.user.id}/role`, { role: 'vip' });
  const vipSearch = await admin.get(`/admin/users?q=${encodeURIComponent(partial.user.email)}&role=vip`);
  assert(vipSearch.users?.some((item) => item.id === partial.user.id && item.role === 'vip'), 'admin should update user role');

  await bob.post('/community/reports', {
    target_type: 'post',
    target_id: communityResult.postId,
    reason: 'spam',
    detail: '运营后台验收举报',
  });
  const reports = await admin.get('/community/reports?state=pending');
  const report = reports.reports?.find((item) => item.target_id === communityResult.postId);
  assert(report, 'admin should see pending community report');
  await admin.patch(`/community/reports/${report.id}`, { action: 'resolve' });
  await expectStatus(admin, 'PATCH', `/community/reports/${report.id}`, { action: 'invalid' }, 400);

  await dan.post('/pastor-cert/apply', {
    church_name: '运营验收教会',
    denomination: '长老会',
    contact_email: `ops-pastor-${Date.now()}@example.test`,
    statement: '运营后台牧者认证验收',
  });
  const pastorApps = await admin.get('/pastor-cert/applications');
  const pastorApp = pastorApps.applications?.find((item) => item.user_id === dan.user.id && item.state === 'pending');
  assert(pastorApp, 'admin should see pending pastor certification');
  await admin.patch(`/pastor-cert/applications/${pastorApp.id}`, { action: 'approve' });

  await bob.post('/community/admin-apply', { reason: '愿意协助维护社群秩序' });
  const adminApps = await admin.get('/community/admin-applications');
  const adminApp = adminApps.applications?.find((item) => item.user_id === bob.user.id && item.state === 'pending');
  assert(adminApp, 'admin should see pending community admin application');
  await admin.patch(`/community/admin-applications/${adminApp.id}`, { action: 'approve' });

  const audit = await admin.get('/admin/audit-logs');
  assert(audit.auditLogs?.some((item) => item.action === 'user.ban'), 'audit log should include user ban');
  assert(audit.auditLogs?.some((item) => item.action === 'report.review'), 'audit log should include report review');
  assert(audit.auditLogs?.some((item) => item.action === 'pastor_cert.review'), 'audit log should include pastor certification review');
}

async function run() {
  const stamp = Date.now();
  const admin = new ApiClient('admin');
  const referrer = new ApiClient('referrer');
  const users = ['alice', 'bob', 'cara', 'dan', 'partial'].map((label) => new ApiClient(label));

  console.log('[verify-real-users] registering users...');
  const adminUser = await register(admin, `real.admin.${stamp}@example.test`, '实战管理员');
  await makeAdmin(adminUser.id);
  const referrerUser = await register(referrer, `real.referrer.${stamp}@example.test`, '实战引荐人');
  await markEmailVerified(referrerUser.id);
  const endorsementIds = [];
  for (const [index, client] of users.entries()) {
    await register(client, `real.${client.label}.${stamp}@example.test`, `实战${client.label}`);
    if (index < 4) {
      endorsementIds[index] = await onboard(
        client,
        admin,
        index + 1,
        index === 0
          ? { kind: 'referrer', name: '实战引荐人', contact: referrerUser.email }
          : {},
      );
    }
  }

  console.log('[verify-real-users] checking daily checkin...');
  await verifyDailyCheckin(users[0]);
  console.log('[verify-real-users] checking AI consultation...');
  await verifyAiConsultation(users[0]);

  console.log('[verify-real-users] checking deep marriage course...');
  await completeDeepMarriageCourse(users[0], referrer, endorsementIds[0], users[1]);

  console.log('[verify-real-users] checking account security...');
  await verifyAccountSecurity(stamp);

  console.log('[verify-real-users] checking match and chat...');
  await verifyMatchAndChat(users, admin);

  console.log('[verify-real-users] checking community...');
  const communityResult = await verifyCommunity(users);

  console.log('[verify-real-users] checking admin operations...');
  await verifyAdminOps(admin, users, communityResult);

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
