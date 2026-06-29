import { useEffect, useState } from 'react'
import { admin } from '../api/client'

export default function Admin() {
  const [tab, setTab] = useState('settings')
  return (
    <>
      <h1 className="page-title">管理台</h1>
      <p className="page-sub">改价格 · 改积分配置 · 审核牧者认证与背书 · 用户管理</p>

      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[['settings','配置'],['endorsements','背书审核'],['pastors','牧者审核'],['users','用户'],['posts','社群管理']].map(([k,l]) => (
          <button key={k} className={`btn ${tab===k?'btn-primary':'btn-outline'}`} style={{fontSize:13}}
            onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'settings' && <SettingsTab />}
      {tab === 'endorsements' && <EndorsementsTab />}
      {tab === 'pastors' && <PastorsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'posts' && <div className="card" style={{color:'var(--muted)',fontSize:14}}>社群帖子管理：在社群页可直接精选/删帖（牧者及社区管理员权限）。</div>}
    </>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState([])
  const [edited, setEdited] = useState({})
  const [saved, setSaved] = useState('')

  useEffect(() => {
    admin.settings().then(r => setSettings(r.data.settings || [])).catch(()=>setSettings([]))
  }, [])

  const save = async (key) => {
    try {
      await admin.updateSetting(key, edited[key])
      setSaved(key)
      setTimeout(()=>setSaved(''), 1500)
    } catch {}
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>平台配置（改了立即生效，无需改代码）</h3>
      {settings.length === 0 && <div style={{color:'var(--muted)',fontSize:14}}>配置加载中…</div>}
      {settings.map(s => (
        <div key={s.key} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14}}>{s.label || s.key}</div>
            <div style={{fontSize:12,color:'var(--muted)'}}>{s.key}</div>
          </div>
          <input defaultValue={s.value} onChange={e=>setEdited(p=>({...p,[s.key]:e.target.value}))}
            style={{width:100,border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',fontSize:14}} />
          <button className="btn btn-outline" style={{fontSize:12,padding:'4px 12px'}} onClick={()=>save(s.key)}>
            {saved===s.key ? '已存 ✓' : '保存'}
          </button>
        </div>
      ))}
    </div>
  )
}

function EndorsementsTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const r = await admin.endorsements('pending')
      setItems(r.data.endorsements || [])
    } catch {
      setError('背书列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const review = async (id, decision) => {
    try {
      await admin.reviewEndorsement(id, decision)
      load()
    } catch {
      setError('审核操作失败，请稍后重试')
    }
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>背书审核</h3>
      <p style={{fontSize:13,color:'var(--muted)',marginTop:-4,marginBottom:12}}>审核牧者或成熟引荐人背书；通过后用户即可满足入池背书门槛。</p>
      {error && <div style={{fontSize:13,color:'#B42318',marginBottom:10}}>{error}</div>}
      {loading && <div style={{color:'var(--muted)',fontSize:14}}>加载中…</div>}
      {!loading && items.length === 0 && <div style={{color:'var(--muted)',fontSize:14}}>暂无待审背书</div>}
      {items.map(e => (
        <div key={e.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:14,fontFamily:'var(--font-serif)'}}>{e.name} · {e.kind === 'pastor' ? '牧者' : '成熟引荐人'}</div>
              <div style={{fontSize:13,color:'var(--muted)',margin:'4px 0'}}>申请人：{e.nickname || e.email}</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>教会：{e.church || '未填写'} · 联系：{e.contact}</div>
              {e.note && <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>备注：{e.note}</div>}
            </div>
            <span className="badge badge-soft">待审</span>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
            <button className="btn btn-primary" style={{fontSize:12,padding:'4px 14px'}} onClick={()=>review(e.id,'verified')}>通过</button>
            <button className="btn btn-outline" style={{fontSize:12,padding:'4px 14px'}} onClick={()=>review(e.id,'rejected')}>驳回</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PastorsTab() {
  const [apps, setApps] = useState([])
  const load = () => admin.pastorApplications().then(r => setApps(r.data.applications || [])).catch(()=>setApps([]))
  useEffect(() => { load() }, [])

  const review = async (id, decision) => {
    try { await admin.reviewPastorApplication(id, decision); load() } catch {}
  }

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>牧者认证申请</h3>
      {apps.length === 0 && <div style={{color:'var(--muted)',fontSize:14}}>暂无待审申请</div>}
      {apps.map(a => (
        <div key={a.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:14,fontFamily:'var(--font-serif)'}}>{a.church_name} · {a.presbytery}</div>
          <div style={{fontSize:13,color:'var(--muted)',margin:'4px 0'}}>{a.statement}</div>
          <div style={{fontSize:12,color:'var(--muted)'}}>联系：{a.contact}</div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className="btn btn-primary" style={{fontSize:12,padding:'4px 14px'}} onClick={()=>review(a.id,'approve')}>通过</button>
            <button className="btn btn-outline" style={{fontSize:12,padding:'4px 14px'}} onClick={()=>review(a.id,'reject')}>驳回</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    admin.users().then(r => setUsers(r.data.users || [])).catch(()=>setUsers([]))
  }, [])

  return (
    <div className="card">
      <h3 style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:12}}>用户列表</h3>
      {users.length === 0 && <div style={{color:'var(--muted)',fontSize:14}}>加载中…</div>}
      {users.map(u => (
        <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
          <div>
            <span style={{fontFamily:'var(--font-serif)'}}>{u.nickname || u.email}</span>
            <span style={{color:'var(--muted)',marginLeft:8}}>{u.email}</span>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <span className="badge badge-soft">{u.role}</span>
            {u.is_banned && <span className="badge" style={{background:'#FBE4E4',color:'#C0392B'}}>已封禁</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
