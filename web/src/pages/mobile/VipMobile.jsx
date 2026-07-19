import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileFormRow } from '../../components/x-mobile/XMobileFormRow'

export default function VipMobile({ plans = [], earned = 0, days = 1, loading = false, message = '', plansError = '', isVip = false, vipUntil, onDaysChange, onRedeem, onRetryPlans }) {
  const cost = days * 100
  return (
    <section className="x-mobile-settings-page">
      <div className="x-mobile-notice-row"><strong>AI 是会员核心权益，不是匹配特权</strong><span>会员不影响匹配或曝光排序。</span></div>
      {isVip ? <div className="x-mobile-success-row">VIP 生效中{vipUntil ? ` · 到期 ${new Date(vipUntil).toLocaleDateString('zh-CN')}` : ''}</div> : null}
      <div className="x-mobile-section-header"><h2>积分兑换 VIP 体验</h2><p>当前积分 {earned} 分 · 100 分 / 天</p></div>
      <XMobileFormRow label="兑换天数" htmlFor="vip-days" help={`需消耗 ${cost} 分`}>
        <input id="vip-days" type="number" min="1" max={Math.floor(earned / 100) || 1} value={days} onChange={(event) => onDaysChange?.(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} />
      </XMobileFormRow>
      {message ? <div className="x-mobile-status-row">{message}</div> : null}
      <div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onRedeem} disabled={loading || earned < cost}>{loading ? '处理中…' : `兑换 ${days} 天 VIP`}</button></div>
      <div className="x-mobile-section-header"><h2>套餐介绍</h2></div>
      {plansError ? <XMobileErrorRow message={plansError} onRetry={onRetryPlans} /> : plans.map((plan) => <div className="x-mobile-list-row" key={plan.tier}><span><strong>{plan.name}</strong><small>{(plan.perks || []).join(' · ')}</small></span><span className="x-mobile-row-meta">¥{plan.price}/{plan.period}</span></div>)}
    </section>
  )
}
