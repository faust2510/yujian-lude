import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTabs } from '../../components/x-mobile/XMobileTabs'

const adminTabs = [{ value: 'overview', label: '概览' }, { value: 'endorsements', label: '背书' }, { value: 'users', label: '用户' }, { value: 'reports', label: '举报' }, { value: 'applications', label: '认证' }, { value: 'audit', label: '审计' }, { value: 'settings', label: '配置' }]

export default function AdminMobile({ activeTab, onTabChange, children, loading = false, error = '', onRetry }) {
  return <section className="x-mobile-admin"><div className="x-mobile-scroll-tabs"><XMobileTabs items={adminTabs} value={activeTab} onChange={onTabChange} ariaLabel="管理功能" /></div>{error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : loading ? <XMobileSkeleton lines={8} /> : children || <XMobileEmptyState title="暂无记录" />}</section>
}

export function AdminMobileSection({ title, controls, children }) {
  return <section className="x-mobile-admin-section"><div className="x-mobile-section-header"><h2>{title}</h2>{controls}</div>{children}</section>
}

export function AdminMobileRow({ title, meta, detail, actions, children }) {
  return <div className="x-mobile-admin-row"><div className="x-mobile-admin-copy"><strong>{title}</strong>{meta ? <small>{meta}</small> : null}{detail ? <p>{detail}</p> : null}{children}</div>{actions ? <div className="x-mobile-admin-actions">{actions}</div> : null}</div>
}

export function AdminMobileState({ loading, error, empty, onRetry }) {
  if (error) return <XMobileErrorRow message={error} onRetry={onRetry} />
  if (loading) return <XMobileSkeleton lines={5} />
  if (empty) return <XMobileEmptyState title={empty} />
  return null
}
