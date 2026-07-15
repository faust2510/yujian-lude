import { HeartHandshakeIcon, MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { MAIN_SECTIONS, QUICK_ACCESS_ITEMS, resolvePrimarySection } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SECTION_ICONS } from './section-icons'
import UserMenu from './UserMenu'

const QUICK_ACCESS_ICONS = {
  relationships: HeartHandshakeIcon,
  ai: SparklesIcon,
  chat: MessageCircleIcon,
}

export default function AppSidebar({ user, onLogout }) {
  const { isMobile } = useSidebar()
  const { pathname } = useLocation()
  const activeSection = resolvePrimarySection(pathname)

  if (isMobile) return null

  return (
    <Sidebar className="app-sidebar" collapsible="offcanvas">
      <SidebarHeader className="app-sidebar-header">
        <Link className="app-brand" to="/">遇见路得</Link>
        {QUICK_ACCESS_ITEMS.map((item) => {
          const Icon = QUICK_ACCESS_ICONS[item.key]
          return (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <Button className="desktop-message-button" variant="ghost" size="icon-lg" asChild>
                  <Link to={item.to} aria-label={item.label}>
                    <Icon aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_SECTIONS.map((section) => {
                const Icon = SECTION_ICONS[section.key]
                const isActive = activeSection === section.key
                return (
                  <SidebarMenuItem key={section.key}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={section.to} aria-current={isActive ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{section.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} onLogout={onLogout} showIdentity />
      </SidebarFooter>
    </Sidebar>
  )
}
