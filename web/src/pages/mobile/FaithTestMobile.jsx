import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

const LETTERS = ['A', 'B', 'C', 'D']

export default function FaithTestMobile({ status, questions, answers = {}, result, loading = false, starting = false, submitting = false, error = '', total = 20, answered = 0, onRetry, onStart, onAnswer, onSubmit }) {
  if (loading) return <XMobileSkeleton lines={5} />
  return (
    <section className="x-mobile-settings-page">
      {error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}
      {!questions && !result ? (
        <div className="x-mobile-status-panel">
          <h2>{status?.latest?.passed ? '信仰测试已通过' : status?.attempted ? '可以重新测试' : '完成信仰基础测试'}</h2>
          <p>{status?.latest?.passed ? `上次得分 ${status.latest.score}/20，可以进入匹配池。` : '完成 20 道基要真理单选题，答对 15 题及以上通过。'}</p>
          {!status?.latest?.passed ? <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onStart} disabled={starting}>{starting ? '加载中…' : status?.attempted ? '重新测试' : '开始测试'}</button> : null}
        </div>
      ) : null}
      {questions && !result ? (
        <>
          <div className="x-mobile-progress-row">已作答 {answered} / {total} 题</div>
          {questions.map((question, index) => (
            <fieldset className="x-mobile-question-row" key={question.id}>
              <legend>{index + 1}. {question.q}</legend>
              {Object.entries(question.options).map(([letter, text]) => (
                <label className="x-mobile-choice-row x-mobile-touch-target" key={letter}>
                  <input type="radio" name={`q${question.id}`} checked={answers[question.id] === LETTERS.indexOf(letter)} onChange={() => onAnswer(question.id, LETTERS.indexOf(letter))} />
                  <span>{letter}. {text}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button type="button" className="x-mobile-submit-button x-mobile-touch-target" disabled={answered < total || submitting} onClick={onSubmit}>{submitting ? '提交中…' : `提交测试（${answered}/${total}）`}</button>
        </>
      ) : null}
      {result ? <XMobileEmptyState title={result.passed ? '测试通过' : '测试未通过'} description={`得分：${result.score} / 20。${result.message || ''}`} /> : null}
    </section>
  )
}
