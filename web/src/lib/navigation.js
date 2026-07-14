export const MAIN_SECTIONS = [
  { key: 'home', label: '首页', to: '/', match: ['/'] },
  { key: 'meet', label: '认识', to: '/match', match: ['/match', '/chat', '/relationships'] },
  { key: 'grow', label: '成长', to: '/courses', match: ['/courses', '/textbooks', '/ai'] },
  { key: 'community', label: '社区', to: '/community', match: ['/community'] },
]

export const USER_MENU_ITEMS = [
  { label: '个人与信仰资料', to: '/profile' },
  { label: '信仰基础测试', to: '/faith-test' },
  { label: '会员套餐', to: '/vip' },
]

export function resolvePrimarySection(pathname) {
  for (const section of MAIN_SECTIONS) {
    const matches = section.match.some((path) =>
      path === '/' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`),
    )

    if (matches) return section.key
  }

  return null
}
