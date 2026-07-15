import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { matches, points } from '../api/client'
import './Dashboard.css'

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
  const nextStep = qualification && !qualification.inPool
    ? GATE_STEPS.find(step => !qualification[step.key])
    : null
  const serverNext = qualification?.nextActions?.[0]
  const serverStep = serverNext
    ? GATE_STEPS.find(step => step.actionKey === serverNext.key)
    : null
  const primaryNext = qualification
    ? qualification.inPool
      ? {
          label: '开始匿名匹配',
          desc: '你已满足匹配资格，可以进入匹配池查看新机会。',
          to: '/match',
          action: '去匹配',
        }
      : {
          ...(nextStep || serverStep),
          label: serverNext?.label || nextStep?.label,
          to: serverNext?.to || nextStep?.to,
          action: serverNext?.label || nextStep?.action,
          desc: nextStep?.desc || serverStep?.desc || '完成这个步骤后，系统会继续提示下一项入池任务。',
        }
    : null
  const checkinAmount = pts?.checkinAmount
  const vipRedemption = pts?.vipRedemption

  return (
    <div className="dashboard-page">
      <h1 className="page-title">你好，{user?.nickname || user?.email?.split('@')[0]}</h1>
      <p className="page-sub">欢迎回到遇见路得</p>

      <section className="card dashboard-next" data-dashboard-next-step aria-labelledby="dashboard-next-title">
        <div className="dashboard-section-heading">
          <div>
            <div className="dashboard-eyebrow">匹配资格</div>
            <h2 id="dashboard-next-title">下一步</h2>
          </div>
          {!qualificationLoading && qualification && (
            <span className={`badge ${qualification.inPool ? 'badge-green' : 'badge-yellow'}`}>
              {qualification.inPool ? '已入池' : `${gateDone}/${GATE_STEPS.length} 已完成`}
            </span>
          )}
        </div>

        {qualificationLoading && <p className="dashboard-muted">正在加载入池状态…</p>}

        {!qualificationLoading && qualificationError && (
          <div>
            <p className="error-msg">{qualificationError}</p>
            <button className="btn btn-outline" onClick={loadDashboard}>重试</button>
          </div>
        )}

        {!qualificationLoading && primaryNext && (
          <div className="dashboard-next-action">
            <div className="dashboard-next-copy">
              <strong>{primaryNext.label}</strong>
              <p>{primaryNext.desc}</p>
              {!qualification.inPool && (
                <span className="dashboard-progress">入池进度：{gateDone}/{GATE_STEPS.length}</span>
              )}
            </div>
            <Link className="btn btn-primary" to={primaryNext.to}>
              {primaryNext.action}
            </Link>
          </div>
        )}
      </section>

      <section className="dashboard-secondary" data-dashboard-secondary aria-labelledby="dashboard-secondary-title">
        <div className="dashboard-secondary-heading">
          <h2 id="dashboard-secondary-title">今日概览</h2>
          <Link to="/courses">查看课程</Link>
        </div>

        <div className="dashboard-summary">
          <div className="card dashboard-points">
            <div className="dashboard-eyebrow">累积积分</div>
            <div className="dashboard-points-value">{pointsLoading ? '…' : (pts?.earned ?? '—')}</div>
            <p className="dashboard-muted">
              {vipRedemption ? `${vipRedemption.points} 分 = ${vipRedemption.days} 天 VIP 体验` : 'VIP 兑换比例加载中…'}
            </p>
            {pointsError && (
              <div className="error-msg">
                {pointsError}
                <button className="btn btn-outline dashboard-inline-retry" onClick={loadDashboard}>重试</button>
              </div>
            )}
          </div>

          <div className="card dashboard-checkin" data-checkin-status={checkedIn ? 'complete' : 'pending'}>
            <div className="dashboard-checkin-heading">
              <div className="dashboard-eyebrow">每日签到</div>
              <span className={`badge ${checkedIn ? 'badge-green' : 'badge-yellow'}`}>
                {checkedIn ? '今日已完成' : '今日待签到'}
              </span>
            </div>
            <p className="dashboard-muted">
              {checkinAmount ? `每天签到 +${checkinAmount} 分` : '每天签到可获得积分'}
            </p>
            <div className="dashboard-daily-points">
              今日积分：<strong>{pointsLoading ? '…' : (pts?.daily ?? 0)}</strong>
            </div>
            <button className="btn btn-primary" onClick={doCheckin} disabled={checkedIn || checkinBusy}>
              {checkinBusy ? '签到中…' : checkedIn ? '已签到' : checkinAmount ? `签到 +${checkinAmount}` : '签到'}
            </button>
            {msg && <div className={msgType === 'error' ? 'error-msg' : 'success-msg'}>{msg}</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
