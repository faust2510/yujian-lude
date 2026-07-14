import { MessageCircleIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import UserMenu from './UserMenu'

export default function MobileHeader({ user, onLogout }) {
  return (
    <header className="mobile-header">
      <Link className="app-brand" to="/">遇见路得</Link>
      <div className="mobile-header-actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="mobile-message-button" variant="ghost" size="icon" asChild>
              <Link to="/chat" aria-label="私信">
                <MessageCircleIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>私信</TooltipContent>
        </Tooltip>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
