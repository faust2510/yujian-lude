import { useCallback, useEffect, useRef, useState } from 'react'
import { admin } from '../api/client'
import { formatCurrencyAmount } from '../lib/currency'
import './Admin.css'

const tabs = [
  ['overview', '概览'],
  ['endorsements', '背书'],
  ['vip-subscriptions', 'VIP申请'],
  ['users', '用户'],
  ['reports', '举报'],
  ['applications', '认证/申请'],
  ['audit', '审计'],
  ['settings', '配置'],
]

function getErrorMessage(err, fallback) {
  return err?.response?.data?.error || fallback
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '无'
}

function settingValue(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
}

function parseSettingValue(value) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function Empty({ children }) {
  return <div style={{color:'var(--legacy-muted)',fontSize:14}}>{children}</div>
}

function ErrorLine({ children }) {
  if (!children) return null
  return <div className="error-msg" style={{marginBottom:12}}>{children}</div>
}

function ActionButton({ children, onClick, disabled, primary = false }) {
  return (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-outline'}`} style={{fontSize:12,padding:'4px 12px'}} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('overview')
  return (
    <>
      <h1 className="page-title">管理台</h1>
      <p className="page-sub">运营待办 · 审核 · 用户治理 · 安全审计</p>

      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {tabs.map(([key, label]) => (
          <button key={key} className={`btn ${tab===key?'btn-primary':'btn-outline'}`} style={{fontSize:13}}
            onClick={()=>setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'endorsements' && <EndorsementsTab />}
      {tab === 'vip-subscriptions' && <VipSubscriptionsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  )
}

function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    admin.stats().then(r => setStats(r.data)).catch(err => setError(getErrorMessage(err, '概览加载失败')))
  }, [])

  const cards = stats ? [
    ['用户', stats.users],
    ['VIP', stats.vip],
    ['待核款 VIP', stats.pendingVipSubscriptions],
    ['待审背书', stats.pendingEndorsements],
    ['待处理举报', stats.pendingReports],
    ['牧者认证', stats.pendingPastorCertifications],
    ['社区申请', stats.pendingCommunityAdminApplications],
    ['完课', stats.courseCompletions],
  ] : []

  return (
    <div className="card">
      <h3 style={{fontSize:15,marginBottom:16}}>运营概览</h3>
      <ErrorLine>{error}</ErrorLine>
      {!stats && !error && <Empty>加载中…</Empty>}
      {stats && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:18}}>
            {cards.map(([label, value]) => (
              <div key={label} style={{border:'1px solid var(--border)',borderRadius:8,padding:12}}>
                <div style={{fontSize:12,color:'var(--legacy-muted)'}}>{label}</div>
                <div style={{fontSize:24,fontWeight:700,marginTop:4}}>{value ?? 0}</div>
              </div>
            ))}
          </div>
          <h4 style={{fontSize:14,marginBottom:10}}>最近审计</h4>
          {(stats.auditLogs || []).length === 0 && <Empty>暂无审计记录</Empty>}
          {(stats.auditLogs || []).slice(0, 8).map(log => <AuditRow key={log.id} log={log} />)}
        </>
      )}
    </div>
  )
}

function VipSubscriptionsTab() {
  const [state, setState] = useState('pending')
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState({})
  const [confirmationRefs, setConfirmationRefs] = useState({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (nextState = state) => {
    try {
      setError('')
      const response = await admin.vipSubscriptions(nextState)
      setItems(response.data.subscriptions || [])
    } catch (err) {
      setError(getErrorMessage(err, 'VIP 申请加载失败'))
    }
  }, [state])

  useEffect(() => { load(state) }, [load, state])

  const review = async (item, action) => {
    const note = (notes[item.id] || '').trim()
    const confirmationRef = (confirmationRefs[item.id] || '').trim()
    if (action === 'reject' && !note) {
      setError('驳回申请时必须填写原因')
      return
    }
    if (action === 'approve' && confirmationRef.length < 6) {
      setError('批准时必须填写至少 6 位完整核款凭据')
      return
    }
    try {
      setBusy(item.id)
      setError('')
      await admin.reviewVipSubscription(item.id, action, note, confirmationRef)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'VIP 申请审核失败'))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12}}>
        <h3 style={{fontFamily:'var(--font-serif)',fontSize:15}}>VIP 核款申请</h3>
        <select value={state} onChange={event => setState(event.target.value)}>
          <option value="pending">待核款</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {items.length === 0 && <Empty>暂无 VIP 申请</Empty>}
      {items.map(item => (
        <div key={item.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>
            {item.nickname || item.email} · {item.plan_snapshot?.name || (item.tier === 'pro' ? '进阶 VIP' : '基础 VIP')}
          </div>
          <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>套餐等级：{item.tier === 'pro' ? 'Pro' : 'Basic'}</div>
          <div style={{fontSize:13,color:'var(--legacy-muted)',marginTop:4}}>
            {formatCurrencyAmount(item.amount_minor / 100, item.currency)} · {item.duration_days} 天 · 流水尾号 {item.payment_reference}
          </div>
          <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>提交：{formatDate(item.created_at)} · 状态：{item.state}</div>
          {item.applicant_note && <div style={{fontSize:13,marginTop:6}}>申请备注：{item.applicant_note}</div>}
          {item.state === 'pending' && (
            <>
              <input value={confirmationRefs[item.id] || ''}
                onChange={event => setConfirmationRefs(current => ({...current,[item.id]:event.target.value}))}
                placeholder="完整核款凭据（批准时必填且不可重复）"
                maxLength={100}
                style={{width:'100%',marginTop:10}} />
              <textarea rows={2} maxLength={1000} value={notes[item.id] || ''}
                onChange={event => setNotes(current => ({...current,[item.id]:event.target.value}))}
                placeholder="审核备注；驳回时必须填写原因"
                style={{width:'100%',marginTop:10}} />
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <ActionButton primary disabled={busy === item.id} onClick={() => review(item, 'approve')}>确认到账并开通</ActionButton>
                <ActionButton disabled={busy === item.id} onClick={() => review(item, 'reject')}>驳回</ActionButton>
              </div>
            </>
          )}
          {item.payment_confirmation_reference && <div style={{fontSize:13,marginTop:6}}>核款凭据：{item.payment_confirmation_reference}</div>}
          {item.review_note && <div style={{fontSize:13,marginTop:6}}>审核备注：{item.review_note}</div>}
          {item.activated_until && <div style={{fontSize:13,marginTop:6}}>权益到期：{formatDate(item.activated_until)}</div>}
        </div>
      ))}
    </div>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState([])
  const [edited, setEdited] = useState({})
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    admin.settings().then(r => setSettings(r.data.settings || [])).catch(err => setError(getErrorMessage(err, '配置加载失败')))
  }, [])

  const save = async (key) => {
    try {
      await admin.updateSetting(key, parseSettingValue(edited[key]))
      setSaved(key)
      setTimeout(()=>setSaved(''), 1500)
    } catch (err) {
      setError(getErrorMessage(err, '保存失败'))
    }
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>平台配置</h3>
      <ErrorLine>{error}</ErrorLine>
      {settings.length === 0 && !error && <Empty>配置加载中…</Empty>}
      {settings.map(s => (
        <div key={s.key} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14}}>{s.label || s.key}</div>
            <div style={{fontSize:12,color:'var(--legacy-muted)'}}>{s.key}</div>
          </div>
          <input defaultValue={settingValue(s.value)} onChange={e=>setEdited(p=>({...p,[s.key]:e.target.value}))}
            style={{width:160,border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',fontSize:14}} />
          <ActionButton onClick={()=>save(s.key)}>{saved===s.key ? '已存' : '保存'}</ActionButton>
        </div>
      ))}
    </div>
  )
}

function EndorsementsTab() {
  const [state, setState] = useState('pending')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (nextState = state) => {
    try {
      setLoading(true)
      setError('')
      const r = await admin.endorsements(nextState)
      setItems(r.data.endorsements || [])
    } catch (err) {
      setError(getErrorMessage(err, '背书列表加载失败'))
    } finally {
      setLoading(false)
    }
  }, [state])

  useEffect(() => { load(state) }, [load, state])

  const review = async (id, decision) => {
    try {
      await admin.reviewEndorsement(id, decision)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '审核操作失败，请稍后重试'))
    }
  }

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12}}>
        <h3 style={{fontFamily:'var(--font-serif)',fontSize:15}}>背书审核</h3>
        <select value={state} onChange={e=>setState(e.target.value)} style={{border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px'}}>
          <option value="pending">待审</option>
          <option value="verified">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {loading && <Empty>加载中…</Empty>}
      {!loading && items.length === 0 && <Empty>暂无背书</Empty>}
      {items.map(e => (
        <div key={e.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:14,fontFamily:'var(--font-serif)'}}>{e.name} · {e.kind === 'pastor' ? '牧者' : '引荐人'}</div>
              <div style={{fontSize:13,color:'var(--legacy-muted)',margin:'4px 0'}}>申请人：{e.nickname || e.email}</div>
              <div style={{fontSize:12,color:'var(--legacy-muted)'}}>教会：{e.church || '未填写'} · 联系：{e.contact}</div>
              {e.note && <div style={{fontSize:13,color:'var(--legacy-muted)',marginTop:6}}>备注：{e.note}</div>}
            </div>
            <span className="badge badge-soft">{e.state}</span>
          </div>
          {e.state === 'pending' && (
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
              <ActionButton primary onClick={()=>review(e.id,'verified')}>通过</ActionButton>
              <ActionButton onClick={()=>review(e.id,'rejected')}>驳回</ActionButton>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PointsAdjuster({ user, onBalanceChange }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const operationRef = useRef(null)

  const submit = async (direction) => {
    const value = Number(amount)
    const normalizedReason = reason.trim()
    if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000) {
      setFeedback('请输入 1 至 1000000 的整数')
      return
    }
    if (!normalizedReason) {
      setFeedback('请填写调整原因')
      return
    }
    const operationKey = `${direction}:${value}:${normalizedReason}`
    if (operationRef.current?.key !== operationKey) {
      operationRef.current = { key: operationKey, id: crypto.randomUUID() }
    }
    const operationId = operationRef.current.id
    try {
      setBusy(true)
      setFeedback('')
      const response = await admin.adjustPoints(user.id, direction * value, normalizedReason, operationId)
      onBalanceChange(user.id, response.data.balance)
      setAmount('')
      setReason('')
      operationRef.current = null
      setFeedback(`积分已更新：${response.data.balance}`)
    } catch (err) {
      setFeedback(getErrorMessage(err, '积分调整失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-points-adjuster">
      <input type="number" min="1" max="1000000" step="1" aria-label={`${user.email} 积分数量`}
        value={amount} onChange={event => { operationRef.current = null; setAmount(event.target.value) }} placeholder="积分" style={{width:'100%'}} />
      <input value={reason} maxLength={200} onChange={event => { operationRef.current = null; setReason(event.target.value) }}
        placeholder="原因（必填）" style={{width:'100%'}} />
      <ActionButton primary disabled={busy} onClick={() => submit(1)}>加分</ActionButton>
      <ActionButton disabled={busy} onClick={() => submit(-1)}>扣分</ActionButton>
      {feedback && <div role="status" style={{gridColumn:'1 / -1',fontSize:12,color:feedback.startsWith('积分已更新')?'#287A4B':'#C0392B'}}>{feedback}</div>}
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ q: '', role: '', banned: '', email_verified: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const usersRequest = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++usersRequest.current
    try {
      setLoading(true)
      setError('')
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      const r = await admin.users(params)
      if (requestId !== usersRequest.current) return
      setUsers(r.data.users || [])
    } catch (err) {
      if (requestId !== usersRequest.current) return
      setError(getErrorMessage(err, '用户列表加载失败'))
    } finally {
      if (requestId === usersRequest.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
    return () => { usersRequest.current += 1 }
  }, [load])

  const updateUser = async (fn) => {
    try {
      setError('')
      await fn()
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '用户操作失败'))
    }
  }

  const updateBalance = (id, balance) => {
    setUsers(current => current.map(user => user.id === id ? {...user, earned_points: balance} : user))
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>用户治理</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
        <input placeholder="邮箱/昵称" value={filters.q} onChange={e=>setFilters(p=>({...p,q:e.target.value}))} />
        <select value={filters.role} onChange={e=>setFilters(p=>({...p,role:e.target.value}))}>
          <option value="">全部角色</option><option value="free">free</option><option value="pastor">pastor</option><option value="admin">admin</option>
        </select>
        <select value={filters.banned} onChange={e=>setFilters(p=>({...p,banned:e.target.value}))}>
          <option value="">封禁状态</option><option value="true">已封禁</option><option value="false">未封禁</option>
        </select>
        <select value={filters.email_verified} onChange={e=>setFilters(p=>({...p,email_verified:e.target.value}))}>
          <option value="">邮箱状态</option><option value="true">已验证</option><option value="false">未验证</option>
        </select>
        <ActionButton primary onClick={load} disabled={loading}>{loading ? '查询中…' : '查询'}</ActionButton>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {users.length === 0 && !loading && <Empty>暂无用户</Empty>}
      {users.map(u => (
        <div key={u.id} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
          <div>
            <div style={{fontFamily:'var(--font-serif)'}}>{u.nickname || u.email}</div>
            <div style={{color:'var(--legacy-muted)'}}>{u.email} · {u.city || '未知城市'} · 背书 {u.verified_endorsements} · earned 积分 {u.earned_points}</div>
            <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
              <span className="badge badge-soft">{u.role}</span>
              <span className="badge badge-soft">{u.email_verified ? '邮箱已验证' : '邮箱未验证'}</span>
              {u.is_banned && <span className="badge" style={{background:'#FBE4E4',color:'#C0392B'}}>已封禁</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
            <PointsAdjuster user={u} onBalanceChange={updateBalance} />
            <select value={u.role} onChange={e=>updateUser(()=>admin.updateRole(u.id, e.target.value))}>
              <option value="free">free</option><option value="pastor">pastor</option><option value="admin">admin</option>
            </select>
            <ActionButton onClick={()=>updateUser(()=>admin.banUser(u.id, !u.is_banned))}>{u.is_banned ? '解封' : '封禁'}</ActionButton>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportsTab() {
  const [state, setState] = useState('pending')
  const [reports, setReports] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async (nextState = state) => {
    try {
      setError('')
      const r = await admin.reports(nextState)
      setReports(r.data.reports || [])
    } catch (err) {
      setError(getErrorMessage(err, '举报列表加载失败'))
    }
  }, [state])

  useEffect(() => { load(state) }, [load, state])

  const review = async (id, action) => {
    try {
      await admin.reviewReport(id, action)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '举报处理失败'))
    }
  }

  const removePost = async (targetId) => {
    try {
      await admin.removePost(targetId, '举报处理中由管理员删除')
      setError('')
    } catch (err) {
      setError(getErrorMessage(err, '删除帖子失败'))
    }
  }

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12}}>
        <h3 style={{fontSize:15}}>举报处理</h3>
        <select value={state} onChange={e=>setState(e.target.value)}>
          <option value="pending">待处理</option><option value="resolved">已处理</option><option value="dismissed">已忽略</option>
        </select>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {reports.length === 0 && <Empty>暂无举报</Empty>}
      {reports.map(report => (
        <div key={report.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{report.reason} · {report.target_type}</div>
          <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>举报人：{report.reporter_nickname} · {formatDate(report.created_at)}</div>
          {report.detail && <div style={{fontSize:13,marginTop:6}}>{report.detail}</div>}
          <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
            {report.state === 'pending' && <ActionButton primary onClick={()=>review(report.id,'resolve')}>标记已处理</ActionButton>}
            {report.state === 'pending' && <ActionButton onClick={()=>review(report.id,'dismiss')}>忽略</ActionButton>}
            {report.target_type === 'post' && <ActionButton onClick={()=>removePost(report.target_id)}>删除目标帖</ActionButton>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ApplicationsTab() {
  const [pastors, setPastors] = useState([])
  const [communityAdmins, setCommunityAdmins] = useState([])
  const [letters, setLetters] = useState([])
  const [lettersPage, setLettersPage] = useState(1)
  const [lettersTotal, setLettersTotal] = useState(0)
  const [lettersPageSize, setLettersPageSize] = useState(50)
  const [error, setError] = useState('')
  const [reviewingPastorLetter, setReviewingPastorLetter] = useState('')
  const lettersLoadRequest = useRef(0)
  const currentLettersPage = useRef(lettersPage)
  currentLettersPage.current = lettersPage

  const load = useCallback(async () => {
    const requestId = ++lettersLoadRequest.current
    try {
      setError('')
      const [pastorRes, communityRes, letterRes] = await Promise.allSettled([
        admin.pastorApplications(),
        admin.communityAdminApplications(),
        admin.pastorLetters(currentLettersPage.current),
      ])
      if (requestId !== lettersLoadRequest.current) return
      if (pastorRes.status === 'fulfilled') setPastors(pastorRes.value.data.applications || [])
      if (communityRes.status === 'fulfilled') setCommunityAdmins(communityRes.value.data.applications || [])
      if (letterRes.status === 'fulfilled') {
        setLetters(letterRes.value.data.letters || [])
        setLettersTotal(letterRes.value.data.total || 0)
        setLettersPageSize(letterRes.value.data.pageSize || 50)
      }
      const failed = [pastorRes, communityRes, letterRes].find(result => result.status === 'rejected')
      if (failed) setError(getErrorMessage(failed.reason, '部分申请列表加载失败'))
    } catch (err) {
      if (requestId !== lettersLoadRequest.current) return
      setError(getErrorMessage(err, '申请列表加载失败'))
    }
  }, [])

  useEffect(() => { load() }, [load, lettersPage])

  const reviewPastor = async (id, action) => {
    try {
      await admin.reviewPastorApplication(id, action)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '牧者认证审核失败'))
    }
  }

  const reviewCommunity = async (id, action) => {
    try {
      await admin.reviewCommunityAdminApplication(id, action)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '社区申请审核失败'))
    }
  }

  const reviewPastorLetter = async (id, action, updatedAt) => {
    if (reviewingPastorLetter) return
    if (action === 'revoke' && !window.confirm('确认撤销这封牧者介绍信的核验状态吗？')) return
    setReviewingPastorLetter(id)
    try {
      await admin.reviewPastorLetter(id, action, updatedAt)
      const reviewPage = currentLettersPage.current
      const requestId = ++lettersLoadRequest.current
      let response
      try {
        response = await admin.pastorLetters(reviewPage)
      } catch {
        setError('牧者介绍信核验已完成，但列表刷新失败，请手动刷新')
        return
      }
      if (requestId !== lettersLoadRequest.current || currentLettersPage.current !== reviewPage) return
      setLetters(response.data.letters || [])
      setLettersTotal(response.data.total || 0)
      setLettersPageSize(response.data.pageSize || 50)
    } catch (err) {
      setError(getErrorMessage(err, '牧者介绍信核验失败'))
    } finally {
      setReviewingPastorLetter('')
    }
  }

  return (
    <div className="card">
      <h3 style={{fontSize:15,marginBottom:12}}>认证与申请</h3>
      <ErrorLine>{error}</ErrorLine>
      <h4 style={{fontSize:14,marginBottom:8}}>牧者认证</h4>
      {pastors.length === 0 && <Empty>暂无牧者认证申请</Empty>}
      {pastors.map(item => (
        <div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{item.nickname || item.email} · {item.church_name}</div>
          <div style={{fontSize:12,color:'var(--legacy-muted)'}}>{item.contact_email} · {item.state}</div>
          <div style={{fontSize:13,marginTop:6}}>按立信息：{item.supporting_docs?.ordination_info || '未填写'}</div>
          <div style={{fontSize:13,marginTop:6}}>事奉说明：{item.supporting_docs?.statement || '未填写'}</div>
          {item.state === 'pending' && <div style={{display:'flex',gap:8,marginTop:8}}><ActionButton primary onClick={()=>reviewPastor(item.id,'approve')}>通过</ActionButton><ActionButton onClick={()=>reviewPastor(item.id,'reject')}>驳回</ActionButton></div>}
        </div>
      ))}
      <h4 style={{fontSize:14,margin:'18px 0 8px'}}>牧者介绍信</h4>
      {letters.length === 0 && <Empty>暂无牧者介绍信</Empty>}
      {letters.map(item => (
        <div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{item.nickname || item.email || item.user_id} · {item.pastor_name}</div>
          <div style={{fontSize:12,color:'var(--legacy-muted)'}}>牧者联系方式：{item.pastor_contact || '未填写'} · {item.is_verified ? '已核验' : '待核验'}</div>
          <div style={{fontSize:13,marginTop:6}}>家庭情况：{item.family_note || '未填写'}</div>
          <div style={{fontSize:13,marginTop:6}}>信仰情况：{item.faith_note || '未填写'}</div>
          <div style={{fontSize:13,marginTop:6}}>属灵生命：{item.spiritual_note || '未填写'}</div>
          <div style={{fontSize:13,marginTop:6}}>教会生活：{item.church_life_note || '未填写'}</div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            {!item.is_verified && <ActionButton primary disabled={reviewingPastorLetter === item.id} onClick={()=>reviewPastorLetter(item.id, 'approve', item.updated_at)}>{reviewingPastorLetter === item.id ? '核验中…' : '核验通过'}</ActionButton>}
            {item.is_verified && <ActionButton disabled={reviewingPastorLetter === item.id} onClick={()=>reviewPastorLetter(item.id, 'revoke', item.updated_at)}>{reviewingPastorLetter === item.id ? '处理中…' : '撤销核验'}</ActionButton>}
          </div>
        </div>
      ))}
      {lettersTotal > lettersPageSize && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:12}}>
          <ActionButton disabled={lettersPage <= 1} onClick={()=>setLettersPage(page => page - 1)}>上一页</ActionButton>
          <span className="muted-small">第 {lettersPage} 页 · 共 {lettersTotal} 封</span>
          <ActionButton disabled={lettersPage * lettersPageSize >= lettersTotal} onClick={()=>setLettersPage(page => page + 1)}>下一页</ActionButton>
        </div>
      )}
      <h4 style={{fontSize:14,margin:'18px 0 8px'}}>社区管理员申请</h4>
      {communityAdmins.length === 0 && <Empty>暂无社区管理员申请</Empty>}
      {communityAdmins.map(item => (
        <div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{item.nickname || item.email} · {item.group_name || '全站'}</div>
          <div style={{fontSize:12,color:'var(--legacy-muted)'}}>{item.reason || '未填写理由'} · {item.state}</div>
          {item.state === 'pending' && <div style={{display:'flex',gap:8,marginTop:8}}><ActionButton primary onClick={()=>reviewCommunity(item.id,'approve')}>通过</ActionButton><ActionButton onClick={()=>reviewCommunity(item.id,'reject')}>驳回</ActionButton></div>}
        </div>
      ))}
    </div>
  )
}

function AuditTab() {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    admin.auditLogs().then(r => setLogs(r.data.auditLogs || [])).catch(err => setError(getErrorMessage(err, '审计日志加载失败')))
  }, [])

  return (
    <div className="card">
      <h3 style={{fontSize:15,marginBottom:12}}>管理员审计</h3>
      <ErrorLine>{error}</ErrorLine>
      {logs.length === 0 && !error && <Empty>暂无审计记录</Empty>}
      {logs.map(log => <AuditRow key={log.id} log={log} />)}
    </div>
  )
}

function AuditRow({ log }) {
  return (
    <div style={{padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
      <div style={{fontWeight:600}}>{log.action} · {log.target_type}</div>
      <div style={{color:'var(--legacy-muted)'}}>{log.actor_nickname || log.actor_email || '系统'} · {formatDate(log.created_at)}</div>
      <div style={{color:'var(--legacy-muted)',wordBreak:'break-word'}}>{JSON.stringify(log.detail || {})}</div>
    </div>
  )
}
