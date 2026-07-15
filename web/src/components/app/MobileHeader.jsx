import { HeartHandshakeIcon, MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QUICK_ACCESS_ITEMS } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import UserMenu from './UserMenu'

const QUICK_ACCESS_ICONS = {
  relationships: HeartHandshakeIcon,
  ai: SparklesIcon,
  chat: MessageCircleIcon,
}

export default function MobileHeader({ user, onLogout }) {
  return (
    <header className="mobile-header">
      <Link className="app-brand" to="/">遇见路得</Link>
      <div className="mobile-header-actions">
        {QUICK_ACCESS_ITEMS.map((item) => {
          const Icon = QUICK_ACCESS_ICONS[item.key]
          return (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <Button className="mobile-message-button" variant="ghost" size="icon" asChild>
                  <Link to={item.to} aria-label={item.label}>
                    <Icon aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          )
        })}
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
