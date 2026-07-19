import { useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { primaryNav, filterSecondaryNav } from '../../navigation/appNavigation'
import { XMobileBottomNav } from './XMobileBottomNav'
import { XMobileDrawer } from './XMobileDrawer'
import { XMobileTopBar } from './XMobileTopBar'
import './x-mobile.css'

const titles = { '/': '首页', '/match': '认识', '/courses': '成长', '/community': '社区', '/chat': '书信', '/profile': '我的资料', '/faith-test': '信仰测试', '/textbooks': '教材', '/ai': '路得 AI', '/relationships': '关系', '/vip': '会员与积分', '/pastor': '牧者工作台', '/course-authoring': '课程工作台', '/admin': '管理台' }
const getTitle = (pathname) => titles[Object.keys(titles).find((route) => route !== '/' && pathname.startsWith(route)) || '/']

export default function XMobileShell({ user, logout, hideTabs = false }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const handleLogout = async () => { await logout(); navigate('/login') }
  const avatarLabel = user?.name?.slice(0, 1) || user?.email?.slice(0, 1)?.toUpperCase() || '我'
  const isChatDetail = /^\/chat\/[^/]+/.test(pathname)
  return <div className={`x-mobile-shell ${isChatDetail ? 'is-detail-page' : ''}`}>{!isChatDetail ? <XMobileTopBar title={getTitle(pathname)} avatarLabel={avatarLabel} onMenu={() => setOpen(true)} menuRef={menuRef} /> : null}<main className="x-mobile-main"><Outlet /></main>{!hideTabs && !isChatDetail ? <XMobileBottomNav items={primaryNav} /> : null}<XMobileDrawer open={open} onClose={() => setOpen(false)} items={filterSecondaryNav(user?.role)} onLogout={handleLogout} returnFocusRef={menuRef} /></div>
}
