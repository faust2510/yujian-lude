import { XMobileIcon } from './XMobileIcon'

export function XMobileDetailHeader({ title, subtitle, onBack, action }) {
  return (
    <header className="x-mobile-detail-header">
      <button type="button" className="x-mobile-icon-button x-mobile-touch-target" aria-label="返回" onClick={onBack}>
        <XMobileIcon name="back" />
      </button>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="x-mobile-detail-action">{action}</div>
    </header>
  )
}
