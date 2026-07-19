import { XMobileIcon } from './XMobileIcon'
export function XMobileListRow({ title, description, onClick }) { return <button type="button" className="x-mobile-list-row x-mobile-touch-target" onClick={onClick}><span><strong>{title}</strong>{description && <small>{description}</small>}</span><XMobileIcon name="chevron" size={18} /></button> }
