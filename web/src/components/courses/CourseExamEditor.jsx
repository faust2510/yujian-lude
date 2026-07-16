import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  addCollectionItem,
  addQuestionOption,
  createExamQuestion,
  moveCollectionItem,
  removeCollectionItem,
  removeQuestionOption,
  setCorrectOption,
} from './CourseEditorCollections.js'

function FieldError({ id, error }) {
  if (!error) return null
  const message = Array.isArray(error) ? error.join('；') : error
  return <p id={id} role="alert" className="break-words text-sm text-destructive">{message}</p>
}

export default function CourseExamEditor({
  exam,
  onChange,
  readonly = false,
  errors = {},
}) {
  const questions = exam.questions ?? []

  const updateQuestions = (nextQuestions) => {
    onChange({ ...exam, questions: nextQuestions })
  }

  const updateQuestion = (index, nextQuestion) => {
    updateQuestions(questions.map((question, questionIndex) => (
      questionIndex === index ? nextQuestion : question
    )))
  }

  const updateOption = (questionIndex, optionIndex, option) => {
    const question = questions[questionIndex]
    const options = question.options.map((current, index) => (index === optionIndex ? option : current))
    updateQuestion(questionIndex, { ...question, options })
  }

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-labelledby="course-exam-heading">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="course-exam-heading" className="break-words text-lg font-semibold">结课考试</h2>
          <p className="break-words text-sm text-muted-foreground">设置 3–50 道单选题，每题保留一个正确答案。</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-44">
          <label htmlFor="course-exam-threshold" className="text-sm font-medium">通过分数</label>
          <Input
            id="course-exam-threshold"
            type="number"
            min={1}
            max={100}
            value={exam.pass_threshold ?? 80}
            disabled={readonly}
            aria-invalid={Boolean(errors.pass_threshold)}
            aria-describedby={errors.pass_threshold ? 'course-exam-threshold-error' : undefined}
            onChange={(event) => onChange({ ...exam, pass_threshold: Number(event.target.value) })}
          />
          <FieldError id="course-exam-threshold-error" error={errors.pass_threshold} />
        </div>
      </div>

      <div className="min-w-0">
        {questions.map((question, questionIndex) => {
          const questionKey = question.id ?? question.question_index ?? questionIndex
          const questionErrors = errors.questions?.[questionIndex] ?? {}
          const prefix = `course-question-${questionKey}`

          return (
            <section key={questionKey} className="flex min-w-0 flex-col gap-4 border-b border-border py-5 first:pt-0 last:border-b-0">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words text-base font-semibold">第 {questionIndex + 1} 题</h3>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="上移题目"
                    title="上移题目"
                    disabled={readonly || questionIndex === 0}
                    onClick={() => updateQuestions(moveCollectionItem(questions, questionIndex, -1, 'question_index'))}
                  >
                    <ChevronUp data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="下移题目"
                    title="下移题目"
                    disabled={readonly || questionIndex === questions.length - 1}
                    onClick={() => updateQuestions(moveCollectionItem(questions, questionIndex, 1, 'question_index'))}
                  >
                    <ChevronDown data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label="删除题目"
                    title="删除题目"
                    disabled={readonly}
                    onClick={() => updateQuestions(removeCollectionItem(questions, questionIndex, 'question_index'))}
                  >
                    <Trash2 data-icon="inline-start" />
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor={`${prefix}-prompt`} className="text-sm font-medium">题目</label>
                <textarea
                  id={`${prefix}-prompt`}
                  value={question.prompt ?? ''}
                  rows={3}
                  disabled={readonly}
                  aria-invalid={Boolean(questionErrors.prompt)}
                  aria-describedby={questionErrors.prompt ? `${prefix}-prompt-error` : undefined}
                  className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
                  onChange={(event) => updateQuestion(questionIndex, { ...question, prompt: event.target.value })}
                />
                <FieldError id={`${prefix}-prompt-error`} error={questionErrors.prompt} />
              </div>

              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="text-sm font-medium">选项与正确答案</legend>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name={`question-${questionKey}-correct`}
                      checked={question.correct_option === optionIndex}
                      disabled={readonly}
                      aria-label={`将选项 ${optionIndex + 1} 设为正确答案`}
                      className="size-4 shrink-0 accent-primary"
                      onChange={() => updateQuestion(questionIndex, setCorrectOption(question, optionIndex))}
                    />
                    <Input
                      value={option}
                      disabled={readonly}
                      aria-label={`选项 ${optionIndex + 1}`}
                      aria-invalid={Boolean(questionErrors.options?.[optionIndex])}
                      className="min-w-0 flex-1"
                      onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除选项 ${optionIndex + 1}`}
                      title="删除选项"
                      disabled={readonly || question.options.length <= 2}
                      onClick={() => updateQuestion(questionIndex, removeQuestionOption(question, optionIndex))}
                    >
                      <Trash2 data-icon="inline-start" />
                    </Button>
                  </div>
                ))}
                <FieldError id={`${prefix}-options-error`} error={questionErrors.options_message} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={readonly || question.options.length >= 6}
                  onClick={() => updateQuestion(questionIndex, addQuestionOption(question))}
                >
                  <Plus data-icon="inline-start" />
                  添加选项
                </Button>
              </fieldset>

              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor={`${prefix}-explanation`} className="text-sm font-medium">答案解析（选填）</label>
                <textarea
                  id={`${prefix}-explanation`}
                  value={question.explanation ?? ''}
                  rows={2}
                  disabled={readonly}
                  className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(event) => updateQuestion(questionIndex, { ...question, explanation: event.target.value })}
                />
              </div>
            </section>
          )
        })}
      </div>

      {!readonly && (
        <Button
          type="button"
          variant="outline"
          disabled={questions.length >= 50}
          onClick={() => updateQuestions(addCollectionItem(questions, createExamQuestion(), 'question_index'))}
        >
          <Plus data-icon="inline-start" />
          添加题目
        </Button>
      )}
      <FieldError id="course-exam-questions-error" error={errors.questions_message} />
    </section>
  )
}
