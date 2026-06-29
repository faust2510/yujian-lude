import { useEffect, useState } from 'react'
import { vip as vipApi, points } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function Vip() {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [pts, setPts] = useState(null)
  const [days, setDays] = useState(1)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    vipApi.plans().then(r => setPlans(r.data.plans || [])).catch(() => setPlans([
      { tier: 'basic', name: '基础会员', price: 29, period: '月', perks: ['高级筛选', '谁看过我', '每日更多主动次数'] },
      { tier: 'pro', name: '进阶会员', price: 59, period: '月', perks: ['基础会员全部权益', '全部高级筛选维度', '优先顾问响应'] },
    ]))
    points.balance().then(r => setPts(r.data)).catch(() => {})
  }, [])

  const isVip = user?.is_vip
  const earned = pts?.earned ?? 0
  const cost = days * 100

  const doRedeem = async () => {
    if (earned < cost) return setMsg(`积分不足，需要 ${cost} 分，当前 ${earned} 分`)
    setLoading(true)
    try {
      await vipApi.redeem(days)
      setMsg(`兑换成功！已获得 ${days} 天 VIP 体验`)
      points.balance().then(r => setPts(r.data)).catch(() => {})
    } catch (e) {
      setMsg(e.response?.data?.error || '兑换失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="page-title">会员套餐</h1>
      <p className="page-sub">VIP 只买便利，完全不参与曝光排序 · 曝光只靠完成课程 + 牧者背书赢得</p>

      {isVip && (
        <div className="card" style={{background:'#F0FAF4',border:'1px solid #B8E0C8',marginBottom:16}}>
          <span className="badge badge-green">VIP 生效中</span>
          <span style={{marginLeft:10,fontSize:14,color:'var(--muted)'}}>
            到期：{user.vip_until && new Date(user.vip_until).toLocaleDateString('zh-CN')}
          </span>
        </div>
      )}

      {/* 积分兑换区 */}
      <div className="card" style={{marginBottom:24}}>
        <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:8}}>积分兑换 VIP 体验</h3>
        <p style={{fontSize:13,color:'var(--muted)',marginBottom:12}}>
          当前积分：<strong style={{color:'var(--brand)'}}>{earned}</strong> 分 · 兑换比例：100 分 / 天
        </p>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <label style={{fontSize:14}}>兑换天数</label>
          <input type="number" min={1} max={Math.floor(earned/100)||1} value={days}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value)||1))}
            style={{width:72,border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:14}} />
          <span style={{fontSize:13,color:'var(--muted)'}}>需消耗 {cost} 分</span>
        </div>
        {msg && <div style={{fontSize:13,color: msg.includes('成功') ? '#17a34a' : 'var(--brand)',marginBottom:8}}>{msg}</div>}
        <button className="btn btn-primary" onClick={doRedeem} disabled={loading || earned < cost}>
          {loading ? '处理中...' : `兑换 ${days} 天 VIP`}
        </button>
      </div>

      {/* 套餐信息展示（仅供参考，付费待实现） */}
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>套餐介绍</h3>
      <div className="grid-2">
        {plans.map(p => (
          <div className="card" key={p.tier} style={{textAlign:'center'}}>
            <h3 style={{fontFamily:'var(--font-serif)',fontSize:18}}>{p.name}</h3>
            <div style={{margin:'12px 0'}}>
              <span style={{fontSize:28,fontFamily:'var(--font-serif)',color:'var(--brand)'}}>¥{p.price}</span>
              <span style={{fontSize:14,color:'var(--muted)'}}> / {p.period}</span>
            </div>
            <ul style={{listStyle:'none',padding:0,fontSize:14,color:'var(--fg)',textAlign:'left',margin:'0 auto',maxWidth:200}}>
              {(p.perks || []).map((perk,i) => (
                <li key={i} style={{padding:'5px 0',borderBottom:'1px solid var(--border)'}}>✓ {perk}</li>
              ))}
            </ul>
            <div style={{marginTop:12,fontSize:12,color:'var(--muted)'}}>付费渠道建设中</div>
          </div>
        ))}
      </div>

      <div className="card" style={{marginTop:16,fontSize:13,color:'var(--muted)'}}>
        提示：完成凯勒《婚姻的意义》精品课，可免费获得 14 天 VIP 体验。受装备的人不光排前面，还能尝到便利。
      </div>
    </>
  )
}
