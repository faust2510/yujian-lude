import { useCallback, useEffect, useState } from 'react'
import { faithTest } from '../api/client'

const LETTERS = ['A', 'B', 'C', 'D']

export default function FaithTest() {
  const [status, setStatus] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await faithTest.status()
      setStatus(r.data ?? {})
    } catch (err) {
      setStatus(null)
      setError(err.response?.data?.error || '测试状态加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      const r = await faithTest.questions()
      setQuestions(r.data.questions || [])
      setAnswers({})
      setResult(null)
    } catch (err) {
      setError(err.response?.data?.error || '题目加载失败，请稍后重试')
    } finally {
      setStarting(false)
    }
  }

  const submit = async () => {
    if (!questions || submitting) return
    // backend grade() expects [{id, a: 'A'|'B'|'C'|'D'}]
    const arr = questions.map(q => ({ id: q.id, a: LETTERS[answers[q.id]] }))
    setSubmitting(true)
    setError('')
    try {
      const r = await faithTest.submit(arr)
      setResult(r.data)
      setStatus(s => ({ ...s, attempted: true, latest: { passed: r.data.passed, score: r.data.score } }))
    } catch (err) {
      setError(err.response?.data?.error || '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const latest = status?.latest
  const answered = questions ? Object.keys(answers).length : 0
  const total = questions?.length || 20

  return (
    <>
      <h1 className="page-title">信仰基础测试</h1>
      <p className="page-sub">使徒信经 + 尼西亚信经基本范围，答对 15 题及以上通过</p>

      {loading && <div className="card" style={{fontSize:14,color:'var(--muted)'}}>正在加载测试状态…</div>}

      {error && (
        <div className="card" style={{marginBottom:16}}>
          <div className="error-msg" style={{marginTop:0}}>{error}</div>
          {!questions && (
            <button className="btn btn-outline" style={{marginTop:12}} onClick={status ? start : loadStatus}>
              重试
            </button>
          )}
        </div>
      )}

      {!loading && status && !questions && (
        <div className="card">
          {latest?.passed ? (
            <>
              <span className="badge badge-green">已通过</span>
              <p style={{ marginTop: 12, fontSize: 14 }}>你已通过信仰测试（{latest.score}/20），可以进入匹配池。</p>
            </>
          ) : status.attempted ? (
            <>
              <span className="badge badge-yellow">未通过</span>
              <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
                上次得分 {latest?.score}/20。建议回到教会与牧者一起温习基要真理后重考。
              </p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={start} disabled={starting}>
                {starting ? '加载中…' : '重新测试'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 16 }}>完成 20 道基要真理单选题，通过后才能进入匹配池。</p>
              <button className="btn btn-primary" onClick={start} disabled={starting}>
                {starting ? '加载中…' : '开始测试'}
              </button>
            </>
          )}
        </div>
      )}

      {questions && !result && (
        <>
          <div className="gate-banner">已作答 {answered} / {total} 题，全部作答后可提交</div>
          {questions.map((q, i) => (
            <div className="card" key={q.id}>
              <div style={{ fontWeight: 500, marginBottom: 12, fontSize: 14 }}>{i + 1}. {q.q}</div>
              {Object.entries(q.options).map(([letter, text]) => (
                <label key={letter} style={{ display: 'block', padding: '8px 0', fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" name={`q${q.id}`} style={{ marginRight: 8 }}
                    checked={answers[q.id] === LETTERS.indexOf(letter)}
                    onChange={() => setAnswers(a => ({ ...a, [q.id]: LETTERS.indexOf(letter) }))} />
                  {letter}. {text}
                </label>
              ))}
            </div>
          ))}
          <button className="btn btn-primary" disabled={answered < total || submitting} onClick={submit}
            style={{ marginTop: 16 }}>
            {submitting ? '提交中…' : `提交测试（${answered}/${total}）`}
          </button>
        </>
      )}

      {result && (
        <div className="card">
          <span className={`badge ${result.passed ? 'badge-green' : 'badge-yellow'}`}>
            {result.passed ? '通过' : '未通过'}
          </span>
          <p style={{ marginTop: 12, fontSize: 16 }}>得分：{result.score} / 20</p>
          <p style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)' }}>{result.message}</p>
          {!result.passed && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={start} disabled={starting}>
              {starting ? '加载中…' : '重新测试'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
