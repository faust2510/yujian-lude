// 遇见路得 — 前端 API 客户端
// 封装后端 /api/* 调用。所有请求带 credentials 以携带 session cookie。
// 后端不可用时调用方应自行降级（catch）。

const BASE = "/api";

async function req(method, path, body) {
  const opts = {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // 健康检查（用于探测后端是否在线）
  health: () => req("GET", "/health"),

  // 认证
  register: (email, password) => req("POST", "/auth/register", { email, password }),
  login: (email, password) => req("POST", "/auth/login", { email, password }),
  logout: () => req("POST", "/auth/logout"),
  me: () => req("GET", "/auth/me"),
  sendVerify: () => req("POST", "/auth/send-verify"),

  // 资料 + 信仰档案 + 背书
  getProfile: () => req("GET", "/me/profile"),
  saveProfile: (profile) => req("PUT", "/me/profile", profile),
  saveFaith: (faith) => req("PUT", "/me/faith", faith),
  addEndorsement: (e) => req("POST", "/me/endorsements", e),
  removeEndorsement: (id) => req("DELETE", `/me/endorsements/${id}`),

  // 积分 + 签到
  getPoints: () => req("GET", "/me/points"),
  checkin: () => req("POST", "/me/checkin"),

  // 课程
  listCourses: () => req("GET", "/courses"),
  getCourse: (slug) => req("GET", `/courses/${slug}`),
  enroll: (slug) => req("POST", `/courses/${slug}/enroll`),
  submitUnit: (slug, index, payload) => req("POST", `/courses/${slug}/units/${index}/submit`, payload),

  // VIP
  vipPlans: () => req("GET", "/vip/plans"),
  redeemVip: (days) => req("POST", "/vip/redeem", { days }),

  // 匹配
  matchStatus: () => req("GET", "/match/status"),
  candidates: () => req("GET", "/match/candidates"),
  sendIntent: (targetId) => req("POST", `/match/${targetId}/intent`),
  viewers: () => req("GET", "/match/viewers"),

  // AI 咨询（免费不限量）
  askAi: (question) => req("POST", "/ai/ask", { question }),
  aiHistory: () => req("GET", "/ai/history"),

  // 信仰知识测试
  faithTestQuestions: () => req("GET", "/faith-test/questions"),
  faithTestStatus: () => req("GET", "/faith-test/status"),
  faithTestSubmit: (answers) => req("POST", "/faith-test/submit", { answers }),

  // 牧者介绍信
  getPastorLetter: () => req("GET", "/me/pastor-letter"),
  savePastorLetter: (body) => req("PUT", "/me/pastor-letter", body),
};

// 探测后端是否在线（缓存结果，避免每次请求都探测）
let _online = null;
export async function backendOnline() {
  if (_online !== null) return _online;
  try {
    await api.health();
    _online = true;
  } catch {
    _online = false;
  }
  return _online;
}
