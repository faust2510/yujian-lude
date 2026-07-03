import { useEffect, useState } from 'react'
import { ai } from '../api/client'

export default function AiConsult() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadHistory = async () => {
    try {
      const r = await ai.history()
      setHistory(r.data.history || [])
    } catch {
      setHistory([])
    }
  }

  useEffect(() => { loadHistory() }, [])

  const ask = async (e) => {
    e.preventDefault()
    const text = question.trim()
    if (!text) return
    setLoading(true)
    setError('')
    setAnswer(null)
    try {
      const r = await ai.ask(text)
      setAnswer({ question: text, ...r.data })
      setQuestion('')
      await loadHistory()
    } catch (err) {
      setError(err.response?.data?.error || '咨询失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="page-title">AI 婚恋咨询</h1>
      <p className="page-sub">只回答课程、边界、沟通、信仰档案和关系确认相关问题；超范围问题会引导你找牧者或专业帮助。</p>

      <div className="ai-layout">
        <section className="card ai-main">
          <form onSubmit={ask}>
            <div className="field">
              <label>你的问题</label>
              <textarea
                rows={5}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="例如：刚认识时怎样设定聊天节奏和线下见面边界？"
              />
            </div>
            <button className="btn btn-primary" disabled={loading || !question.trim()}>
              {loading ? '思考中…' : '询问'}
            </button>
          </form>

          {error && <div className="error-msg">{error}</div>}

          {answer && (
            <div className={`ai-answer ${answer.outOfScope ? 'out' : ''}`}>
              <div className="ai-question">{answer.question}</div>
              <div className="ai-answer-body">{answer.answer}</div>
              {answer.sources?.length > 0 && (
                <div className="ai-sources">
                  {answer.sources.map((source, index) => (
                    <span key={`${source.id || source.source}-${index}`}>{source.source || source}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="card ai-side">
          <h3>可问范围</h3>
          <ul>
            <li>认识初期的边界与节奏</li>
            <li>信仰、家庭、财务和未来沟通</li>
            <li>关系红灯与停止升级</li>
            <li>引荐人、牧者和群体见证</li>
          </ul>
          <h3>最近记录</h3>
          {history.length === 0 && <p className="muted-small">暂无咨询记录</p>}
          {history.slice(0, 6).map((item, index) => (
            <div className="ai-history-item" key={`${item.created_at}-${index}`}>
              <div>{item.question}</div>
              <span>{item.out_of_scope ? '超范围' : '已回答'}</span>
            </div>
          ))}
        </aside>
      </div>
    </>
  )
}
