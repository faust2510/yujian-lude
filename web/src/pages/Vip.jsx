import { useEffect, useState } from 'react'
import { vip as vipApi, points } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrencyAmount } from '../lib/currency'
import { redeemableDays, redemptionCost } from '../lib/vip-redemption'

export default function Vip() {
  const { user, refreshMe } = useAuth()
  const [plans, setPlans] = useState([])
  const [pts, setPts] = useState(null)
  const [redemption, setRedemption] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [days, setDays] = useState(1)
  const [msg, setMsg] = useState('')
  const [subscriptionMsg, setSubscriptionMsg] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentReference, setPaymentReference] = useState('')
  const [applicantNote, setApplicantNote] = useState('')
  const [selectedTier, setSelectedTier] = useState('basic')

  useEffect(() => {
    Promise.allSettled([vipApi.plans(), points.balance(), vipApi.subscriptions()]).then(([plansResult, pointsResult, subscriptionsResult]) => {
      if (plansResult.status === 'fulfilled') {
        setPlans(plansResult.value.data.plans || [])
        setRedemption(plansResult.value.data.redemption || null)
      }
      if (pointsResult.status === 'fulfilled') {
        setPts(pointsResult.value.data)
        setRedemption(current => current || pointsResult.value.data.vipRedemption || null)
      }
      if (subscriptionsResult.status === 'fulfilled') {
        setSubscriptions(subscriptionsResult.value.data.subscriptions || [])
      }
      if (plansResult.status === 'rejected' || pointsResult.status === 'rejected' || subscriptionsResult.status === 'rejected') {
        setLoadError('会员与积分信息加载不完整，请刷新重试')
      }
    })
  }, [])

  useEffect(() => {
    const refreshVipState = async () => {
      try {
        const [subscriptionsResult] = await Promise.all([vipApi.subscriptions(), refreshMe()])
        setSubscriptions(subscriptionsResult.data.subscriptions || [])
      } catch {
        setLoadError('会员申请状态刷新失败，请稍后重试')
      }
    }

    window.addEventListener('focus', refreshVipState)
    return () => window.removeEventListener('focus', refreshVipState)
  }, [refreshMe])

  const isVip = user?.is_vip
  const earned = pts?.earned ?? 0
  const cost = redemptionCost(days, redemption)
  const maxDays = redeemableDays(earned, redemption)
  const selectedPlan = plans.find(plan => plan.tier === selectedTier)
  const pendingSubscription = subscriptions.find(item => item.state === 'pending')

  const doRedeem = async () => {
    if (cost === null) return setMsg('兑换比例加载失败，请刷新重试')
    if (earned < cost) return setMsg(`积分不足，需要 ${cost} 分，当前 ${earned} 分`)
    setLoading(true)
    try {
      const redeemed = await vipApi.redeem(days)
      const [pointsResult] = await Promise.all([points.balance(), refreshMe()])
      setPts(pointsResult.data)
      setRedemption(redeemed.data.redemption || pointsResult.data.vipRedemption || redemption)
      setMsg(`兑换成功！已获得 ${redeemed.data.daysGranted} 天 Basic VIP 体验，消耗 ${redeemed.data.spent} 分`)
    } catch (e) {
      setMsg(e.response?.data?.error || '兑换失败')
    } finally {
      setLoading(false)
    }
  }

  const submitSubscription = async () => {
    if (paymentReference.trim().length < 4) {
      setSubscriptionMsg('请填写至少 4 位付款流水尾号')
      return
    }
    setSubmitting(true)
    setSubscriptionMsg('')
    try {
      const response = await vipApi.subscribe({
        tier: selectedTier,
        payment_reference: paymentReference.trim(),
        applicant_note: applicantNote.trim(),
      })
      setSubscriptions(current => [response.data.subscription, ...current])
      setPaymentReference('')
      setApplicantNote('')
      setSubscriptionMsg('核款申请已提交，请等待管理员确认到账')
    } catch (error) {
      setSubscriptionMsg(error.response?.data?.error || '核款申请提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelSubscription = async (id) => {
    setSubmitting(true)
    setSubscriptionMsg('')
    try {
      const response = await vipApi.cancelSubscription(id)
      setSubscriptions(current => current.map(item => item.id === id ? response.data.subscription : item))
      setSubscriptionMsg('待核款申请已取消')
    } catch (error) {
      setSubscriptionMsg(error.response?.data?.error || '取消申请失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="page-title">会员套餐</h1>
      <p className="page-sub">VIP 只买便利，完全不参与曝光排序 · 曝光只靠完成课程 + 牧者背书赢得</p>
      {loadError && <div className="error-msg" style={{marginBottom:16}}>{loadError}</div>}

      {isVip && (
        <div className="card" style={{background:'#F0FAF4',border:'1px solid #B8E0C8',marginBottom:16}}>
          <span className="badge badge-green">{user?.vip_plan === 'pro' ? 'Pro' : 'Basic'} VIP 生效中</span>
          <span style={{marginLeft:10,fontSize:14,color:'var(--legacy-muted)'}}>
            Basic 到期：{user.vip_until && new Date(user.vip_until).toLocaleDateString('zh-CN')}
          </span>
          {user?.vip_plan === 'pro' && user.vip_pro_until && (
            <span style={{marginLeft:10,fontSize:14,color:'var(--legacy-muted)'}}>
              Pro 到期：{new Date(user.vip_pro_until).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      )}

      {/* 积分兑换区 */}
      <div className="card" style={{marginBottom:24}}>
        <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:8}}>积分兑换 Basic VIP 体验</h3>
        <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:12}}>
          当前积分：<strong style={{color:'var(--brand)'}}>{earned}</strong> 分 · 兑换比例：
          {redemption ? `${redemption.points} 分 = ${redemption.days} 天` : '加载中…'}
        </p>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <label style={{fontSize:14}}>兑换天数</label>
          <input type="number" min={1} max={Math.max(1, maxDays)} value={days}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value)||1))}
            style={{width:72,border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:14}} />
          <span style={{fontSize:13,color:'var(--legacy-muted)'}}>需消耗 {cost ?? '—'} 分</span>
        </div>
        {msg && <div style={{fontSize:13,color: msg.includes('成功') ? '#17a34a' : 'var(--brand)',marginBottom:8}}>{msg}</div>}
        <button className="btn btn-primary" onClick={doRedeem} disabled={loading || cost === null || earned < cost}>
          {loading ? '处理中...' : `兑换 ${days} 天 Basic VIP`}
        </button>
        <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:10}}>积分兑换与课程赠送均为 Basic，不包含 Pro 深度筛选。</div>
      </div>

      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>付费开通</h3>
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginBottom:16}}>
          {plans.map(plan => (
            <button key={plan.tier} type="button"
              className={`btn ${selectedTier === plan.tier ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedTier(plan.tier)} disabled={plan.available !== true}>
              {plan.tier === 'pro' ? '进阶 VIP' : '基础 VIP'} · {formatCurrencyAmount(plan.price, plan.currency)}
            </button>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div>
            <h3 style={{fontFamily:'var(--font-serif)',fontSize:18}}>{selectedPlan?.name || (selectedTier === 'pro' ? '进阶 VIP' : '基础 VIP')}</h3>
            <div style={{fontSize:13,color:'var(--legacy-muted)',marginTop:4}}>
              {selectedPlan?.duration_days || 30} 天 · 每次单独申请，不自动续费
            </div>
          </div>
          <div style={{fontSize:28,fontFamily:'var(--font-serif)',color:'var(--brand)'}}>
            {selectedPlan ? formatCurrencyAmount(selectedPlan.price, selectedPlan.currency) : '—'}
          </div>
        </div>
        <ul style={{paddingLeft:20,fontSize:14,margin:'14px 0'}}>
          {(selectedPlan?.perks || []).map(perk => <li key={perk}>{perk}</li>)}
        </ul>
        <div style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:14}}>
          {selectedPlan?.payment_instructions || '请联系平台运营获取收款方式，付款后填写流水尾号。'}
        </div>

        {pendingSubscription ? (
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <span className="badge badge-soft">待核款</span>
            <div style={{fontSize:13,marginTop:8}}>申请套餐：{pendingSubscription.tier === 'pro' ? '进阶 VIP' : '基础 VIP'}</div>
            <div style={{fontSize:13,marginTop:8}}>付款流水尾号：{pendingSubscription.payment_reference}</div>
            <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>提交时间：{new Date(pendingSubscription.created_at).toLocaleString('zh-CN')}</div>
            <button className="btn btn-outline" style={{marginTop:12}} disabled={submitting} onClick={() => cancelSubscription(pendingSubscription.id)}>
              取消申请
            </button>
          </div>
        ) : (
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div className="field">
              <label htmlFor="vip-payment-reference">付款流水尾号</label>
              <input id="vip-payment-reference" maxLength={32} value={paymentReference}
                onChange={event => setPaymentReference(event.target.value)} placeholder="填写至少 4 位，仅用于人工核款" />
            </div>
            <div className="field">
              <label htmlFor="vip-applicant-note">申请备注（选填）</label>
              <textarea id="vip-applicant-note" rows={3} maxLength={500} value={applicantNote}
                onChange={event => setApplicantNote(event.target.value)} placeholder="例如付款时间或需要运营留意的信息" />
            </div>
            <button className="btn btn-primary" disabled={submitting || selectedPlan?.available !== true} onClick={submitSubscription}>
              {submitting ? '提交中…' : '提交核款申请'}
            </button>
          </div>
        )}
        {subscriptionMsg && <div className={subscriptionMsg.includes('失败') || subscriptionMsg.includes('请填写') ? 'error-msg' : 'success-msg'} style={{marginTop:12}}>{subscriptionMsg}</div>}
      </div>

      {subscriptions.some(item => item.state !== 'pending') && (
        <div className="card" style={{marginBottom:16}}>
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:10}}>申请记录</h3>
          {subscriptions.filter(item => item.state !== 'pending').map(item => (
            <div key={item.id} style={{padding:'10px 0',borderTop:'1px solid var(--border)',fontSize:13}}>
              <div>{item.plan_snapshot?.name || (item.tier === 'pro' ? '进阶 VIP' : '基础 VIP')} · {item.state === 'approved' ? '已通过' : item.state === 'rejected' ? '已驳回' : '已取消'}</div>
              <div style={{color:'var(--legacy-muted)',marginTop:4}}>{new Date(item.created_at).toLocaleString('zh-CN')}</div>
              {item.review_note && <div style={{marginTop:4}}>审核备注：{item.review_note}</div>}
              {item.activated_until && <div style={{marginTop:4}}>权益已延长至：{new Date(item.activated_until).toLocaleDateString('zh-CN')}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{marginTop:16,fontSize:13,color:'var(--legacy-muted)'}}>
        提示：完成凯勒《婚姻的意义》精品课，可免费获得 14 天 Basic VIP 体验。受装备的人不光排前面，还能尝到便利。
      </div>
    </>
  )
}
