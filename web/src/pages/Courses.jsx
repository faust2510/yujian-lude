import { useEffect, useState } from 'react'
import { courses } from '../api/client'

export default function Courses() {
  const [list, setList] = useState([])
  const [progress, setProgress] = useState({})

  useEffect(() => {
    courses.list().then(r => {
      const cs = r.data.courses || []
      setList(cs)
      cs.forEach(c => {
        courses.detail(c.slug).then(p => setProgress(prev => ({...prev, [c.slug]: p.data}))).catch(()=>{})
      })
    }).catch(()=>{})
  }, [])

  const completeUnit = async (unitIndex, courseSlug) => {
    try {
      await courses.submitUnit(courseSlug, unitIndex, { passed: true, score: 1 })
      courses.detail(courseSlug).then(p => setProgress(prev => ({...prev, [courseSlug]: p.data})))
    } catch {}
  }

  return (
    <>
      <h1 className="page-title">婚恋课程</h1>
      <p className="page-sub">完成恋爱必修课后可进入匹配池；凯勒课程作为进阶装备提升曝光</p>

      {list.length === 0 && (
        <div className="card" style={{color:'var(--muted)',fontSize:14}}>课程加载中…</div>
      )}

      {list.map(c => {
        const prog = progress[c.slug]
        const done = prog?.progress?.units_done || 0
        const total = prog?.units?.length || 1
        const pct = Math.round((done / total) * 100)

        return (
          <div className="card" key={c.slug}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div>
                <h3 style={{fontFamily:'var(--font-serif)',fontSize:16}}>{c.title}</h3>
                <p style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{c.description}</p>
              </div>
              {prog?.progress?.badge_awarded && <span className="badge badge-green">已完成婚姻装备 ✓</span>}
            </div>

            <div style={{background:'var(--border)',borderRadius:4,height:6,marginBottom:12}}>
              <div style={{background:'var(--brand)',height:6,borderRadius:4,width:`${pct}%`,transition:'width 0.3s'}} />
            </div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:12}}>
              {done} / {total} 单元完成（{pct}%）
            </div>

            {prog?.units?.map(u => {
              const att = prog?.attempts?.find(a => a.unit_index === u.unit_index)
              return (
                <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'10px 12px',background:att?.passed?'#F0FAF4':'var(--bg)',
                  borderRadius:8,marginBottom:6,fontSize:14}}>
                  <span style={{color:att?.passed?'#1A7A3C':'var(--fg)'}}>{att?.passed ? '✓ ' : ''}{u.title}</span>
                  {!att?.passed && (
                    <button className="btn btn-outline" style={{fontSize:12,padding:'4px 12px'}}
                      onClick={() => completeUnit(u.unit_index, c.slug)}>打卡完成</button>
                  )}
                </div>
              )
            })}

            <div style={{marginTop:12,fontSize:13,color:'var(--muted)'}}>
              {c.is_match_gate_course
                ? '入池门槛：完成后满足恋爱必修课资格'
                : <>完成奖励：+{c.reward_points || 0} 积分{c.reward_vip_days > 0 && <span> + {c.reward_vip_days} 天 VIP 体验</span>}</>}
            </div>
          </div>
        )
      })}
    </>
  )
}
