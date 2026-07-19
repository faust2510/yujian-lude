const ICON_PATHS = {
  house: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></>,
  heart: <><path d="M20.8 8.6c0 5.2-8.8 10.4-8.8 10.4S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z" /><path d="M7.3 11h2.2l1.2-2.2 2.2 5 1.3-2.8h2.5" /></>,
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23Z" /><path d="m7 11 1.5 1.5L11 10" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>,
  spark: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2Z" /><path d="m5 16 .7 2.3L8 19l-2.3.7L5 22l-.7-2.3L2 19l2.3-.7Z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
  crown: <><path d="m3 7 4 4 5-7 5 7 4-4-2 12H5Z" /><path d="M5 19h14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.2.75.2 1.1h.1v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  flag: <><path d="M5 22V4" /><path d="M5 5h11l-2 4 2 4H5" /></>,
  pin: <><path d="m9 3 6 6" /><path d="m12 6 5 5-4 1-4 4-1 5-2-2 5-8 1-5Z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  map: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></>,
  chevronRight: <path d="m9 18 6-6-6-6" />,
}

export function FigmaIcon({ name, size = 20, className = '' }) {
  return (
    <svg className={`figma-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.spark}
    </svg>
  )
}

export function FigmaPageHeader({ eyebrow = 'MEET RUTH', title, description, action }) {
  return (
    <header className="figma-page-header">
      <div>
        <div className="figma-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="figma-page-header-action">{action}</div> : null}
    </header>
  )
}

export function FigmaTabs({ items, active, onChange, ariaLabel = '页面选项' }) {
  return (
    <div className="figma-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={active === item.value} className={active === item.value ? 'is-active' : ''} onClick={() => onChange?.(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function FigmaCard({ children, className = '', as: Element = 'section' }) {
  return <Element className={`figma-card ${className}`.trim()}>{children}</Element>
}

export function FigmaPersonRow({ initial, name, meta, action }) {
  return (
    <div className="figma-person-row">
      <div className="figma-avatar" aria-hidden="true">{initial}</div>
      <div className="figma-person-copy"><strong>{name}</strong><span>{meta}</span></div>
      {action ? <div className="figma-person-action">{action}</div> : null}
    </div>
  )
}

export function FigmaNotice({ children, icon = 'shield', title }) {
  return (
    <div className="figma-notice" role="note">
      <FigmaIcon name={icon} size={22} />
      <div>{title ? <strong>{title}</strong> : null}<p>{children}</p></div>
    </div>
  )
}
