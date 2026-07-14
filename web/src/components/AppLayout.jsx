import { Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import AppSidebar from './app/AppSidebar'
import MobileHeader from './app/MobileHeader'
import MobileNavigation from './app/MobileNavigation'
import { SidebarInset, SidebarProvider } from './ui/sidebar'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('退出失败，请检查网络后重试')
    }
  }

  return (
    <SidebarProvider className="app-shell">
      <AppSidebar user={user} onLogout={handleLogout} />
      <SidebarInset className="app-frame">
        <MobileHeader user={user} onLogout={handleLogout} />
        <div className="app-main">
          <Outlet />
        </div>
        <MobileNavigation />
      </SidebarInset>
    </SidebarProvider>
  )
}
