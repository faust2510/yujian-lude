import { useCallback, useEffect, useState } from 'react'
import { admin } from '../api/client'

const tabs = [
  ['overview', '概览'],
  ['endorsements', '背书'],
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
  return <div style={{color:'var(--muted)',fontSize:14}}>{children}</div>
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
                <div style={{fontSize:12,color:'var(--muted)'}}>{label}</div>
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
            <div style={{fontSize:12,color:'var(--muted)'}}>{s.key}</div>
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
              <div style={{fontSize:13,color:'var(--muted)',margin:'4px 0'}}>申请人：{e.nickname || e.email}</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>教会：{e.church || '未填写'} · 联系：{e.contact}</div>
              {e.note && <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>备注：{e.note}</div>}
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

function UsersTab() {
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ q: '', role: '', banned: '', email_verified: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      const r = await admin.users(params)
      setUsers(r.data.users || [])
    } catch (err) {
      setError(getErrorMessage(err, '用户列表加载失败'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const updateUser = async (fn) => {
    try {
      setError('')
      await fn()
      await load()
    } catch (err) {
      setError(getErrorMessage(err, '用户操作失败'))
    }
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>用户治理</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
        <input placeholder="邮箱/昵称" value={filters.q} onChange={e=>setFilters(p=>({...p,q:e.target.value}))} />
        <select value={filters.role} onChange={e=>setFilters(p=>({...p,role:e.target.value}))}>
          <option value="">全部角色</option><option value="free">free</option><option value="vip">vip</option><option value="pastor">pastor</option><option value="admin">admin</option>
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
        <div key={u.id} style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) auto',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
          <div>
            <div style={{fontFamily:'var(--font-serif)'}}>{u.nickname || u.email}</div>
            <div style={{color:'var(--muted)'}}>{u.email} · {u.city || '未知城市'} · 背书 {u.verified_endorsements}</div>
            <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
              <span className="badge badge-soft">{u.role}</span>
              <span className="badge badge-soft">{u.email_verified ? '邮箱已验证' : '邮箱未验证'}</span>
              {u.is_banned && <span className="badge" style={{background:'#FBE4E4',color:'#C0392B'}}>已封禁</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
            <select value={u.role} onChange={e=>updateUser(()=>admin.updateRole(u.id, e.target.value))}>
              <option value="free">free</option><option value="vip">vip</option><option value="pastor">pastor</option><option value="admin">admin</option>
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
          <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>举报人：{report.reporter_nickname} · {formatDate(report.created_at)}</div>
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
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')
      const [pastorRes, communityRes] = await Promise.all([
        admin.pastorApplications(),
        admin.communityAdminApplications(),
      ])
      setPastors(pastorRes.data.applications || [])
      setCommunityAdmins(communityRes.data.applications || [])
    } catch (err) {
      setError(getErrorMessage(err, '申请列表加载失败'))
    }
  }

  useEffect(() => { load() }, [])

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

  return (
    <div className="card">
      <h3 style={{fontSize:15,marginBottom:12}}>认证与申请</h3>
      <ErrorLine>{error}</ErrorLine>
      <h4 style={{fontSize:14,marginBottom:8}}>牧者认证</h4>
      {pastors.length === 0 && <Empty>暂无牧者认证申请</Empty>}
      {pastors.map(item => (
        <div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{item.nickname || item.email} · {item.church_name}</div>
          <div style={{fontSize:12,color:'var(--muted)'}}>{item.contact_email} · {item.state}</div>
          {item.state === 'pending' && <div style={{display:'flex',gap:8,marginTop:8}}><ActionButton primary onClick={()=>reviewPastor(item.id,'approve')}>通过</ActionButton><ActionButton onClick={()=>reviewPastor(item.id,'reject')}>驳回</ActionButton></div>}
        </div>
      ))}
      <h4 style={{fontSize:14,margin:'18px 0 8px'}}>社区管理员申请</h4>
      {communityAdmins.length === 0 && <Empty>暂无社区管理员申请</Empty>}
      {communityAdmins.map(item => (
        <div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontWeight:600}}>{item.nickname || item.email} · {item.group_name || '全站'}</div>
          <div style={{fontSize:12,color:'var(--muted)'}}>{item.reason || '未填写理由'} · {item.state}</div>
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
      <div style={{color:'var(--muted)'}}>{log.actor_nickname || log.actor_email || '系统'} · {formatDate(log.created_at)}</div>
      <div style={{color:'var(--muted)',wordBreak:'break-word'}}>{JSON.stringify(log.detail || {})}</div>
    </div>
  )
}
