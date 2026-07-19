import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FigmaIcon, FigmaNotice, FigmaPageHeader, FigmaPersonRow } from './FigmaUi'
import '../figma-ui.css'

const primaryNav = [
  { label: '首页', to: '/', icon: 'house', end: true },
  { label: '认识', to: '/match', icon: 'heart' },
  { label: '成长', to: '/courses', icon: 'book' },
  { label: '社区', to: '/community', icon: 'users' },
  { label: '消息', to: '/chat', icon: 'message' },
]

const secondaryNav = [
  { label: '完善资料', to: '/profile', icon: 'user' },
  { label: '信仰测试', to: '/faith-test', icon: 'compass' },
  { label: '教材', to: '/textbooks', icon: 'book' },
  { label: 'AI 咨询', to: '/ai', icon: 'spark' },
  { label: '关系', to: '/relationships', icon: 'heart' },
  { label: '套餐', to: '/vip', icon: 'crown' },
  { label: '课程工作台', to: '/course-authoring', icon: 'book', roles: ['pastor', 'admin'] },
  { label: '管理台', to: '/admin', icon: 'settings', roles: ['admin'] },
]

const pageMeta = {
  '/': ['此刻', '看见今天值得回应的人、关系与成长。'],
  '/profile': ['我的资料', '清楚表达自己，也温柔守护隐私。'],
  '/faith-test': ['信仰测试', '在诚实回答中建立可理解的信仰档案。'],
  '/courses': ['成长', '用学习与练习，为一段健康关系做好预备。'],
  '/textbooks': ['教材', '把重要的关系知识读深、读懂。'],
  '/match': ['每日精选', '以真实、稳定与成长为共同起点。'],
  '/ai': ['路得 AI', '有依据、可执行，并清楚说明限制的辅助建议。'],
  '/relationships': ['关系', '看见关系进度，也守住彼此的边界。'],
  '/community': ['社区', '在共同学习与服事中认识同行者。'],
  '/chat': ['书信', '双方心动后，在安全边界内慢慢交谈。'],
  '/vip': ['会员与积分', '成长便利与 AI 额度，不影响匹配或曝光排序。'],
  '/pastor': ['牧者工作台', '陪伴、审核与关系支持。'],
  '/course-authoring': ['课程工作台', '编写、审阅并发布成长课程。'],
  '/admin': ['管理台', '维护平台秩序与用户安全。'],
}

const people = [
  ['禾', '晨光里的读书人', '华东 · 92%'],
  ['恩', '喜欢徒步与诗篇', '华南 · 88%'],
  ['路', '在服务中学习倾听', '华北 · 84%'],
]

const groups = [
  ['书', '晨光共读', '128 人'],
  ['城', '城市同行', '46 人'],
  ['言', '沟通练习场', '92 人'],
]

function getPageMeta(pathname) {
  const key = Object.keys(pageMeta).find((route) => route !== '/' && pathname.startsWith(route)) || '/'
  return pageMeta[key]
}

function visibleSecondaryNav(role) {
  return secondaryNav.filter((item) => !item.roles || item.roles.includes(role))
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pageTitle, pageDescription] = getPageMeta(pathname)
  const railItems = pathname.startsWith('/community') ? groups : people
  const secondaryItems = visibleSecondaryNav(user?.role)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="figma-app-shell">
      <aside className="figma-sidebar">
        <NavLink className="figma-brand" to="/" end>
          <span className="figma-brand-mark">路</span>
          <span className="figma-brand-name">遇见路得</span>
          <span className="figma-brand-tagline">在真实中相遇</span>
        </NavLink>

        <nav className="figma-primary-nav" aria-label="主要导航">
          {primaryNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <FigmaIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="figma-nav-label">更多功能</div>
        <nav className="figma-secondary-nav" aria-label="功能导航">
          {secondaryItems.map((item) => (
            <NavLink key={item.to} to={item.to}><FigmaIcon name={item.icon} size={17} /><span>{item.label}</span></NavLink>
          ))}
        </nav>

        <div className="figma-account">
          <div className="figma-avatar" aria-hidden="true">{user?.email?.slice(0, 1)?.toUpperCase() || '安'}</div>
          <div className="figma-account-copy">
            <strong>{user?.name || '平安'}</strong>
            <span>{user?.email || '我的资料'}</span>
          </div>
          <button type="button" className="figma-icon-button" onClick={handleLogout} aria-label="退出登录" title="退出登录">
            <FigmaIcon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <header className="figma-mobile-header">
        <div><span className="figma-eyebrow">遇见路得</span><h1>{pageTitle}</h1></div>
        <details className="figma-mobile-menu" open={mobileMenuOpen} onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}>
          <summary aria-label={mobileMenuOpen ? '关闭更多功能' : '打开更多功能'}>
            <span className="figma-avatar" aria-hidden="true">{user?.email?.slice(0, 1)?.toUpperCase() || '安'}</span>
          </summary>
          <nav className="figma-mobile-menu-links" aria-label="移动端更多功能">
            {secondaryItems.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)}><FigmaIcon name={item.icon} size={18} /><span>{item.label}</span></NavLink>
            ))}
            <button type="button" onClick={() => { setMobileMenuOpen(false); handleLogout() }}><FigmaIcon name="logout" size={18} /><span>退出登录</span></button>
          </nav>
        </details>
      </header>

      <main className="figma-main">
        <FigmaPageHeader title={pageTitle} description={pageDescription} eyebrow={pathname.startsWith('/ai') ? 'RUTH AI' : 'MEET RUTH'} />
        <div className="figma-main-content"><Outlet /></div>
      </main>

      <aside className="figma-right-rail" aria-label="相关推荐">
        <section className="figma-rail-card">
          <h2>{pathname.startsWith('/community') ? '值得关注的小组' : '今日值得认识'}</h2>
          {railItems.map(([initial, name, meta]) => <FigmaPersonRow key={name} initial={initial} name={name} meta={meta} />)}
        </section>
        <FigmaNotice title="安心认识">
          敏感信息不公开展示。双方心动后才开放私信，联系方式与精确位置仍受保护。
        </FigmaNotice>
      </aside>

      <nav className="figma-mobile-nav" aria-label="移动端主要导航">
        {primaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <FigmaIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
