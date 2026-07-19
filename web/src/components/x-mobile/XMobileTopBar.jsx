import { XMobileIcon } from './XMobileIcon'

export function XMobileTopBar({ title, avatarLabel = '我', onMenu, onBack, menuRef, action }) {
  return <header className="x-mobile-topbar">
    {onBack
      ? <button type="button" className="x-mobile-icon-button x-mobile-touch-target" aria-label="返回" onClick={onBack}><XMobileIcon name="back" /></button>
      : <button ref={menuRef} type="button" className="x-mobile-avatar x-mobile-touch-target" aria-label="打开个人菜单" onClick={onMenu}>{avatarLabel}</button>}
    <h1>{title}</h1>
    {action
      ? <button type="button" className="x-mobile-icon-button x-mobile-touch-target" aria-label={action.label} onClick={action.onClick}>{action.icon ? <XMobileIcon name={action.icon} /> : action.children}</button>
      : <span aria-hidden="true" />}
  </header>
}
