import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'

export default function AiConsultMobile({ question, history = [], answer, loading = false, error = '', boundaries = [], escalation = [], prompts = [], renderSource = (source) => String(source), onQuestionChange, onAsk, onSelectPrompt }) {
  return (
    <section className="x-mobile-ai-page">
      <div className="x-mobile-ai-stream">
        {answer ? <article className="x-mobile-ai-answer"><strong>{answer.outOfScope ? '超出咨询范围' : '建议答复'}</strong><p className="x-mobile-muted">{answer.question}</p><p>{answer.answer}</p>{answer.sources?.length ? <div className="x-mobile-ai-sources"><strong>参考依据</strong>{answer.sources.map((source, index) => <span key={`${renderSource(source)}-${index}`}>{renderSource(source)}</span>)}</div> : null}</article> : !loading && !error ? <XMobileEmptyState title="适合问具体场景" description="描述当前阶段、困惑和担心越界的地方。" /> : null}
        {loading ? <div className="x-mobile-ai-answer" aria-live="polite">正在整理有边界的建议…</div> : null}
        {error ? <XMobileErrorRow message={error} /> : null}
        <section className="x-mobile-info-list"><h2>咨询边界</h2>{boundaries.map((item) => <p key={item}>{item}</p>)}</section>
        <section className="x-mobile-info-list"><h2>最近咨询</h2>{history.length === 0 ? <p>暂无咨询记录</p> : history.slice(0, 6).map((item, index) => <button type="button" className="x-mobile-list-row x-mobile-touch-target" key={`${item.created_at}-${index}`} onClick={() => onSelectPrompt?.(item.question)}>{item.question}</button>)}</section>
        <section className="x-mobile-info-list"><h2>需要真人介入时</h2>{escalation.map((item) => <p key={item}>{item}</p>)}</section>
      </div>
      <form className="x-mobile-ai-composer" onSubmit={onAsk}><div className="x-mobile-prompt-row">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onSelectPrompt?.(prompt)}>{prompt}</button>)}</div><label className="x-mobile-sr-only" htmlFor="ai-question">你现在想辨别什么</label><textarea id="ai-question" rows="3" value={question} onChange={(event) => onQuestionChange?.(event.target.value)} placeholder="描述你的问题…" /><button type="submit" className="x-mobile-button-primary x-mobile-touch-target" disabled={loading || !question.trim()}>询问</button></form>
    </section>
  )
}
