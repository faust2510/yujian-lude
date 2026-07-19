import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

export default function RelationshipsMobile({ data, channels = [], user, loading = false, busy = '', message = '', error = '', onRetry, onStart, onConfirm, onApprove, onEnd }) {
  if (loading) return <XMobileSkeleton lines={5} />
  const relationship = data?.relationship
  if (!relationship) {
    return (
      <section className="x-mobile-settings-page">
        {error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}
        <XMobileEmptyState title="还没有进行中的关系" description="可以从已经互相表达意向的书信对象中开启确认流程。" />
        {channels.filter((channel) => channel.other_id).map((channel) => (
          <div className="x-mobile-list-row" key={channel.id}>
            <span><strong>{channel.other_nickname || '对方'}</strong><small>{channel.last_msg || '尚未开始对话'}</small></span>
            <button type="button" className="x-mobile-button-primary x-mobile-touch-target" disabled={busy === `start-${channel.other_id}`} onClick={() => onStart?.(channel.other_id)}>开启确认</button>
          </div>
        ))}
      </section>
    )
  }
  const isA = relationship.user_a === user?.id
  const steps = [
    [isA ? relationship.user_a_confirmed : relationship.user_b_confirmed, '我已确认愿意进入关系确认'],
    [isA ? relationship.user_b_confirmed : relationship.user_a_confirmed, '对方已确认愿意进入关系确认'],
    [isA ? relationship.pastor_a_approved : relationship.pastor_b_approved, '我方牧者 / 管理员已确认'],
    [isA ? relationship.pastor_b_approved : relationship.pastor_a_approved, '对方牧者 / 管理员已确认'],
  ]
  const canReview = ['admin', 'pastor'].includes(user?.role)
  return (
    <section className="x-mobile-settings-page">
      {message ? <div className="x-mobile-success-row">{message}</div> : null}
      {error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}
      <header className="x-mobile-section-header"><h2>与 {relationship.partner_nickname || relationship.other_nickname || '对方'}</h2><p>关系状态：{relationship.state}</p></header>
      {steps.map(([ok, label]) => <div className="x-mobile-step-row" key={label}><span aria-hidden="true">{ok ? '✓' : '○'}</span><span>{label}</span></div>)}
      <div className="x-mobile-action-stack">
        {!((isA ? relationship.user_a_confirmed : relationship.user_b_confirmed)) && !['confirmed', 'ended'].includes(relationship.state) ? <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => onConfirm?.(relationship.id)}>确认进入关系流程</button> : null}
        {canReview && relationship.user_a_confirmed && relationship.user_b_confirmed && relationship.state !== 'confirmed' ? <><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onApprove?.(relationship.id, 'user_a')}>确认甲方属灵审核</button><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onApprove?.(relationship.id, 'user_b')}>确认乙方属灵审核</button></> : null}
        {!['confirmed', 'ended'].includes(relationship.state) ? <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onEnd?.(relationship.id)}>结束关系</button> : null}
      </div>
    </section>
  )
}
