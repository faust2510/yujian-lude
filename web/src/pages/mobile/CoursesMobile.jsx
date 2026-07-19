import { useState } from 'react'
import { Link } from 'react-router-dom'
import { XMobileDetailHeader } from '../../components/x-mobile/XMobileDetailHeader'
import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

const LETTERS = ['A', 'B', 'C', 'D']

export default function CoursesMobile({ courses = [], progress = {}, submitting = {}, examState = {}, loading = false, error = '', message = '', onRetry, onMarkRead, onLoadExam, onSetExamAnswer, onSubmitExam }) {
  const [selectedSlug, setSelectedSlug] = useState(null)
  const selected = courses.find((course) => course.slug === selectedSlug)
  if (loading) return <XMobileSkeleton lines={8} />
  if (!selected) return <section className="x-mobile-list">{error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}{courses.length === 0 && !error ? <XMobileEmptyState title="暂无课程" description="课程发布后会出现在这里。" /> : courses.map((course) => { const detail = progress[course.slug]; const done = detail?.progress?.units_done || 0; return <button type="button" className="x-mobile-list-row x-mobile-touch-target" key={course.slug} onClick={() => setSelectedSlug(course.slug)}><span><strong>{course.title}</strong><small>{course.description}</small></span><span className="x-mobile-row-meta">{done}/{detail?.units?.length || 0}</span></button> })}</section>
  const detail = progress[selected.slug]
  const units = detail?.units || []
  const attempts = new Map((detail?.attempts || []).map((item) => [item.unit_index, item]))
  const done = detail?.progress?.units_done || 0
  const exam = examState[selected.slug] || {}
  const examUnlocked = units.length > 0 && done >= units.length
  const answered = Object.keys(exam.answers || {}).length
  return (
    <section className="x-mobile-course-detail">
      <XMobileDetailHeader title={selected.title} subtitle={`${done}/${units.length} 单元已阅读`} onBack={() => setSelectedSlug(null)} />
      {message ? <div className="x-mobile-status-row">{message}</div> : null}
      {units.map((unit) => { const read = Boolean(attempts.get(unit.unit_index)?.passed); const missing = (unit.readings || []).filter((item) => item.required && !item.completed); const key = `${selected.slug}-${unit.unit_index}`; return <article className="x-mobile-course-unit" key={unit.id}><h3>{read ? '✓ ' : ''}{unit.unit_index}. {unit.title}</h3>{(unit.readings || []).map((reading) => <Link className="x-mobile-list-link x-mobile-touch-target" to={`/textbooks/${reading.textbook_slug}/chapters/${reading.chapter_index}?returnTo=${encodeURIComponent('/courses')}`} key={`${reading.textbook_slug}-${reading.chapter_index}`}>{reading.chapter_title}{reading.required ? ' · 必读' : ''}</Link>)}<div className="x-mobile-course-material">{unit.material}</div>{missing.length ? <p className="x-mobile-form-error">请先读完本单元绑定教材章节</p> : null}<button type="button" className="x-mobile-button-secondary x-mobile-touch-target" disabled={read || missing.length > 0 || submitting[key]} onClick={() => onMarkRead?.(unit.unit_index, selected.slug)}>{read ? '已阅读' : submitting[key] ? '保存中…' : '我已阅读本单元'}</button></article> })}
      <section className="x-mobile-exam-section"><h2>结课考试</h2>{!examUnlocked ? <p>还需阅读 {Math.max(0, units.length - done)} 个单元。</p> : null}{examUnlocked && !exam.questions ? <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => onLoadExam?.(selected.slug)} disabled={exam.loading}>{exam.loading ? '加载中…' : '开始结课考试'}</button> : null}{exam.error ? <XMobileErrorRow message={exam.error} onRetry={() => onLoadExam?.(selected.slug)} /> : null}{exam.questions?.map((question, index) => <fieldset className="x-mobile-question-row" key={question.id}><legend>{index + 1}. {question.q}</legend>{LETTERS.map((letter) => <label className="x-mobile-choice-row x-mobile-touch-target" key={letter}><input type="radio" name={`${selected.slug}-${question.id}`} checked={exam.answers?.[question.id] === letter} onChange={() => onSetExamAnswer?.(selected.slug, question.id, letter)} /><span>{letter}. {question.options[letter]}</span></label>)}</fieldset>)}{exam.questions ? <button type="button" className="x-mobile-submit-button x-mobile-touch-target" disabled={answered < exam.questions.length || exam.submitting} onClick={() => onSubmitExam?.(selected.slug)}>{exam.submitting ? '提交中…' : `提交考试（${answered}/${exam.questions.length}）`}</button> : null}</section>
    </section>
  )
}
