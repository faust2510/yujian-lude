import { useEffect, useState } from 'react'
import { courses } from '../api/client'

export default function Courses() {
  const [list, setList] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState({})
  const [msg, setMsg] = useState('')

  const loadCourses = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await courses.list()
      const cs = r.data.courses || []
      setList(cs)
      const details = await Promise.allSettled(cs.map(c => courses.detail(c.slug)))
      const nextProgress = {}
      details.forEach((result, index) => {
        if (result.status === 'fulfilled') nextProgress[cs[index].slug] = result.value.data
      })
      setProgress(nextProgress)
      if (details.some(result => result.status === 'rejected')) {
        setError('部分课程进度加载失败，请稍后重试')
      }
    } catch (err) {
      setError(err.response?.data?.error || '课程加载失败，请稍后重试')
      setList([])
      setProgress({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCourses() }, [])

  const completeUnit = async (unitIndex, courseSlug) => {
    const key = `${courseSlug}-${unitIndex}`
    setSubmitting(p => ({...p, [key]: true}))
    setMsg('')
    try {
      await courses.submitUnit(courseSlug, unitIndex, { passed: true, score: 1 })
      const detail = await courses.detail(courseSlug)
      setProgress(prev => ({...prev, [courseSlug]: detail.data}))
      setMsg('打卡已保存')
    } catch (err) {
      setMsg(err.response?.data?.error || '打卡失败，请重试')
    } finally {
      setSubmitting(p => ({...p, [key]: false}))
    }
  }

  return (
    <>
      <h1 className="page-title">婚恋课程</h1>
      <p className="page-sub">完成恋爱必修课后可进入匹配池；凯勒课程作为进阶装备提升曝光</p>

      {error && (
        <div className="card" style={{color:'#B42318',fontSize:14,marginBottom:16}}>
          {error}
          <button className="btn btn-outline" style={{marginLeft:12}} onClick={loadCourses}>重试</button>
        </div>
      )}
      {msg && <div className="card" style={{fontSize:13,color:msg.includes('失败') ? '#B42318' : '#17a34a',marginBottom:16}}>{msg}</div>}

      {loading && (
        <div className="card" style={{color:'var(--muted)',fontSize:14}}>课程加载中…</div>
      )}
      {!loading && list.length === 0 && !error && (
        <div className="card" style={{color:'var(--muted)',fontSize:14}}>
          暂无课程。稍后刷新页面，或联系管理员确认课程配置。
        </div>
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
              const key = `${c.slug}-${u.unit_index}`
              return (
                <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'10px 12px',background:att?.passed?'#F0FAF4':'var(--bg)',
                  borderRadius:8,marginBottom:6,fontSize:14}}>
                  <span style={{color:att?.passed?'#1A7A3C':'var(--fg)'}}>{att?.passed ? '✓ ' : ''}{u.title}</span>
                  {!att?.passed && (
                    <button className="btn btn-outline" style={{fontSize:12,padding:'4px 12px'}}
                      disabled={!!submitting[key]}
                      onClick={() => completeUnit(u.unit_index, c.slug)}>
                      {submitting[key] ? '提交中…' : '打卡完成'}
                    </button>
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
