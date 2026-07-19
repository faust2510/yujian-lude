import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { XMobileIcon } from './XMobileIcon'

export function XMobileDrawer({ open, onClose, items, onLogout, returnFocusRef }) {
  const closeRef = useRef(null)
  const drawerRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(drawerRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
  useEffect(() => { if (!open) returnFocusRef?.current?.focus() }, [open, returnFocusRef])
  if (!open) return null
  return <div className="x-mobile-drawer-backdrop" onMouseDown={onClose}><aside ref={drawerRef} className="x-mobile-drawer" role="dialog" aria-modal="true" aria-label="个人菜单" onMouseDown={(event) => event.stopPropagation()}><header><strong>个人菜单</strong><button ref={closeRef} type="button" className="x-mobile-icon-button x-mobile-touch-target" aria-label="关闭个人菜单" onClick={onClose}><XMobileIcon name="close" /></button></header><nav>{items.map((item) => <NavLink key={item.to} to={item.to} onClick={onClose}>{item.label}<XMobileIcon name="chevron" size={18} /></NavLink>)}</nav><button type="button" className="x-mobile-drawer-logout x-mobile-touch-target" onClick={onLogout}>退出登录</button></aside></div>
}
