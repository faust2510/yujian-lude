import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { matches } from '../api/client'

export default function Match() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ min_age: '', max_age: '', city: '' })
  const [msg, setMsg] = useState({})
  const [mutuals, setMutuals] = useState({})
  const [lockedStatus, setLockedStatus] = useState(null)

  const load = () => {
    setLoading(true)
    matches.candidates(filters)
      .then(r => {
        setCandidates(r.data.candidates || [])
        setLockedStatus(r.data.locked ? r.data.status : null)
      })
      .catch(() => {
        setCandidates([])
        setLockedStatus(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const express = async (id, intent) => {
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
    }
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
        <button className="btn btn-outline" onClick={load}>筛选</button>
      </div>

      {loading && <div style={{color:'var(--muted)',padding:20,fontSize:14}}>加载中…</div>}

      {!loading && lockedStatus && (
        <div className="card" style={{padding:28,marginBottom:16}}>
          <div style={{fontFamily:'var(--font-serif)',fontSize:20,marginBottom:8}}>还没有进入匹配池</div>
          <p style={{color:'var(--muted)',fontSize:14,marginBottom:18,lineHeight:1.7}}>{lockedStatus.gate}</p>
          <div className="grid-2" style={{marginBottom:16}}>
            {(lockedStatus.nextActions || []).map(action => (
              <button key={action.key} className="btn btn-outline" onClick={() => navigate(action.to)}>
                {action.label}
              </button>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--muted)'}}>这是为了让进入匹配池的人都经过基本资料、信仰与背书确认。</div>
        </div>
      )}

      {!loading && !lockedStatus && candidates.length === 0 && (
        <div className="card" style={{textAlign:'center',padding:40}}>
          <div style={{fontSize:24,marginBottom:8}}>暂无候选</div>
          <div style={{color:'var(--muted)',fontSize:14}}>试试放宽筛选条件，或先完成课程提升曝光分</div>
          <button className="btn btn-outline" style={{marginTop:16}} onClick={()=>setFilters({min_age:'',max_age:'',city:''})}>
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
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>
              {c.city && `${c.city} · `}
              {c.birth_year && `${new Date().getFullYear() - c.birth_year}岁 · `}
              {c.education}
            </div>
            {c.church_name && (
              <div style={{fontSize:12,color:'var(--brand)',marginBottom:8}}>⛪ {c.church_name}</div>
            )}
            {c.has_badge && <span className="badge badge-green" style={{marginBottom:8}}>已完成婚姻装备</span>}
            {mutuals[c.id] ? (
              <button className="btn btn-primary" style={{flex:1,fontSize:13,marginTop:8}}
                onClick={() => navigate('/chat')}>
                互相心动 ♥ 去私聊
              </button>
            ) : msg[c.id] ? (
              <div style={{fontSize:13,color:'var(--muted)',padding:'8px 0'}}>{msg[c.id]}</div>
            ) : (
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button className="btn btn-primary" style={{flex:1,fontSize:13}}
                  onClick={() => express(c.id, 'like')}>心动</button>
                <button className="btn btn-outline" style={{flex:1,fontSize:13}}
                  onClick={() => express(c.id, 'pass')}>跳过</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
