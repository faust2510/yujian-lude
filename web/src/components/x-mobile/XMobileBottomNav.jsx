import { NavLink } from 'react-router-dom'
import { XMobileIcon } from './XMobileIcon'

export function XMobileBottomNav({ items }) {
  return (
    <nav className="x-mobile-bottom-nav" aria-label="主要导航">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="x-mobile-touch-target">
          <XMobileIcon name={item.icon} size={21} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
