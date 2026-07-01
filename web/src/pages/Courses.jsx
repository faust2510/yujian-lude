import { useEffect, useMemo, useState } from 'react'
import { courses } from '../api/client'

const LETTERS = ['A', 'B', 'C', 'D']

function statusText(progress, latestExam) {
  if (progress?.state === 'completed') return '已完成'
  if (latestExam?.passed) return '考试已通过'
  if (latestExam && !latestExam.passed) return '考试未通过'
  if (progress?.units_done > 0) return '学习中'
  return '未开始'
}

export default function Courses() {
  const [list, setList] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState({})
  const [msg, setMsg] = useState('')
  const [examState, setExamState] = useState({})

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

  const refreshCourse = async (courseSlug) => {
    const detail = await courses.detail(courseSlug)
    setProgress(prev => ({...prev, [courseSlug]: detail.data}))
    return detail.data
  }

  const markRead = async (unitIndex, courseSlug) => {
    const key = `${courseSlug}-${unitIndex}`
    setSubmitting(p => ({...p, [key]: true}))
    setMsg('')
    try {
      await courses.submitUnit(courseSlug, unitIndex, { readConfirmed: true })
      await refreshCourse(courseSlug)
      setMsg('阅读进度已保存')
    } catch (err) {
      setMsg(err.response?.data?.error || '保存阅读进度失败，请重试')
    } finally {
      setSubmitting(p => ({...p, [key]: false}))
    }
  }

  const loadExam = async (courseSlug) => {
    setExamState(prev => ({...prev, [courseSlug]: { ...(prev[courseSlug] || {}), loading: true, error: '' }}))
    try {
      const r = await courses.exam(courseSlug)
      setExamState(prev => ({
        ...prev,
        [courseSlug]: {
          ...(prev[courseSlug] || {}),
          loading: false,
          questions: r.data.questions || [],
          passThreshold: r.data.passThreshold,
          total: r.data.total,
          answers: {},
          result: null,
          error: '',
        },
      }))
    } catch (err) {
      setExamState(prev => ({
        ...prev,
        [courseSlug]: {
          ...(prev[courseSlug] || {}),
          loading: false,
          error: err.response?.data?.error || '考试加载失败，请读完全部单元后重试',
        },
      }))
    }
  }

  const setExamAnswer = (courseSlug, questionId, letter) => {
    setExamState(prev => ({
      ...prev,
      [courseSlug]: {
        ...(prev[courseSlug] || {}),
        answers: {
          ...((prev[courseSlug] || {}).answers || {}),
          [questionId]: letter,
        },
      },
    }))
  }

  const submitExam = async (courseSlug) => {
    const state = examState[courseSlug] || {}
    const answers = (state.questions || []).map(q => ({ id: q.id, a: state.answers?.[q.id] }))
    setExamState(prev => ({...prev, [courseSlug]: { ...state, submitting: true, error: '' }}))
    try {
      const r = await courses.submitExam(courseSlug, answers)
      await refreshCourse(courseSlug)
      setExamState(prev => ({
        ...prev,
        [courseSlug]: { ...(prev[courseSlug] || {}), submitting: false, result: r.data, error: '' },
      }))
      setMsg(r.data.passed ? '结课考试已通过，课程进度已更新' : '本次考试未通过，可以复习后重试')
    } catch (err) {
      setExamState(prev => ({
        ...prev,
        [courseSlug]: {
          ...(prev[courseSlug] || {}),
          submitting: false,
          error: err.response?.data?.error || '考试提交失败，请稍后重试',
        },
      }))
    }
  }

  return (
    <>
      <h1 className="page-title">婚恋课程</h1>
      <p className="page-sub">先阅读课程文本，再完成结课考试；通过后才计入课程资格</p>

      {error && (
        <div className="card" style={{color:'#B42318',fontSize:14,marginBottom:16}}>
          {error}
          <button className="btn btn-outline" style={{marginLeft:12}} onClick={loadCourses}>重试</button>
        </div>
      )}
      {msg && <div className="card" style={{fontSize:13,color:msg.includes('失败') || msg.includes('未通过') ? '#B42318' : '#17a34a',marginBottom:16}}>{msg}</div>}

      {loading && (
        <div className="card" style={{color:'var(--muted)',fontSize:14}}>课程加载中…</div>
      )}
      {!loading && list.length === 0 && !error && (
        <div className="card" style={{color:'var(--muted)',fontSize:14}}>
          暂无课程。稍后刷新页面，或联系管理员确认课程配置。
        </div>
      )}

      {list.map(c => (
        <CoursePanel
          key={c.slug}
          course={c}
          detail={progress[c.slug]}
          submitting={submitting}
          examState={examState[c.slug] || {}}
          onMarkRead={markRead}
          onLoadExam={loadExam}
          onSetExamAnswer={setExamAnswer}
          onSubmitExam={submitExam}
        />
      ))}
    </>
  )
}

function CoursePanel({ course, detail, submitting, examState, onMarkRead, onLoadExam, onSetExamAnswer, onSubmitExam }) {
  const attemptsByUnit = useMemo(() => new Map((detail?.attempts || []).map(item => [item.unit_index, item])), [detail])
  const units = detail?.units || []
  const progress = detail?.progress
  const latestExam = progress?.latest_exam
  const done = progress?.units_done || 0
  const total = units.length || 1
  const pct = Math.round((done / total) * 100)
  const examUnlocked = units.length > 0 && done >= units.length
  const answered = Object.keys(examState.answers || {}).length
  const examTotal = examState.questions?.length || 0

  return (
    <details className="card">
      <summary style={{cursor:'pointer',listStyle:'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
          <div>
            <h3 style={{fontFamily:'var(--font-serif)',fontSize:16}}>{course.title}</h3>
            <p style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{course.description}</p>
          </div>
          <span className={`badge ${progress?.state === 'completed' ? 'badge-green' : 'badge-yellow'}`} style={{whiteSpace:'nowrap',flex:'0 0 auto'}}>
            {statusText(progress, latestExam)}
          </span>
        </div>
        <div style={{background:'var(--border)',borderRadius:4,height:6,marginTop:12,marginBottom:8}}>
          <div style={{background:'var(--brand)',height:6,borderRadius:4,width:`${pct}%`,transition:'width 0.3s'}} />
        </div>
        <div style={{fontSize:12,color:'var(--muted)'}}>
          {done} / {units.length || 0} 单元已阅读（{pct}%）
        </div>
      </summary>

      <div style={{marginTop:16,display:'grid',gap:10}}>
        {units.map(u => {
          const att = attemptsByUnit.get(u.unit_index)
          const read = !!att?.passed
          const key = `${course.slug}-${u.unit_index}`
          return (
            <details key={u.id} style={{border:'1px solid var(--border)',borderRadius:8,background:read ? '#F0FAF4' : 'var(--bg)',padding:12}}>
              <summary style={{cursor:'pointer',listStyle:'none',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:600,color:read ? '#1A7A3C' : 'var(--fg)'}}>
                  {read ? '✓ ' : ''}{u.unit_index}. {u.title}
                </span>
                {u.is_pastor_node && <span className="badge badge-yellow" style={{whiteSpace:'nowrap',flex:'0 0 auto'}}>牧者节点</span>}
              </summary>
              <div style={{fontSize:14,lineHeight:1.8,color:'var(--fg)',whiteSpace:'pre-wrap',marginTop:12}}>
                {u.material || '本单元阅读材料正在整理中。'}
              </div>
              <button className="btn btn-outline" style={{fontSize:12,padding:'6px 12px',marginTop:12}}
                disabled={read || !!submitting[key]}
                onClick={() => onMarkRead(u.unit_index, course.slug)}>
                {read ? '已阅读' : submitting[key] ? '保存中…' : '我已阅读本单元'}
              </button>
            </details>
          )
        })}

        <div style={{border:'1px solid var(--border)',borderRadius:8,padding:14,background:'var(--bg)',marginTop:4}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>结课考试</div>
              <div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>
                {examUnlocked ? '全部单元阅读完成后，用考试确认你真的理解了课程。' : '读完全部单元后解锁考试。'}
              </div>
            </div>
            {latestExam && (
              <span className={`badge ${latestExam.passed ? 'badge-green' : 'badge-yellow'}`} style={{whiteSpace:'nowrap',flex:'0 0 auto'}}>
                {latestExam.passed ? `已通过 ${latestExam.score}` : `未通过 ${latestExam.score}`}
              </span>
            )}
          </div>

          {!examUnlocked && (
            <div style={{fontSize:13,color:'var(--muted)'}}>还需阅读 {Math.max(0, units.length - done)} 个单元。</div>
          )}

          {examUnlocked && !examState.questions && (
            <button className="btn btn-primary" onClick={() => onLoadExam(course.slug)} disabled={examState.loading}>
              {examState.loading ? '加载中…' : '开始结课考试'}
            </button>
          )}

          {examState.error && <div className="error-msg">{examState.error}</div>}

          {examState.questions && (
            <div style={{display:'grid',gap:12}}>
              <div style={{fontSize:13,color:'var(--muted)'}}>
                已作答 {answered} / {examTotal} 题，通过线 {examState.passThreshold} 题
              </div>
              {examState.questions.map((q, i) => (
                <div key={q.id} style={{borderTop:'1px solid var(--border)',paddingTop:12}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:8}}>{i + 1}. {q.q}</div>
                  {LETTERS.map(letter => (
                    <label key={letter} style={{display:'block',padding:'6px 0',fontSize:14,cursor:'pointer'}}>
                      <input type="radio" name={`${course.slug}-${q.id}`} style={{marginRight:8}}
                        checked={examState.answers?.[q.id] === letter}
                        onChange={() => onSetExamAnswer(course.slug, q.id, letter)} />
                      {letter}. {q.options[letter]}
                    </label>
                  ))}
                </div>
              ))}
              <button className="btn btn-primary" disabled={answered < examTotal || examState.submitting}
                onClick={() => onSubmitExam(course.slug)}>
                {examState.submitting ? '提交中…' : `提交考试（${answered}/${examTotal}）`}
              </button>
              {examState.result && (
                <div className={examState.result.passed ? 'success-msg' : 'error-msg'}>
                  {examState.result.passed
                    ? `考试通过：${examState.result.score}/${examState.result.total}`
                    : `考试未通过：${examState.result.score}/${examState.result.total}`}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{fontSize:13,color:'var(--muted)'}}>
          {course.is_match_gate_course
            ? '入池门槛：读完全部单元并通过考试后满足恋爱必修课资格'
            : <>完成奖励：+{course.reward_points || 0} 积分{course.reward_vip_days > 0 && <span> + {course.reward_vip_days} 天 VIP 体验</span>}</>}
        </div>
      </div>
    </details>
  )
}
