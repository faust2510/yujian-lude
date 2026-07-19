import { useCallback, useEffect, useState } from 'react'
import { ai } from '../api/client'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import useMobileViewport from '../hooks/useMobileViewport'
import AiConsultMobile from './mobile/AiConsultMobile'

const safeGuidancePrompts = [
  '刚认识时怎样设定聊天节奏和线下见面边界？',
  '进入关系前，哪些信仰和家庭议题必须先谈清楚？',
  '发现对方沟通中有红灯时，我该如何暂停升级关系？',
]

const consultationBoundaries = [
  '婚恋课程、边界、沟通节奏',
  '信仰档案、引荐人与牧者见证',
  '关系确认流程与升级前检查',
  '不替代牧者辅导、法律、医疗或危机干预',
]

const escalationGuidance = [
  '涉及安全威胁、胁迫或自伤风险，先联系现实中的可信帮助。',
  '涉及法律、医疗、心理诊断，请找对应专业人士。',
  '关系要升级前，优先让引荐人和牧者进入见证。',
]

export default function AiConsult() {
  const isDesktopViewport = useDesktopViewport()
  const isMobile = useMobileViewport()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(async () => {
    setHistoryError('')
    try {
      const r = await ai.history()
      setHistory(r.data.history || [])
    } catch (err) {
      setHistory([])
      if (isDesktopViewport) setHistoryError(err.response?.data?.error || '咨询记录加载失败，请重试')
    }
  }, [isDesktopViewport])

  useEffect(() => { loadHistory() }, [loadHistory])

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

  const selectPrompt = (prompt) => {
    setQuestion(prompt)
    setAnswer(null)
    setError('')
  }

  const renderSource = (source) => {
    if (typeof source === 'string') return source
    return source.source || source.id || '平台知识库'
  }

  if (isMobile) {
    return <AiConsultMobile question={question} history={history} answer={answer} loading={loading} error={error} boundaries={consultationBoundaries} escalation={escalationGuidance} prompts={safeGuidancePrompts} renderSource={renderSource} onQuestionChange={setQuestion} onAsk={ask} onSelectPrompt={selectPrompt} />
  }

  return (
    <div className="figma-core-screen figma-ai-workbench figma-desktop-ai-section ai-page">
      <div className="ai-header-row">
        <div>
          <div className="ai-kicker">遇见路得咨询台</div>
          <h2>有边界的辅助建议</h2>
          <p>围绕课程、边界、沟通、信仰档案和关系确认给出可执行建议。</p>
        </div>
        <span className="ai-scope-badge">有边界的辅助建议</span>
      </div>

      <div className="ai-layout">
        <section className="ai-main">
          <form className="ai-composer" onSubmit={ask}>
            <div className="field">
              <label>你现在想辨别什么？</label>
              <textarea
                rows={6}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="可以直接描述你们当前的阶段、困惑和你担心越界的地方。"
              />
            </div>
            <div className="ai-prompt-row" aria-label="常用问题">
              {safeGuidancePrompts.map((prompt) => (
                <button
                  className="ai-prompt-chip"
                  key={prompt}
                  type="button"
                  onClick={() => selectPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="ai-submit-row">
              <p>答案会引用平台课程和流程规则；超范围问题会被明确拦住。</p>
              <button className="btn btn-primary" disabled={loading || !question.trim()}>
                {loading ? '整理建议中…' : '询问'}
              </button>
            </div>
          </form>

          {error && <div className="error-msg">{error}</div>}

          {loading && (
            <div className="ai-answer ai-answer-loading" aria-live="polite">
              <div className="ai-answer-label">正在整理</div>
              <div className="ai-answer-body">我会先判断问题是否在平台咨询范围内，再给出边界清楚的建议。</div>
            </div>
          )}

          {answer && (
            <div className={`ai-answer ${answer.outOfScope ? 'out' : ''}`}>
              <div className="ai-answer-label">{answer.outOfScope ? '超出咨询范围' : '建议答复'}</div>
              <div className="ai-question">{answer.question}</div>
              <div className="ai-answer-body">{answer.answer}</div>
              {answer.sources?.length > 0 && (
                <div className="ai-sources" aria-label="参考依据">
                  <span className="ai-source-title">参考依据</span>
                  {answer.sources.map((source, index) => (
                    <span key={`${renderSource(source)}-${index}`}>{renderSource(source)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !answer && !error && (
            <div className="ai-empty-state">
              <strong>适合问具体场景。</strong>
              <span>比如“聊了两周是否该见面”“如何谈财务期待”“是否该暂停关系升级”。</span>
            </div>
          )}
        </section>

        <aside className="ai-side">
          <section className="ai-boundary-panel">
            <h2>咨询边界</h2>
            <ul>
              {consultationBoundaries.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="ai-history-panel">
            <div className="ai-panel-head">
              <h2>最近咨询</h2>
              <span>{history.length}</span>
            </div>
            {isDesktopViewport && historyError && (
              <div className="ai-history-error" role="alert">
                <span>{historyError}</span>
                <button className="btn btn-outline" type="button" onClick={loadHistory}>重试</button>
              </div>
            )}
            {(!isDesktopViewport || !historyError) && history.length === 0 && <p className="muted-small">暂无咨询记录</p>}
            {history.slice(0, 6).map((item, index) => (
              <button
                className="ai-history-item"
                key={`${item.created_at}-${index}`}
                type="button"
                onClick={() => selectPrompt(item.question)}
              >
                <span>{item.out_of_scope ? '超范围' : '已回答'}</span>
                <div>{item.question}</div>
              </button>
            ))}
          </section>

          <section className="ai-escalation">
            <h2>需要真人介入时</h2>
            {escalationGuidance.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
