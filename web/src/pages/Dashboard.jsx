import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { matches, points } from '../api/client'

export default function Dashboard() {
  const { user } = useAuth()
  const [pts, setPts] = useState(null)
  const [qualification, setQualification] = useState(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    points.balance().then(r => {
      setPts(r.data)
      if (r.data?.checkedInToday) setCheckedIn(true)
    }).catch(() => {})
    matches.status().then(r => setQualification(r.data)).catch(() => {})
  }, [])

  const doCheckin = async () => {
    try {
      const r = await points.checkin()
      setMsg(r.data.message || '签到成功，+10 分！')
      setCheckedIn(true)
      setPts(p => p ? {...p, earned: (p.earned||0) + 10} : p)
    } catch (err) {
      setMsg(err.response?.data?.error || '今日已签到')
      setCheckedIn(true)
    }
  }

  return (
    <>
      <h1 className="page-title">你好，{user?.nickname || user?.email?.split('@')[0]}</h1>
      <p className="page-sub">欢迎回到遇见路得</p>

      <div className="grid-2" style={{marginBottom:24}}>
        <div className="card">
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>累积积分</div>
          <div style={{fontSize:32,fontFamily:'var(--font-serif)',color:'var(--brand)'}}>
            {pts?.earned ?? '—'}
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>100 分 = 1 天 VIP 体验</div>
        </div>
        <div className="card">
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>每日签到</div>
          <p style={{fontSize:13,marginBottom:12,color:'var(--muted)'}}>每天签到 +10 分，坚持打卡！</p>
          <button className="btn btn-primary" onClick={doCheckin} disabled={checkedIn}>
            {checkedIn ? '✓ 已签到' : '签到 +10'}
          </button>
          {msg && <div className="success-msg">{msg}</div>}
        </div>
      </div>

      {qualification && (
        <div className="card" style={{marginBottom:24}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',marginBottom:14}}>
            <div>
              <h2 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:6}}>入池资格</h2>
              <p style={{fontSize:13,color:'var(--muted)',margin:0}}>
                {qualification.inPool ? '你已满足匹配池资格，可以开始匿名匹配。' : '完成以下项目后，才会进入匿名匹配池。'}
              </p>
            </div>
            <span className={`badge ${qualification.inPool ? 'badge-green' : 'badge-yellow'}`}>
              {qualification.inPool ? '已入池' : `还差 ${qualification.missing?.length || 0} 项`}
            </span>
          </div>
          <div className="grid-3">
            {[
              ['profileComplete', '个人资料', '/profile'],
              ['faithProfileComplete', '信仰档案', '/profile'],
              ['faithTestPassed', '信仰测试', '/faith-test'],
              ['endorsementVerified', '背书确认', '/profile'],
              ['lightCourseCompleted', '恋爱必修课', '/courses'],
            ].map(([key, label, to]) => {
              const done = !!qualification[key]
              return (
                <Link key={key} to={to} style={{textDecoration:'none'}}>
                  <div style={{padding:'12px 0',borderTop:'1px solid var(--border)'}}>
                    <div style={{fontSize:13,color:done ? 'var(--brand)' : 'var(--fg)',fontWeight:600}}>
                      {done ? '✓' : '○'} {label}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <h2 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:12}}>下一步做什么</h2>
      <div className="grid-3">
        {[
          {to:'/profile', title:'完善资料', desc:'资料越完整，曝光越高', badge:'+50 分'},
          {to:'/faith-test', title:'信仰基础测试', desc:'通过测试才能进入匹配池', badge:'必须'},
          {to:'/courses', title:'婚恋必修课', desc:'完课大幅提升曝光排名', badge:'+300 分'},
        ].map(item => (
          <Link key={item.to} to={item.to} style={{textDecoration:'none'}}>
            <div className="card" style={{
              cursor:'pointer', transition:'box-shadow 0.2s, transform 0.2s',
              position: 'relative', overflow: 'hidden'
            }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(201,123,107,0.12)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.transform = ''
              }}>
              <div style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:6}}>{item.title}</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:10}}>{item.desc}</div>
              <span className="badge badge-rose">{item.badge}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
