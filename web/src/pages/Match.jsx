import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Crown, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { matches } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const EMPTY_FILTERS = { min_age: '', max_age: '', city: '' }

export default function Match() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [msg, setMsg] = useState({})
  const [mutuals, setMutuals] = useState({})
  const [lockedStatus, setLockedStatus] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState({})
  const [expanded, setExpanded] = useState({})
  const [viewers, setViewers] = useState([])
  const [viewersLoading, setViewersLoading] = useState(false)
  const [viewersUpsell, setViewersUpsell] = useState(false)
  const [viewersError, setViewersError] = useState('')
  const candidatesRequest = useRef(0)
  const viewersRequest = useRef(0)
  const viewedCandidates = useRef(new Set())

  const loadCandidates = useCallback((nextFilters) => {
    const requestId = ++candidatesRequest.current
    setLoading(true)
    setError('')
    matches.candidates(nextFilters)
      .then(r => {
        if (requestId !== candidatesRequest.current) return
        setCandidates(r.data.candidates || [])
        setLockedStatus(r.data.locked ? r.data.status : null)
      })
      .catch((err) => {
        if (requestId !== candidatesRequest.current) return
        setCandidates([])
        setLockedStatus(null)
        setError(err.response?.data?.error || '候选加载失败，请稍后重试')
      })
      .finally(() => {
        if (requestId === candidatesRequest.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadCandidates(EMPTY_FILTERS)
    return () => { candidatesRequest.current += 1 }
  }, [loadCandidates])

  const loadViewers = useCallback(() => {
    const requestId = ++viewersRequest.current
    setViewersError('')
    if (!user) {
      setViewersLoading(false)
      setViewersUpsell(false)
      setViewers([])
      return
    }
    if (!user?.is_vip) {
      setViewersLoading(false)
      setViewersUpsell(true)
      setViewers([])
      return
    }

    setViewersLoading(true)
    matches.viewers()
      .then(r => {
        if (requestId !== viewersRequest.current) return
        setViewers(r.data?.viewers || [])
        setViewersUpsell(false)
      })
      .catch(err => {
        if (requestId !== viewersRequest.current) return
        if (err.response?.status === 403) {
          setViewersUpsell(true)
          setViewers([])
          return
        }
        setViewersError(err.response?.data?.error || '浏览记录加载失败，请稍后重试')
      })
      .finally(() => {
        if (requestId === viewersRequest.current) setViewersLoading(false)
      })
  }, [user])

  useEffect(() => {
    loadViewers()
    return () => { viewersRequest.current += 1 }
  }, [loadViewers])

  const recordView = async (id) => {
    if (viewedCandidates.current.has(id)) return
    viewedCandidates.current.add(id)
    try {
      await matches.view(id)
    } catch {
      viewedCandidates.current.delete(id)
    }
  }

  const toggleDetails = (id) => {
    if (!expanded[id]) recordView(id)
    setExpanded(current => ({...current, [id]: !current[id]}))
  }

  const express = async (id, intent) => {
    recordView(id)
    setActing(p => ({...p, [id]: true}))
    try {
      const r = await matches.express(id, intent)
      if (intent === 'like') {
        if (r.data?.mutual) {
          setMutuals(m => ({...m, [id]: true}))
        } else {
          setMsg(m => ({...m, [id]: '已表达意向 ♡'}))
        }
      } else {
        setMsg(m => ({...m, [id]: '已跳过'}))
      }
    } catch (err) {
      setMsg(m => ({...m, [id]: err.response?.data?.error || '操作失败'}))
    } finally {
      setActing(p => ({...p, [id]: false}))
    }
  }

  const clearFilters = () => {
    const blank = { ...EMPTY_FILTERS }
    setFilters(blank)
    loadCandidates(blank)
  }

  return (
    <>
      <h1 className="page-title">匿名匹配</h1>
      <p className="page-sub">候选人均为匿名显示，双方都有意向后才开启私聊通道</p>

      <div className="card" style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}}>
        <div className="field" style={{margin:0,minWidth:100}}>
          <label>最小年龄</label>
          <input value={filters.min_age} onChange={e=>setFilters(p=>({...p,min_age:e.target.value}))} placeholder="20" />
        </div>
        <div className="field" style={{margin:0,minWidth:100}}>
          <label>最大年龄</label>
          <input value={filters.max_age} onChange={e=>setFilters(p=>({...p,max_age:e.target.value}))} placeholder="35" />
        </div>
        <div className="field" style={{margin:0,minWidth:120}}>
          <label>城市</label>
          <input value={filters.city} onChange={e=>setFilters(p=>({...p,city:e.target.value}))} />
        </div>
        <button className="btn btn-outline" onClick={() => loadCandidates(filters)} disabled={loading}>
          {loading ? '筛选中…' : '筛选'}
        </button>
      </div>

      {user && (
        <section style={{borderBottom:'1px solid var(--border)',padding:'14px 0',marginBottom:16}} aria-labelledby="match-viewers-title">
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <Eye size={18} aria-hidden="true" />
            <h2 id="match-viewers-title" style={{fontFamily:'var(--font-serif)',fontSize:16}}>谁看过我</h2>
          </div>
          {viewersLoading ? (
            <div style={{fontSize:13,color:'var(--legacy-muted)'}}>浏览记录加载中…</div>
          ) : viewersUpsell ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'var(--legacy-muted)'}}>升级 VIP 后可查看最近浏览过你的用户。</span>
              <button className="btn btn-outline" onClick={() => navigate('/vip')}>
                <Crown size={16} aria-hidden="true" />
                升级 VIP
              </button>
            </div>
          ) : viewersError ? (
            <div className="error-msg">
              <span>{viewersError}</span>
              <button className="btn btn-outline" onClick={loadViewers}>重试</button>
            </div>
          ) : viewers.length === 0 ? (
            <div style={{fontSize:13,color:'var(--legacy-muted)'}}>暂时还没有浏览记录</div>
          ) : (
            <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:2}}>
              {viewers.map(viewer => (
                <div key={`${viewer.viewer_id}-${viewer.viewed_at}`} style={{minWidth:130,fontSize:13}}>
                  <strong>{viewer.nickname || '匿名用户'}</strong>
                  <div style={{color:'var(--legacy-muted)',marginTop:2}}>{viewer.city || '城市未填写'} · {new Date(viewer.viewed_at).toLocaleDateString('zh-CN')}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {loading && <div style={{color:'var(--legacy-muted)',padding:20,fontSize:14}}>加载中…</div>}

      {!loading && error && (
        <div className="card" style={{padding:28,marginBottom:16,color:'#B42318'}}>
          <div style={{fontFamily:'var(--font-serif)',fontSize:18,marginBottom:8}}>候选加载失败</div>
          <p style={{fontSize:14,marginBottom:16}}>{error}</p>
          <button className="btn btn-outline" onClick={() => loadCandidates(filters)}>重试</button>
        </div>
      )}

      {!loading && !error && lockedStatus && (
        <div className="card" style={{padding:28,marginBottom:16}}>
          <div style={{fontFamily:'var(--font-serif)',fontSize:20,marginBottom:8}}>还没有进入匹配池</div>
          <p style={{color:'var(--legacy-muted)',fontSize:14,marginBottom:18,lineHeight:1.7}}>{lockedStatus.gate}</p>
          <div className="grid-2" style={{marginBottom:16}}>
            {(lockedStatus.nextActions || []).map(action => (
              <button key={action.key} className="btn btn-outline" onClick={() => navigate(action.to)}>
                {action.label}
              </button>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--legacy-muted)'}}>这是为了让进入匹配池的人都经过基本资料、信仰与背书确认。</div>
        </div>
      )}

      {!loading && !error && !lockedStatus && candidates.length === 0 && (
        <div className="card" style={{textAlign:'center',padding:40}}>
          <div style={{fontSize:24,marginBottom:8}}>暂无候选</div>
          <div style={{color:'var(--legacy-muted)',fontSize:14}}>试试放宽筛选条件，或先完成课程提升曝光分</div>
          <button className="btn btn-outline" style={{marginTop:16}} onClick={clearFilters}>
            清空筛选
          </button>
        </div>
      )}

      <div className="grid-2">
        {candidates.map(c => (
          <div className="card" key={c.id}>
            <div style={{width:48,height:48,borderRadius:'50%',background:'var(--brand)',
              color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',
              fontFamily:'var(--font-serif)',fontSize:20,marginBottom:12}}>
              {(c.nickname||'?')[0]}
            </div>
            <div style={{fontFamily:'var(--font-serif)',fontSize:15,marginBottom:4}}>{c.nickname || '匿名用户'}</div>
            <div style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:8}}>
              {c.city && `${c.city} · `}
              {c.birth_year && `${new Date().getFullYear() - c.birth_year}岁 · `}
              {c.education}
            </div>
            {c.church_name && (
              <div style={{fontSize:12,color:'var(--brand)',marginBottom:8}}>⛪ {c.church_name}</div>
            )}
            {c.has_badge && <span className="badge badge-green" style={{marginBottom:8}}>已完成婚姻装备</span>}
            <button className="btn btn-outline" style={{width:'100%',fontSize:13,marginTop:8}}
              onClick={() => toggleDetails(c.id)} aria-expanded={!!expanded[c.id]}>
              <Eye size={15} aria-hidden="true" />
              {expanded[c.id] ? '收起资料' : '查看资料'}
              {expanded[c.id] ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </button>
            {expanded[c.id] && (
              <div style={{fontSize:12,color:'var(--legacy-muted)',lineHeight:1.7,padding:'10px 0 2px'}}>
                {c.church_name ? `教会：${c.church_name}` : '教会信息未填写'}
              </div>
            )}
            {mutuals[c.id] ? (
              <button className="btn btn-primary" style={{flex:1,fontSize:13,marginTop:8}}
                onClick={() => navigate('/chat')}>
                互相心动 ♥ 去私聊
              </button>
            ) : msg[c.id] ? (
              <div style={{fontSize:13,color:'var(--legacy-muted)',padding:'8px 0'}}>{msg[c.id]}</div>
            ) : (
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button className="btn btn-primary" style={{flex:1,fontSize:13}}
                  disabled={!!acting[c.id]}
                  onClick={() => express(c.id, 'like')}>{acting[c.id] ? '处理中…' : '心动'}</button>
                <button className="btn btn-outline" style={{flex:1,fontSize:13}}
                  disabled={!!acting[c.id]}
                  onClick={() => express(c.id, 'pass')}>跳过</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
