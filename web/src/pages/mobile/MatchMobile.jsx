import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTimelineRow } from '../../components/x-mobile/XMobileTimelineRow'

export default function MatchMobile({ candidates = [], filters, messages = {}, mutuals = {}, acting = {}, lockedStatus, loading = false, error = '', onFiltersChange, onApplyFilters, onClearFilters, onExpress, onOpenChat, onLockedAction }) {
  if (loading) return <XMobileSkeleton lines={8} />
  return (
    <section className="x-mobile-timeline">
      <form className="x-mobile-filter-row" onSubmit={(event) => { event.preventDefault(); onApplyFilters?.() }}>
        <input aria-label="最小年龄" inputMode="numeric" placeholder="最小年龄" value={filters.min_age} onChange={(event) => onFiltersChange?.({ ...filters, min_age: event.target.value })} />
        <input aria-label="最大年龄" inputMode="numeric" placeholder="最大年龄" value={filters.max_age} onChange={(event) => onFiltersChange?.({ ...filters, max_age: event.target.value })} />
        <input aria-label="城市" placeholder="城市" value={filters.city} onChange={(event) => onFiltersChange?.({ ...filters, city: event.target.value })} />
        <button type="submit" className="x-mobile-button-primary x-mobile-touch-target">筛选</button>
      </form>
      {error ? <XMobileErrorRow message={error} onRetry={onApplyFilters} /> : null}
      {lockedStatus ? <div className="x-mobile-status-panel"><h2>还没有进入匹配池</h2><p>{lockedStatus.gate}</p>{(lockedStatus.nextActions || []).map((action) => <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" key={action.key} onClick={() => onLockedAction?.(action.to)}>{action.label}</button>)}</div> : null}
      {!error && !lockedStatus && candidates.length === 0 ? <XMobileEmptyState title="暂无候选" description="可以放宽筛选条件后重试。" /> : null}
      {!error && !lockedStatus && candidates.length === 0 ? <div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={onClearFilters}>清空筛选</button></div> : null}
      {candidates.map((candidate) => (
        <XMobileTimelineRow key={candidate.id} title={candidate.nickname || '匿名用户'} meta={[candidate.city, candidate.birth_year ? `${new Date().getFullYear() - candidate.birth_year}岁` : '', candidate.education].filter(Boolean).join(' · ')}>
          {candidate.church_name ? <p className="x-mobile-muted">教会 · {candidate.church_name}</p> : null}
          {candidate.has_badge ? <p className="x-mobile-muted">已完成婚姻装备</p> : null}
          {mutuals[candidate.id] ? <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onOpenChat}>互相心动，去书信</button> : messages[candidate.id] ? <p className="x-mobile-muted">{messages[candidate.id]}</p> : <div className="x-mobile-row-actions"><button type="button" className="x-mobile-icon-action x-mobile-touch-target" aria-label="表达心动" disabled={acting[candidate.id]} onClick={() => onExpress?.(candidate.id, 'like')}>心动</button><button type="button" className="x-mobile-icon-action x-mobile-touch-target" aria-label="跳过候选" disabled={acting[candidate.id]} onClick={() => onExpress?.(candidate.id, 'pass')}>跳过</button></div>}
        </XMobileTimelineRow>
      ))}
      <div className="x-mobile-notice-row"><span>双方心动后才开放书信 · 会员不影响匹配或曝光排序</span></div>
    </section>
  )
}
