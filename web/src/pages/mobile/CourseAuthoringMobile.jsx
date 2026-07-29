import { XMobileDetailHeader } from '../../components/x-mobile/XMobileDetailHeader'
import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileFormRow } from '../../components/x-mobile/XMobileFormRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

const statusLabel = (value) => ({ draft: '草稿', pending_review: '待审核', changes_requested: '需修改', published: '已发布', archived: '已归档' })[value] || value || '未知'

export default function CourseAuthoringMobile({ courses = [], reviewQueue = [], selectedId, draft = { units: [], exam: { questions: [] } }, isAdmin = false, editable = false, busy = false, error = '', status = '', reviewNote = '', onReviewNoteChange, materialLicense = '', onMaterialLicenseChange, pendingMaterial = null, onUploadMaterial, onConfirmMaterial, onOpenCourse, onCloseCourse, onCreate, onDraftChange, onUpdateUnit, onUpdateQuestion, onUpdateOption, onAddUnit, onRemoveUnit, onAddQuestion, onRemoveQuestion, onSave, onSubmit, onReview }) {
  const selected = [...courses, ...reviewQueue].find((course) => course.id === selectedId)
  const publicationState = selected?.publication_state

  if (!selectedId) {
    return (
      <section className="x-mobile-list">
        {error ? <XMobileErrorRow message={error} /> : null}
        <div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-primary x-mobile-touch-target" disabled={busy} onClick={onCreate}>{busy ? '创建中…' : '新建课程'}</button></div>
        {busy ? <XMobileSkeleton lines={5} /> : null}
        {!busy && courses.length === 0 && reviewQueue.length === 0 ? <XMobileEmptyState title="暂无课程" /> : null}
        {courses.map((course) => <button type="button" className="x-mobile-list-row x-mobile-touch-target" disabled={busy} key={course.id} onClick={() => onOpenCourse?.(course.id)}><span><strong>{course.title || '未命名课程'}</strong><small>{statusLabel(course.publication_state)}</small></span></button>)}
        {isAdmin ? reviewQueue.map((course) => <button type="button" className="x-mobile-list-row x-mobile-touch-target" disabled={busy} key={`review-${course.id}`} onClick={() => onOpenCourse?.(course.id)}><span><strong>{course.title || '未命名课程'}</strong><small>{course.author_name || '牧者'} · 待审核</small></span></button>) : null}
      </section>
    )
  }

  return (
    <section className="x-mobile-authoring-editor">
      <XMobileDetailHeader title={selected?.title || draft.title || '课程编辑'} subtitle={statusLabel(publicationState)} onBack={onCloseCourse} />
      {error ? <XMobileErrorRow message={error} /> : null}
      {status && status !== publicationState ? <div className="x-mobile-success-row" role="status">{status}</div> : null}

      {isAdmin && !editable ? (
        <section>
          <div className="x-mobile-section-header"><h2>课程内容预览</h2><p>{draft.description || '暂无简介'}</p></div>
          {(draft.units || []).map((unit, index) => <details className="x-mobile-preview-unit" key={unit.id || index}><summary>第 {index + 1} 单元 · {unit.title || '未命名'}</summary><p>{unit.material || '暂无正文'}</p>{unit.is_pastor_node ? <small>需要牧者确认</small> : null}</details>)}
          {publicationState === 'pending_review' ? <><XMobileFormRow label="审核意见（退回时必填）" htmlFor="review-note"><textarea id="review-note" rows="4" value={reviewNote} onChange={(event) => onReviewNoteChange?.(event.target.value)} /></XMobileFormRow><div className="x-mobile-action-stack"><button type="button" disabled={busy} className="x-mobile-button-primary x-mobile-touch-target" onClick={() => onReview?.('publish')}>通过并发布</button><button type="button" disabled={busy} className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onReview?.('request_changes')}>退回修改</button><button type="button" disabled={busy} className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => onReview?.('archive')}>归档</button></div></> : <div className="x-mobile-status-panel"><p>该课程当前不在待审核状态。</p></div>}
        </section>
      ) : editable ? (
        <form onSubmit={(event) => event.preventDefault()}>
          <XMobileFormRow label="课程标题" htmlFor="course-title"><input id="course-title" value={draft.title || ''} onChange={(event) => onDraftChange?.('title', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="创作模板" htmlFor="course-template"><select id="course-template" value={draft.template_type || 'system_course'} onChange={(event) => onDraftChange?.('template_type', event.target.value)}><option value="system_course">系统课程</option><option value="reading_guide">书籍 / 读书导引</option><option value="short_lesson">专题短课</option></select></XMobileFormRow>
          <XMobileFormRow label="经文依据" htmlFor="course-scripture"><input id="course-scripture" value={draft.scripture_references || ''} onChange={(event) => onDraftChange?.('scripture_references', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="副标题" htmlFor="course-subtitle"><input id="course-subtitle" value={draft.subtitle || ''} onChange={(event) => onDraftChange?.('subtitle', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="封面图片地址" htmlFor="course-cover"><input id="course-cover" inputMode="url" value={draft.cover_image || ''} onChange={(event) => onDraftChange?.('cover_image', event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="教材版权或授权说明" htmlFor="material-license"><input id="material-license" value={materialLicense} onChange={(event) => onMaterialLicenseChange?.(event.target.value)} /></XMobileFormRow>
          <XMobileFormRow label="上传已授权教材（PDF / EPUB）" htmlFor="course-material"><input id="course-material" type="file" accept="application/pdf,application/epub+zip" disabled={busy} onChange={(event) => onUploadMaterial?.(event.target.files?.[0])} /></XMobileFormRow>
          {pendingMaterial ? <section className="x-mobile-status-panel"><strong>待确认教材：{pendingMaterial.original_name}</strong><p>请核对提取结果；未确认前，教材不会被发布或作为 AI 依据。</p><pre>{pendingMaterial.preview || '未能生成预览'}</pre><button type="button" disabled={busy} className="x-mobile-button-primary x-mobile-touch-target" onClick={onConfirmMaterial}>确认并纳入课程</button></section> : null}
          <XMobileFormRow label="课程简介" htmlFor="course-description"><textarea id="course-description" rows="4" value={draft.description || ''} onChange={(event) => onDraftChange?.('description', event.target.value)} /></XMobileFormRow>
          <div className="x-mobile-section-header"><h2>课程单元</h2></div>
          {(draft.units || []).map((unit, index) => <section className="x-mobile-editor-block" key={unit.id || index}><div className="x-mobile-editor-block-head"><strong>第 {index + 1} 单元</strong><button type="button" className="x-mobile-touch-target" disabled={busy} onClick={() => onRemoveUnit?.(index)}>删除</button></div><XMobileFormRow label="单元标题" htmlFor={`unit-${index}-title`}><input id={`unit-${index}-title`} value={unit.title || ''} onChange={(event) => onUpdateUnit?.(index, 'title', event.target.value)} /></XMobileFormRow><XMobileFormRow label="阅读正文" htmlFor={`unit-${index}-material`}><textarea id={`unit-${index}-material`} rows="7" value={unit.material || ''} onChange={(event) => onUpdateUnit?.(index, 'material', event.target.value)} /></XMobileFormRow><label className="x-mobile-check-row x-mobile-touch-target"><input type="checkbox" checked={Boolean(unit.is_pastor_node)} onChange={(event) => onUpdateUnit?.(index, 'is_pastor_node', event.target.checked)} /><span>需要牧者确认</span></label></section>)}
          <div className="x-mobile-action-stack"><button type="button" disabled={busy} className="x-mobile-button-secondary x-mobile-touch-target" onClick={onAddUnit}>添加单元</button></div>
          <div className="x-mobile-section-header"><h2>结课考试</h2></div>
          <XMobileFormRow label="通过比例（百分制）" htmlFor="exam-threshold"><input id="exam-threshold" type="number" min="1" max="100" value={draft.exam?.pass_threshold ?? 80} onChange={(event) => onDraftChange?.('exam', { ...draft.exam, pass_threshold: Number(event.target.value) })} /></XMobileFormRow>
          {(draft.exam?.questions || []).map((question, index) => <section className="x-mobile-editor-block" key={question.id || index}><div className="x-mobile-editor-block-head"><strong>第 {index + 1} 题</strong><button type="button" className="x-mobile-touch-target" disabled={busy} onClick={() => onRemoveQuestion?.(index)}>删除</button></div><XMobileFormRow label="题目" htmlFor={`question-${index}`}><textarea id={`question-${index}`} rows="3" value={question.prompt || ''} onChange={(event) => onUpdateQuestion?.(index, 'prompt', event.target.value)} /></XMobileFormRow>{(question.options || []).map((option, optionIndex) => <label className="x-mobile-choice-row x-mobile-touch-target" key={optionIndex}><input type="radio" name={`correct-${index}`} checked={question.correct_option === optionIndex} onChange={() => onUpdateQuestion?.(index, 'correct_option', optionIndex)} /><input value={option} aria-label={`第 ${index + 1} 题选项 ${optionIndex + 1}`} onChange={(event) => onUpdateOption?.(index, optionIndex, event.target.value)} /></label>)}<XMobileFormRow label="答案说明" htmlFor={`question-${index}-explanation`}><textarea id={`question-${index}-explanation`} rows="3" value={question.explanation || ''} onChange={(event) => onUpdateQuestion?.(index, 'explanation', event.target.value)} /></XMobileFormRow></section>)}
          <div className="x-mobile-action-stack"><button type="button" disabled={busy} className="x-mobile-button-secondary x-mobile-touch-target" onClick={onAddQuestion}>添加题目</button><button type="button" disabled={busy} className="x-mobile-button-secondary x-mobile-touch-target" onClick={onSave}>保存草稿</button><button type="button" disabled={busy} className="x-mobile-button-primary x-mobile-touch-target" onClick={onSubmit}>提交审核</button></div>
        </form>
      ) : <div className="x-mobile-status-panel"><p>当前状态：{statusLabel(publicationState)}。审核意见：{selected?.review_note || '暂无'}</p></div>}
    </section>
  )
}
