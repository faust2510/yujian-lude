import { Link, useLocation } from 'react-router-dom'
import { MAIN_SECTIONS, resolvePrimarySection } from '@/lib/navigation'
import { SECTION_ICONS } from './section-icons'

export default function MobileNavigation() {
  const { pathname } = useLocation()
  const activeSection = resolvePrimarySection(pathname)

  return (
    <nav className="mobile-navigation" aria-label="主导航">
      {MAIN_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.key]
        const isActive = activeSection === section.key
        return (
          <Link
            className="mobile-navigation-link"
            key={section.key}
            to={section.to}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{section.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
