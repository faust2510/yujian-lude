export const primaryNav = [
  { label: '首页', to: '/', icon: 'home', end: true },
  { label: '认识', to: '/match', icon: 'heart' },
  { label: '成长', to: '/courses', icon: 'book' },
  { label: '社区', to: '/community', icon: 'users' },
  { label: '书信', to: '/chat', icon: 'message' },
]

export const secondaryNav = [
  { label: '完善资料', to: '/profile', icon: 'user' },
  { label: '信仰测试', to: '/faith-test', icon: 'compass' },
  { label: '教材', to: '/textbooks', icon: 'book' },
  { label: 'AI 咨询', to: '/ai', icon: 'spark' },
  { label: '关系', to: '/relationships', icon: 'heart' },
  { label: '套餐', to: '/vip', icon: 'crown' },
  { label: '牧者', to: '/pastor', icon: 'users' },
  { label: '课程工作台', to: '/course-authoring', icon: 'book', roles: ['pastor', 'admin'] },
  { label: '管理台', to: '/admin', icon: 'settings', roles: ['admin'] },
]

export function filterSecondaryNav(role) {
  return secondaryNav.filter((item) => !item.roles || item.roles.includes(role))
}

export const desktopSecondaryNav = secondaryNav.filter((item) => item.to !== '/pastor')

export function filterDesktopSecondaryNav(role) {
  return desktopSecondaryNav.filter((item) => !item.roles || item.roles.includes(role))
}
