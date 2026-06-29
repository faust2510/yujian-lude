import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">遇见路得</div>
        <NavLink to="/" end>个人中心</NavLink>
        <NavLink to="/profile">完善资料</NavLink>
        <NavLink to="/faith-test">信仰测试</NavLink>
        <NavLink to="/courses">课程</NavLink>
        <NavLink to="/match">匹配</NavLink>
        <NavLink to="/relationships">我的关系</NavLink>
        <NavLink to="/chat">私信</NavLink>
        <NavLink to="/community">社群</NavLink>
        <NavLink to="/vip">套餐</NavLink>
        <NavLink to="/pastor">牧者台</NavLink>
        {user?.role === 'admin' && <NavLink to="/admin">管理台</NavLink>}
        <div style={{ marginTop: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            {user?.email}
          </div>
          <button className="btn btn-outline btn-block" onClick={handleLogout}>退出登录</button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
