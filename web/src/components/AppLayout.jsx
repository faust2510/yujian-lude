import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { profile } from '../api/client'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import useMobileViewport from '../hooks/useMobileViewport'
import { filterDesktopSecondaryNav } from '../navigation/appNavigation'
import { FigmaIcon, FigmaNotice, FigmaPageHeader } from './FigmaUi'
import XMobileShell from './x-mobile/XMobileShell'
import '../figma-ui.css'

const primaryNav = [
  { label: '首页', to: '/', icon: 'house', end: true },
  { label: '认识', to: '/match', icon: 'heart' },
  { label: '成长', to: '/courses', icon: 'book' },
  { label: '社区', to: '/community', icon: 'users' },
  { label: '消息', to: '/chat', icon: 'message' },
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

const desktopRailByRoute = {
  '/': {
    title: '今日值得认识',
    items: [
      { icon: 'heart', label: '查看每日精选', detail: '认识真实、稳定、愿意成长的人', to: '/match' },
      { icon: 'book', label: '继续关系预备', detail: '把今天的练习完成一点', to: '/courses' },
      { icon: 'users', label: '进入同行社区', detail: '在共同学习中慢慢认识', to: '/community' },
    ],
  },
  '/match': {
    title: '认识之前',
    items: [
      { icon: 'shield', label: '资格来自真实状态', detail: '资料、信仰、背书与课程共同构成', to: '/profile' },
      { icon: 'message', label: '双方心动才通信', detail: '没有单方面开启私信的捷径', to: '/chat' },
    ],
  },
  '/courses': {
    title: '成长路径',
    items: [
      { icon: 'book', label: '先读，再练习', detail: '学习进度以服务端记录为准', to: '/courses' },
      { icon: 'spark', label: '带着问题咨询', detail: '让路得 AI 帮你整理行动步骤', to: '/ai' },
    ],
  },
  '/community': {
    title: '社区边界',
    items: [
      { icon: 'users', label: '尊重真实的人', detail: '关注、评论与举报都保留清晰责任', to: '/community' },
      { icon: 'bookmark', label: '收藏值得回看的内容', detail: '让关系学习沉淀下来', to: '/community' },
    ],
  },
  '/chat': {
    title: '安心书信',
    items: [
      { icon: 'shield', label: '先确认，再靠近', detail: '只有真实开放的会话会出现在这里', to: '/match' },
      { icon: 'flag', label: '遇到不适及时停下', detail: '保留证据并使用社区举报入口', to: '/community' },
    ],
  },
  '/profile': {
    title: '资料与信任',
    items: [
      { icon: 'user', label: '只填写真实资料', detail: '保存结果与完整度都来自服务端', to: '/profile' },
      { icon: 'compass', label: '完成信仰测试', detail: '诚实回答比追求速度更重要', to: '/faith-test' },
    ],
  },
  '/ai': {
    title: '咨询边界',
    items: [
      { icon: 'spark', label: '辅助辨别，不替你决定', detail: '建议会说明依据与适用范围', to: '/ai' },
      { icon: 'users', label: '重要决定回到真实关系', detail: '让牧者、引荐人与专业人士参与', to: '/pastor' },
    ],
  },
  '/vip': {
    title: '公平承诺',
    items: [
      { icon: 'crown', label: '会员只增加成长便利', detail: '不会改变匹配资格或曝光顺序', to: '/vip' },
      { icon: 'book', label: '积分来自真实成长', detail: '签到、学习与完成任务都会如实记录', to: '/courses' },
    ],
  },
}

function getPageMeta(pathname) {
  const key = Object.keys(pageMeta).find((route) => route !== '/' && pathname.startsWith(route)) || '/'
  return pageMeta[key]
}

function getDesktopRail(pathname) {
  const key = Object.keys(desktopRailByRoute).find((route) => route !== '/' && pathname.startsWith(route)) || '/'
  return desktopRailByRoute[key]
}

function DesktopRail({ config }) {
  const items = config?.items || []

  return (
    <aside className="figma-right-rail" aria-label="页面辅助信息">
      <section className="figma-rail-card">
        <h2>{config?.title || '页面提示'}</h2>
        {items.map((item) => (
          <Link className="figma-rail-link" key={`${item.to}-${item.label}`} to={item.to}>
            <span className="figma-rail-link-icon"><FigmaIcon name={item.icon} size={18} /></span>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            <FigmaIcon name="chevronRight" size={16} />
          </Link>
        ))}
      </section>
      <FigmaNotice title="安心认识">
        敏感信息不公开展示。双方心动后才开放私信，联系方式与精确位置仍受保护。
      </FigmaNotice>
    </aside>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileSummary, setProfileSummary] = useState({ loading: true, error: '', nickname: '', completion: null })
  const [pageTitle, pageDescription] = getPageMeta(pathname)
  const railConfig = getDesktopRail(pathname)
  const secondaryItems = filterDesktopSecondaryNav(user?.role)
  const isDesktopViewport = useDesktopViewport()
  const isMobile = useMobileViewport()

  useEffect(() => {
    if (!isDesktopViewport) return undefined
    let active = true
    setProfileSummary(current => ({ ...current, loading: true, error: '' }))
    profile.get()
      .then((response) => {
        if (!active) return
        const currentProfile = response.data?.profile || {}
        const completion = Number(currentProfile.completion)
        setProfileSummary({
          loading: false,
          error: '',
          nickname: currentProfile.nickname || '',
          completion: Number.isFinite(completion) ? Math.max(0, Math.min(100, completion)) : null,
        })
      })
      .catch((error) => {
        if (!active) return
        setProfileSummary({
          loading: false,
          error: error.response?.data?.error || '资料状态暂不可用',
          nickname: '',
          completion: null,
        })
      })
    return () => { active = false }
  }, [isDesktopViewport, user?.id])

  if (isMobile) return <XMobileShell user={user} logout={logout} />

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

        <Link className="figma-ai-shortcut" to="/ai" aria-label="打开路得 AI 教导助手">
          <span className="figma-ai-shortcut-icon"><FigmaIcon name="spark" size={19} /></span>
          <span><strong>路得 AI</strong><small>按已审核教材辅助分辨</small></span>
          <FigmaIcon name="chevronRight" size={16} />
        </Link>

        <div className="figma-nav-label">更多功能</div>
        <nav className="figma-secondary-nav" aria-label="功能导航">
          {secondaryItems.map((item) => (
            <NavLink key={item.to} to={item.to}><FigmaIcon name={item.icon} size={17} /><span>{item.label}</span></NavLink>
          ))}
        </nav>

        <div className="figma-account">
          <Link className="figma-account-profile" to="/profile" aria-label="编辑个人资料">
            <div className="figma-avatar" aria-hidden="true">{user?.email?.slice(0, 1)?.toUpperCase() || '安'}</div>
            <div className="figma-account-copy">
              <strong>{profileSummary.nickname || user?.email?.split('@')[0] || '平安'}</strong>
              <span className="figma-profile-completion">
              {profileSummary.loading
                ? '资料完整度读取中…'
                : profileSummary.error
                  ? profileSummary.error
                  : profileSummary.completion === null
                    ? '资料完整度待计算'
                    : `资料完整度 ${profileSummary.completion}%`}
              </span>
            </div>
          </Link>
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

      <DesktopRail config={railConfig} />

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
