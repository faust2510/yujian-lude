import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  sendVerify: () => api.post('/auth/send-verify'),
  verifyEmail: (token) => api.get('/auth/verify', { params: { token } }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  changePassword: (data) => api.post('/auth/change-password', data),
}

export const profile = {
  get: () => api.get('/me/profile'),
  save: (data) => api.put('/me/profile', data),
  saveFaith: (data) => api.put('/me/faith', data),
  addEndorsement: (data) => api.post('/me/endorsements', data),
  removeEndorsement: (id) => api.delete(`/me/endorsements/${id}`),
}

export const points = {
  balance: () => api.get('/me/points'),
  checkin: () => api.post('/me/checkin'),
}

export const courses = {
  list: () => api.get('/courses'),
  // backend returns course + units + progress together for one slug
  detail: (slug) => api.get(`/courses/${slug}`),
  enroll: (slug) => api.post(`/courses/${slug}/enroll`),
  submitUnit: (slug, index, data) =>
    api.post(`/courses/${slug}/units/${index}/submit`, data),
  exam: (slug) => api.get(`/courses/${slug}/exam`),
  submitExam: (slug, answers) => api.post(`/courses/${slug}/exam/submit`, { answers }),
}

export const faithTest = {
  status: () => api.get('/faith-test/status'),
  questions: () => api.get('/faith-test/questions'),
  submit: (answers) => api.post('/faith-test/submit', { answers }),
}

export const matches = {
  candidates: (params) => api.get('/match/candidates', { params }),
  status: () => api.get('/match/status'),
  express: (targetId, intent) => api.post(`/match/${targetId}/intent`, { intent }),
  viewers: () => api.get('/match/viewers'),
  view: (targetId) => api.post(`/match/${targetId}/view`),
}

export const community = {
  // 小组
  groups: (params) => api.get('/community/groups', { params }),
  createGroup: (data) => api.post('/community/groups', data),
  groupDetail: (id) => api.get(`/community/groups/${id}`),
  updateGroup: (id, data) => api.patch(`/community/groups/${id}`, data),
  joinGroup: (id) => api.post(`/community/groups/${id}/join`),
  groupMembers: (id) => api.get(`/community/groups/${id}/members`),
  groupPending: (id) => api.get(`/community/groups/${id}/pending`),
  moderateMember: (groupId, userId, action) =>
    api.patch(`/community/groups/${groupId}/members/${userId}`, { action }),
  // 帖子
  posts: (params) => api.get('/community/posts', { params }),
  search: (params) => api.get('/community/posts/search', { params }),
  post: (data) => api.post('/community/posts', data),
  deletePost: (id, reason) => api.delete(`/community/posts/${id}`, { data: { reason } }),
  feature: (id, action) => api.patch(`/community/posts/${id}/feature`, { action }),
  moderate: (id, action) => api.patch(`/community/posts/${id}/moderate`, { action }),
  // 互动
  like: (id) => api.post(`/community/posts/${id}/like`),
  getComments: (id) => api.get(`/community/posts/${id}/comments`),
  addComment: (id, data) => api.post(`/community/posts/${id}/comments`, data),
  deleteComment: (id) => api.delete(`/community/comments/${id}`),
  bookmark: (id) => api.post(`/community/posts/${id}/bookmark`),
  bookmarks: (page) => api.get('/community/bookmarks', { params: { page } }),
  // 关注
  follow: (userId) => api.post(`/community/follow/${userId}`),
  following: () => api.get('/community/following'),
  // 信息流
  feedFollowing: (page = 1) => api.get('/community/feed/following', { params: { page } }),
  feedHot: (page = 1) => api.get('/community/feed/hot', { params: { page } }),
  feedTrending: (page = 1) => api.get('/community/feed/trending', { params: { page } }),
  // 标签/通知
  hashtags: () => api.get('/community/hashtags'),
  notifications: (page = 1) => api.get('/community/notifications', { params: { page } }),
  readNotifications: () => api.post('/community/notifications/read'),
  unreadCount: () => api.get('/community/notifications/unread'),
  // 用户
  userProfile: (userId) => api.get(`/community/user/${userId}/profile`),
  userPosts: (userId, params) => api.get(`/community/user/${userId}/posts`, { params }),
  suggestedUsers: () => api.get('/community/suggested-users'),
  // 举报
  report: (data) => api.post('/community/reports', data),
  // 活动
  groupEvents: (groupId) => api.get(`/community/groups/${groupId}/events`),
  createEvent: (groupId, data) => api.post(`/community/groups/${groupId}/events`, data),
  rsvpEvent: (eventId, status) => api.post(`/community/events/${eventId}/rsvp`, { status }),
  // 管理员
  adminApply: () => api.post('/community/admin-apply'),
}

export const chat = {
  channels: () => api.get('/chat/channels'),
  messages: (id) => api.get(`/chat/channels/${id}/messages`),
  send: (id, body) => api.post(`/chat/channels/${id}/messages`, { body }),
}

export const relationships = {
  list: () => api.get('/relationships/mine'),
  initiate: (partnerId) => api.post('/relationships/initiate', { partner_id: partnerId }),
  examConfirm: (id) => api.post(`/relationships/${id}/exam-confirm`),
  pastorApprove: (id) => api.post(`/relationships/${id}/pastor-approve`),
}

export const pastorCert = {
  applications: () => api.get('/pastor-cert/applications'),
  apply: (data) => api.post('/pastor-cert/apply', data),
  status: () => api.get('/pastor-cert/mine'),
  review: (id, action) => api.patch(`/pastor-cert/applications/${id}`, { action }),
}

export const vip = {
  plans: () => api.get('/vip/plans'),
  redeem: (days) => api.post('/vip/redeem', { days }),
  subscribe: (_planId) => {
    void _planId
    return Promise.reject(new Error('payment not yet implemented'))
  },
}

export const admin = {
  stats: () => api.get('/admin/stats'),
  auditLogs: () => api.get('/admin/audit-logs'),
  users: (params) => api.get('/admin/users', { params }),
  banUser: (id, ban) => api.post(`/admin/users/${id}/ban`, { ban }),
  updateRole: (id, role) => api.post(`/admin/users/${id}/role`, { role }),
  settings: () => api.get('/admin/settings'),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  endorsements: (state = 'pending') => api.get('/admin/endorsements', { params: { state } }),
  reviewEndorsement: (id, decision = 'verified') =>
    api.post(`/admin/endorsements/${id}/review`, { decision }),
  reports: (state = 'pending') => api.get('/community/reports', { params: { state } }),
  reviewReport: (id, action) => api.patch(`/community/reports/${id}`, { action }),
  removePost: (id, reason) => api.delete(`/community/posts/${id}`, { data: { reason } }),
  communityAdminApplications: () => api.get('/community/admin-applications'),
  reviewCommunityAdminApplication: (id, action) =>
    api.patch(`/community/admin-applications/${id}`, { action }),
  pastorApplications: () => api.get('/pastor-cert/applications'),
  reviewPastorApplication: (id, action = 'approve') =>
    api.patch(`/pastor-cert/applications/${id}`, { action }),
}

export default api
