import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { matches, points } from '../api/client'
import useMobileViewport from '../hooks/useMobileViewport'
import DashboardMobile from './mobile/DashboardMobile'

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
    label: '完成平台课程',
    desc: '打卡完成入池门槛课程后，就能进入匿名匹配池。',
    to: '/courses',
    action: '去上课程',
  },
];

export default function Dashboard() {
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
  const isMobile = useMobileViewport()

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

  if (isMobile) {
    return <DashboardMobile points={pts} qualification={qualification} gateSteps={GATE_STEPS} gateDone={gateDone} gatePct={gatePct} primaryNext={primaryNext} pointsLoading={pointsLoading} qualificationLoading={qualificationLoading} pointsError={pointsError} qualificationError={qualificationError} checkedIn={checkedIn} checkinBusy={checkinBusy} message={msg} onCheckin={doCheckin} onRetry={loadDashboard} />
  }

  return (
    <div className="figma-core-screen figma-home-feed figma-desktop-home-section">
      <section className="figma-dashboard-focus" style={{ '--progress': `${gatePct}%` }}>
        <div className="figma-dashboard-focus-copy">
          <span>今天最重要的一步</span>
          <h2>{primaryNext ? primaryNext.label : '把今天留给一段更真实的靠近'}</h2>
          <p>{primaryNext?.desc || '你已完成入池预备。现在可以看看今天值得认真认识的人。'}</p>
          {primaryNext
            ? <Link className="btn btn-primary" to={primaryNext.to}>{primaryNext.action}</Link>
            : <Link className="btn btn-primary" to="/match">查看今日精选</Link>}
        </div>
        <div className="figma-dashboard-readiness">
          <div className="figma-dashboard-readiness-ring">
            <strong>{qualificationLoading ? '...' : `${gatePct}%`}</strong>
            <span>关系预备</span>
          </div>
          <p>{qualificationLoading ? '正在读取你的预备状态' : qualification?.inPool ? '已满足匿名匹配资格' : `还差 ${Math.max(0, GATE_STEPS.length - gateDone)} 个步骤`}</p>
        </div>
      </section>

      <section className="figma-dashboard-tasks" aria-labelledby="dashboard-tasks-title">
        <header>
          <div>
            <h2 id="dashboard-tasks-title">预备路径</h2>
            <p>{qualificationLoading ? '正在同步你的进度' : qualification?.inPool ? '你已完成进入匹配池的预备。' : '按自己的节奏完成，系统会在每一步后更新状态。'}</p>
          </div>
          <span>{qualification?.inPool ? '已入池' : `${gateDone}/${GATE_STEPS.length}`}</span>
        </header>

        {qualificationError && (
          <div className="figma-dashboard-error">
            <p>{qualificationError}</p>
            <button className="btn btn-outline" onClick={loadDashboard}>重试</button>
          </div>
        )}

        {!qualificationError && (
          <ol>
            {GATE_STEPS.map((step, index) => {
              const done = !!qualification?.[step.key]
              return (
                <li className={done ? 'is-complete' : ''} key={step.key}>
                  <span className="figma-dashboard-task-marker">{done ? '✓' : index + 1}</span>
                  <Link to={step.to}>
                    <strong>{step.label}</strong>
                    <small>{step.desc}</small>
                  </Link>
                  <span className="figma-dashboard-task-state">{done ? '已完成' : '待完成'}</span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="figma-dashboard-utilities" aria-label="今日状态">
        <div>
          <span>累积积分</span>
          <strong>{pointsLoading ? '...' : (pts?.earned ?? 0)}</strong>
          <small>{pointsError ? pointsError : '100 分可兑换 1 天 VIP 体验'}</small>
          {pointsError && <button className="figma-dashboard-text-button" onClick={loadDashboard}>重新读取</button>}
        </div>
        <div>
          <span>今日签到</span>
          <p>{checkedIn ? '今天已经为自己留下一次成长记录。' : '签到后获得 10 积分，继续保持自己的节奏。'}</p>
          <button className="btn btn-primary" onClick={doCheckin} disabled={checkedIn || checkinBusy}>
            {checkinBusy ? '签到中...' : checkedIn ? '今日已签到' : '签到 +10'}
          </button>
          {msg && <small className={msgType === 'error' ? 'is-error' : ''}>{msg}</small>}
        </div>
      </section>
    </div>
  )
}
