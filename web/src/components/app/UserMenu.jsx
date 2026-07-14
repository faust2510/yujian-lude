import {
  BadgeCheckIcon,
  ChurchIcon,
  ClipboardCheckIcon,
  LogOutIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { USER_MENU_ITEMS } from '@/lib/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const MENU_ICONS = [UserRoundIcon, ClipboardCheckIcon, BadgeCheckIcon]

function getInitials(user) {
  const name = user?.nickname || user?.email || '用户'
  return name.slice(0, 2).toUpperCase()
}

export default function UserMenu({ user, onLogout, showIdentity = false }) {
  const displayName = user?.nickname || user?.email?.split('@')[0] || '用户'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="user-menu-trigger" variant="ghost" size={showIdentity ? 'default' : 'icon'}>
          <Avatar>
            <AvatarFallback>{getInitials(user)}</AvatarFallback>
          </Avatar>
          {showIdentity && <span className="user-menu-identity">{displayName}</span>}
          <span className="sr-only">打开用户菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="user-menu-content">
        <DropdownMenuLabel>
          <span className="user-menu-email">{user?.email || displayName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {USER_MENU_ITEMS.map((item, index) => {
            const Icon = MENU_ICONS[index]
            return (
              <DropdownMenuItem key={item.to} asChild>
                <NavLink to={item.to}>
                  <Icon />
                  {item.label}
                </NavLink>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuItem asChild>
            <NavLink to="/pastor">
              <ChurchIcon />
              {user?.role === 'pastor' ? '牧者工作台' : '引荐工作台'}
            </NavLink>
          </DropdownMenuItem>
          {user?.role === 'admin' && (
            <DropdownMenuItem asChild>
              <NavLink to="/admin">
                <ShieldCheckIcon />
                管理台
              </NavLink>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={onLogout}>
            <LogOutIcon />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
