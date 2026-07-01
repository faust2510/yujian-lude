import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { matches, points } from '../api/client'

const GATE_STEPS = [
  {
    actionKey: 'profile',
    key: 'profileComplete',
    label: '完善个人资料',
    desc: '填写城市、出生年份、学历、婚恋目标和自我介绍，并同意匿名匹配。',
    to: '/profile',
    action: '去完善资料',
  },
  {
    actionKey: 'faithProfile',
    key: 'faithProfileComplete',
    label: '补全信仰档案',
    desc: '填写教会、区会、受洗时间、信主年数和简短见证。',
    to: '/profile',
    action: '去填信仰档案',
  },
  {
    actionKey: 'faithTest',
    key: 'faithTestPassed',
    label: '通过信仰基础测试',
    desc: '完成 20 道基要真理单选题，答对 15 题及以上通过。',
    to: '/faith-test',
    action: '开始测试',
  },
  {
    actionKey: 'endorsement',
    key: 'endorsementVerified',
    label: '获得背书确认',
    desc: '提交牧者或引荐人背书，等待管理员审核通过。',
    to: '/profile',
    action: '提交背书人',
  },
  {
    actionKey: 'lightCourse',
    key: 'lightCourseCompleted',
    label: '完成恋爱必修课',
    desc: '打卡完成入池门槛课程后，就能进入匿名匹配池。',
    to: '/courses',
    action: '去上课程',
  },
];

export default function Dashboard() {
  const { user } = useAuth()
  const [pts, setPts] = useState(null)
  const [qualification, setQualification] = useState(null)
  const [pointsLoading, setPointsLoading] = useState(true)
  const [qualificationLoading, setQualificationLoading] = useState(true)
  const [pointsError, setPointsError] = useState('')
  const [qualificationError, setQualificationError] = useState('')
  const [checkedIn, setCheckedIn] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [checkinBusy, setCheckinBusy] = useState(false)

  const loadDashboard = useCallback(async () => {
    setPointsLoading(true)
    setQualificationLoading(true)
    setPointsError('')
    setQualificationError('')

    const [pointsResult, qualificationResult] = await Promise.allSettled([
      points.balance(),
      matches.status(),
    ])

    if (pointsResult.status === 'fulfilled') {
      setPts(pointsResult.value.data)
      setCheckedIn(!!pointsResult.value.data?.checkedInToday)
    } else {
      setPointsError(pointsResult.reason?.response?.data?.error || '积分加载失败，请重试')
    }

    if (qualificationResult.status === 'fulfilled') {
      setQualification(qualificationResult.value.data)
    } else {
      setQualification(null)
      setQualificationError(qualificationResult.reason?.response?.data?.error || '入池状态加载失败，请重试')
    }

    setPointsLoading(false)
    setQualificationLoading(false)
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const doCheckin = async () => {
    setCheckinBusy(true)
    setMsg('')
    try {
      const r = await points.checkin()
      setMsgType('success')
      setMsg(r.data.message || '签到成功，+10 分！')
      setPts(r.data)
      setCheckedIn(!!r.data.checkedInToday)
    } catch (err) {
      setMsgType('error')
      setMsg(err.response?.data?.error || '今日已签到')
      if (err.response?.status === 409) setCheckedIn(true)
      points.balance().then(r => {
        setPts(r.data)
        setCheckedIn(!!r.data?.checkedInToday)
      }).catch(() => setPointsError('积分刷新失败，请重试'))
    } finally {
      setCheckinBusy(false)
    }
  }

  const gateDone = qualification
    ? GATE_STEPS.filter(step => !!qualification[step.key]).length
    : 0
  const gatePct = qualification ? Math.round((gateDone / GATE_STEPS.length) * 100) : 0
  const nextStep = qualification && !qualification.inPool
    ? GATE_STEPS.find(step => !qualification[step.key])
    : null
  const serverNext = qualification?.nextActions?.[0]
  const serverStep = serverNext
    ? GATE_STEPS.find(step => step.actionKey === serverNext.key)
    : null
  const primaryNext = qualification && !qualification.inPool
    ? {
        ...(nextStep || serverStep),
        label: serverNext?.label || nextStep?.label,
        to: serverNext?.to || nextStep?.to,
        action: serverNext?.label || nextStep?.action,
        desc: nextStep?.desc || serverStep?.desc || '完成这个步骤后，系统会继续提示下一项入池任务。',
      }
    : null

  return (
    <>
      <h1 className="page-title">你好，{user?.nickname || user?.email?.split('@')[0]}</h1>
      <p className="page-sub">欢迎回到遇见路得</p>

      <div className="grid-2" style={{marginBottom:24}}>
        <div className="card">
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>累积积分</div>
          <div style={{fontSize:32,fontFamily:'var(--font-serif)',color:'var(--brand)'}}>
            {pointsLoading ? '…' : (pts?.earned ?? '—')}
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>100 分 = 1 天 VIP 体验</div>
          {pointsError && (
            <div className="error-msg">
              {pointsError}
              <button className="btn btn-outline" style={{marginLeft:10,padding:'4px 10px',fontSize:12}} onClick={loadDashboard}>
                重试
              </button>
            </div>
          )}
        </div>
        <div className="card">
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>每日签到</div>
          <p style={{fontSize:13,marginBottom:12,color:'var(--muted)'}}>每天签到 +10 分，坚持打卡！</p>
          <div style={{fontSize:13,color:'var(--fg)',marginBottom:12}}>
            今日积分：<strong style={{color:'var(--brand)'}}>{pointsLoading ? '…' : (pts?.daily ?? 0)}</strong>
          </div>
          <button className="btn btn-primary" onClick={doCheckin} disabled={checkedIn || checkinBusy}>
            {checkinBusy ? '签到中…' : checkedIn ? '✓ 已签到' : '签到 +10'}
          </button>
          {msg && <div className={msgType === 'error' ? 'error-msg' : 'success-msg'}>{msg}</div>}
        </div>
      </div>

      {qualificationLoading && (
        <div className="card" style={{marginBottom:24,color:'var(--muted)',fontSize:14}}>
          正在加载入池状态…
        </div>
      )}

      {!qualificationLoading && qualificationError && (
        <div className="card" style={{marginBottom:24}}>
          <h2 style={{fontFamily:'var(--font-serif)',fontSize:18,marginBottom:8}}>入池状态加载失败</h2>
          <p style={{fontSize:14,color:'#B42318',marginBottom:14}}>{qualificationError}</p>
          <button className="btn btn-outline" onClick={loadDashboard}>重试</button>
        </div>
      )}

      {!qualificationLoading && qualification && (
        <div className="card" style={{marginBottom:24}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',marginBottom:14}}>
            <div>
              <h2 style={{fontFamily:'var(--font-serif)',fontSize:18,marginBottom:6}}>入池任务中心</h2>
              <p style={{fontSize:13,color:'var(--muted)',margin:0}}>
                {qualification.inPool ? '你已满足匹配池资格，可以开始匿名匹配。' : '按顺序完成这些任务，系统会自动更新入池状态。'}
              </p>
            </div>
            <span className={`badge ${qualification.inPool ? 'badge-green' : 'badge-yellow'}`}>
              {qualification.inPool ? '已入池' : `${gateDone}/${GATE_STEPS.length} 已完成`}
            </span>
          </div>

          <div style={{background:'var(--border)',borderRadius:999,height:8,overflow:'hidden',marginBottom:14}}>
            <div style={{width:`${gatePct}%`,height:'100%',background:'var(--brand)',borderRadius:999,transition:'width 0.2s'}} />
          </div>

          {primaryNext && (
            <div style={{border:'1px solid var(--border)',borderRadius:8,padding:14,marginBottom:14,background:'var(--bg)'}}>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>下一步</div>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{primaryNext.label}</div>
                  <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.6}}>{primaryNext.desc}</div>
                </div>
                <Link className="btn btn-primary" to={primaryNext.to} style={{textDecoration:'none',whiteSpace:'nowrap'}}>
                  {primaryNext.action}
                </Link>
              </div>
            </div>
          )}

          <div style={{display:'grid',gap:10}}>
            {GATE_STEPS.map((step, index) => {
              const done = !!qualification[step.key]
              return (
                <Link key={step.key} to={step.to} style={{textDecoration:'none'}}>
                  <div style={{
                    display:'grid',
                    gridTemplateColumns:'32px 1fr auto',
                    gap:10,
                    alignItems:'center',
                    padding:'12px 0',
                    borderTop:index === 0 ? 'none' : '1px solid var(--border)'
                  }}>
                    <div style={{
                      width:26,height:26,borderRadius:'50%',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:done ? '#F0FAF4' : 'var(--bg)',
                      color:done ? '#1A7A3C' : 'var(--muted)',
                      border:`1px solid ${done ? '#B8E0C8' : 'var(--border)'}`,
                      fontSize:13,fontWeight:700
                    }}>
                      {done ? '✓' : index + 1}
                    </div>
                    <div>
                      <div style={{fontSize:14,color:done ? 'var(--brand)' : 'var(--fg)',fontWeight:700}}>{step.label}</div>
                      <div style={{fontSize:12,color:'var(--muted)',marginTop:2,lineHeight:1.5}}>{step.desc}</div>
                    </div>
                    <span className={`badge ${done ? 'badge-green' : 'badge-yellow'}`}>{done ? '已完成' : '待完成'}</span>
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
