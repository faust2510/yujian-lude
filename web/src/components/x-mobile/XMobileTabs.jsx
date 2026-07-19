export function XMobileTabs({ items, value, onChange, ariaLabel = '页面标签' }) {
  const onKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus()
    onChange(items[next].value)
  }
  return <div className="x-mobile-page-tabs" aria-label={ariaLabel} role="tablist">{items.map((item, index) => {
    const selected = item.value === value
    return <button key={item.value} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} className="x-mobile-touch-target" onClick={() => onChange(item.value)} onKeyDown={(event) => onKeyDown(event, index)}>{item.label}</button>
  })}</div>
}
