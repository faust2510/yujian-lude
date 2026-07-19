import { useState } from 'react'
import { Link } from 'react-router-dom'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTabs } from '../../components/x-mobile/XMobileTabs'
import { XMobileTimelineRow } from '../../components/x-mobile/XMobileTimelineRow'

export default function DashboardMobile({ points, qualification, gateSteps = [], gateDone = 0, gatePct = 0, primaryNext, pointsLoading = false, qualificationLoading = false, pointsError = '', qualificationError = '', checkedIn = false, checkinBusy = false, message = '', onCheckin, onRetry }) {
  const [tab, setTab] = useState('for-you')
  if (pointsLoading && qualificationLoading) return <XMobileSkeleton lines={8} />
  return (
    <section className="x-mobile-timeline">
      <XMobileTabs items={[{ value: 'for-you', label: '为你推荐' }, { value: 'following', label: '正在关注' }]} value={tab} onChange={setTab} ariaLabel="首页时间线" />
      {qualificationError ? <XMobileErrorRow message={qualificationError} onRetry={onRetry} /> : null}
      <div className="x-mobile-compass-row">
        <span className="x-mobile-score">{qualificationLoading ? '…' : `${gatePct}%`}</span>
        <div><strong>{qualification?.inPool ? '可以开始认识候选' : primaryNext?.label || '继续完成关系预备'}</strong><p>{primaryNext?.desc || '真实而有边界地靠近。'}</p></div>
        <Link className="x-mobile-button-primary x-mobile-touch-target" to={primaryNext?.to || '/match'}>{primaryNext?.action || '查看认识'}</Link>
      </div>
      <XMobileTimelineRow title="平台导读" meta="关系练习">
        <p>成熟的关系，不是更快抵达答案，而是更诚实地面对彼此的有限。</p>
        <Link className="x-mobile-inline-link x-mobile-touch-target" to="/community">进入社区讨论</Link>
      </XMobileTimelineRow>
      <XMobileTimelineRow title="成长摘记" meta="课程学习">
        <p>今天的讨论没有标准答案。愿我们不把效率放在真实之前。</p>
        <Link className="x-mobile-inline-link x-mobile-touch-target" to="/courses">继续成长课程</Link>
      </XMobileTimelineRow>
      <div className="x-mobile-section-header"><h2>任务与积分</h2><p>{gateDone}/{gateSteps.length || 5} 项已完成</p></div>
      {pointsError ? <XMobileErrorRow message={pointsError} onRetry={onRetry} /> : <div className="x-mobile-list-row"><span><strong>累积积分</strong><small>100 分 = 1 天 VIP 体验</small></span><span className="x-mobile-row-meta">{points?.earned ?? '—'} 分</span></div>}
      <div className="x-mobile-list-row"><span><strong>每日签到</strong><small>{message || `今日积分 ${points?.daily ?? 0}`}</small></span><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onCheckin} disabled={checkedIn || checkinBusy}>{checkinBusy ? '签到中…' : checkedIn ? '已签到' : '签到 +10'}</button></div>
      {gateSteps.map((step, index) => <Link className="x-mobile-list-link x-mobile-touch-target" to={step.to} key={step.key}><span><strong>{qualification?.[step.key] ? '✓ ' : `${index + 1}. `}{step.label}</strong><small>{step.desc}</small></span><span className="x-mobile-row-meta">{qualification?.[step.key] ? '已完成' : '待完成'}</span></Link>)}
    </section>
  )
}
