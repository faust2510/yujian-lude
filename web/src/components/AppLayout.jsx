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

const pageMeta = {
  '/': ['首页', '在真实与边界中，慢慢认识值得认识的人。'],
  '/profile': ['我的资料', '清楚表达自己，也温柔守护隐私。'],
  '/faith-test': ['信仰测试', '在诚实回答中建立可理解的信仰档案。'],
  '/courses': ['成长', '用学习与练习，为一段健康关系做好预备。'],
  '/textbooks': ['教材', '把重要的关系知识读深、读懂。'],
  '/match': ['认识', '每日精选，以真实、稳定与成长为共同起点。'],
  '/ai': ['路得 AI 工作台', '有依据、可执行，并清楚说明限制的辅助建议。'],
  '/relationships': ['关系', '看见关系进度，也守住彼此的边界。'],
  '/community': ['社区', '在共同学习与服事中认识同行者。'],
  '/chat': ['消息', '双方心动后，在安全边界内慢慢交谈。'],
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

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [pageTitle, pageDescription] = getPageMeta(pathname)
  const railItems = pathname.startsWith('/community') ? groups : people

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
          <span className="figma-brand-tagline">Relationship with grace</span>
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
          <NavLink to="/profile"><FigmaIcon name="user" size={17} /><span>完善资料</span></NavLink>
          <NavLink to="/faith-test"><FigmaIcon name="compass" size={17} /><span>信仰测试</span></NavLink>
          <NavLink to="/textbooks"><FigmaIcon name="book" size={17} /><span>教材</span></NavLink>
          <NavLink to="/ai"><FigmaIcon name="spark" size={17} /><span>AI 咨询</span></NavLink>
          <NavLink to="/relationships"><FigmaIcon name="heart" size={17} /><span>关系</span></NavLink>
          <NavLink to="/vip"><FigmaIcon name="crown" size={17} /><span>套餐</span></NavLink>
          {(user?.role === 'pastor' || user?.role === 'admin') && (
            <NavLink to="/course-authoring"><FigmaIcon name="book" size={17} /><span>课程工作台</span></NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin"><FigmaIcon name="settings" size={17} /><span>管理台</span></NavLink>
          )}
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
        <details className="figma-mobile-menu">
          <summary aria-label="打开更多功能">
            <span className="figma-avatar" aria-hidden="true">{user?.email?.slice(0, 1)?.toUpperCase() || '安'}</span>
          </summary>
          <nav className="figma-mobile-menu-links" aria-label="移动端更多功能">
            <NavLink to="/profile"><FigmaIcon name="user" size={18} /><span>完善资料</span></NavLink>
            <NavLink to="/faith-test"><FigmaIcon name="compass" size={18} /><span>信仰测试</span></NavLink>
            <NavLink to="/textbooks"><FigmaIcon name="book" size={18} /><span>教材</span></NavLink>
            <NavLink to="/ai"><FigmaIcon name="spark" size={18} /><span>AI 咨询</span></NavLink>
            <NavLink to="/relationships"><FigmaIcon name="heart" size={18} /><span>关系</span></NavLink>
            <NavLink to="/vip"><FigmaIcon name="crown" size={18} /><span>套餐</span></NavLink>
            {(user?.role === 'pastor' || user?.role === 'admin') && (
              <NavLink to="/course-authoring"><FigmaIcon name="book" size={18} /><span>课程工作台</span></NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin"><FigmaIcon name="settings" size={18} /><span>管理台</span></NavLink>
            )}
            <button type="button" onClick={handleLogout}><FigmaIcon name="logout" size={18} /><span>退出登录</span></button>
          </nav>
        </details>
      </header>

      <main className="main-content figma-main">
        <FigmaPageHeader title={pageTitle} description={pageDescription} eyebrow={pathname.startsWith('/ai') ? 'RUTH AI' : 'MEET RUTH'} />
        <div className="figma-main-content"><Outlet /></div>
      </main>

      <aside className="figma-right-rail" aria-label="相关推荐">
        <h2>{pathname.startsWith('/community') ? '值得关注的小组' : '可能同行的人'}</h2>
        {railItems.map(([initial, name, meta]) => <FigmaPersonRow key={name} initial={initial} name={name} meta={meta} />)}
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
