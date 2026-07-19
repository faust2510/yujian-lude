export function XMobileEmptyState({ title = '暂时没有内容', description }) { return <section className="x-mobile-empty-state"><h2>{title}</h2>{description && <p>{description}</p>}</section> }
