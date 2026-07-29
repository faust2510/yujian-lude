import { useCallback, useEffect, useMemo, useState } from 'react'
import { courseAuthoring } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import useMobileViewport from '../hooks/useMobileViewport'
import CourseAuthoringMobile from './mobile/CourseAuthoringMobile'

const emptyQuestion = () => ({ prompt: '', options: ['', ''], correct_option: 0, explanation: '' })
const emptyDraft = () => ({
  title: '',
  subtitle: '',
  description: '',
  cover_image: '',
  template_type: 'system_course',
  scripture_references: '',
  ai_eligible: true,
  units: [{ title: '', material: '', is_pastor_node: false }],
  exam: { pass_threshold: 80, questions: [emptyQuestion(), emptyQuestion(), emptyQuestion()] },
})

function messageFrom(error, fallback) {
  return error?.response?.data?.error || fallback
}

function statusText(status) {
  return ({ draft: '草稿', pending_review: '待审核', changes_requested: '需修改', published: '已发布', archived: '已归档' })[status] || status || '未知'
}

function normalizeDraft(course) {
  const source = course || emptyDraft()
  return {
    title: source.title || '',
    subtitle: source.subtitle || '',
    description: source.description || '',
    cover_image: source.cover_image || '',
    template_type: source.template_type || 'system_course',
    scripture_references: source.scripture_references || '',
    ai_eligible: source.ai_eligible !== false,
    units: (source.units || []).map(unit => ({ ...unit, title: unit.title || '', material: unit.material || '' })),
    exam: {
      pass_threshold: source.exam?.pass_threshold ?? 80,
      questions: (source.exam?.questions || []).map(question => ({
        ...question,
        prompt: question.prompt || '',
        options: question.options || ['', ''],
        explanation: question.explanation || '',
      })),
    },
  }
}

export default function CourseAuthoring() {
  const { user } = useAuth()
  const isMobile = useMobileViewport()
  const isAdmin = user?.role === 'admin'
  const canReview = ['admin', 'pastor'].includes(user?.role)
  const [courses, setCourses] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [materialLicense, setMaterialLicense] = useState('')
  const [pendingMaterial, setPendingMaterial] = useState(null)

  const selected = useMemo(() => courses.find(course => course.id === selectedId), [courses, selectedId])

  const load = useCallback(async () => {
    setError('')
    try {
      const mine = await courseAuthoring.mine()
      setCourses(mine.data.courses || [])
      if (canReview) {
        const queue = await courseAuthoring.reviewQueue()
        setReviewQueue(queue.data.courses || [])
      }
    } catch (err) {
      setError(messageFrom(err, '课程工作台加载失败'))
    }
  }, [canReview])

  useEffect(() => { load() }, [load])

  const openCourse = async (id) => {
    setBusy(true)
    setError('')
    try {
      const response = await courseAuthoring.detail(id)
      setSelectedId(id)
      setDraft(normalizeDraft(response.data.course))
      setStatus(response.data.course.publication_state)
      setReviewNote(response.data.course.review_note || '')
      setPendingMaterial(null)
    } catch (err) {
      setError(messageFrom(err, '课程内容加载失败'))
    } finally {
      setBusy(false)
    }
  }

  const createCourse = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await courseAuthoring.create(emptyDraft())
      await load()
      await openCourse(response.data.course.id)
    } catch (err) {
      setError(messageFrom(err, '创建课程失败'))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!selectedId) return
    setBusy(true)
    setError('')
    try {
      const response = await courseAuthoring.save(selectedId, draft)
      setDraft(normalizeDraft(response.data.course))
      setStatus('草稿已保存')
      await load()
    } catch (err) {
      setError(messageFrom(err, '保存失败'))
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!selectedId) return
    setBusy(true)
    setError('')
    try {
      await courseAuthoring.save(selectedId, draft)
      await courseAuthoring.submit(selectedId)
      setStatus('已提交审核')
      await openCourse(selectedId)
      await load()
    } catch (err) {
      setError(err?.response?.data?.fields ? '课程内容未完成，请按字段提示补齐' : messageFrom(err, '提交审核失败'))
    } finally {
      setBusy(false)
    }
  }

  const review = async (action) => {
    if (!selectedId) return
    if (action === 'request_changes' && !reviewNote.trim()) return setError('退回修改时请填写审核意见')
    setBusy(true)
    try {
      await courseAuthoring.review(selectedId, action, reviewNote)
      setStatus(action === 'publish' ? '已发布' : action === 'request_changes' ? '需修改' : '已归档')
      await load()
      await openCourse(selectedId)
    } catch (err) {
      setError(messageFrom(err, '审核操作失败'))
    } finally {
      setBusy(false)
    }
  }

  const uploadMaterial = async (file) => {
    if (!file || !selectedId) return
    if (!materialLicense.trim()) return setError('上传教材前请填写版权或授权说明')
    setBusy(true)
    try {
      const response = await courseAuthoring.uploadMaterial(selectedId, file, materialLicense.trim())
      setPendingMaterial({ ...response.data.material, preview: response.data.preview })
      setStatus('教材文字已提取，请核对提取结果后再确认。')
    } catch (err) { setError(messageFrom(err, '教材上传失败')) }
    finally { setBusy(false) }
  }

  const confirmMaterial = async () => {
    if (!selectedId || !pendingMaterial) return
    setBusy(true)
    setError('')
    try {
      await courseAuthoring.confirmMaterial(selectedId, pendingMaterial.id)
      setPendingMaterial(null)
      setStatus('教材已确认，可继续编辑课程单元后提交审核。')
    } catch (err) { setError(messageFrom(err, '教材确认失败')) }
    finally { setBusy(false) }
  }

  const updateUnit = (index, key, value) => setDraft(prev => ({
    ...prev,
    units: prev.units.map((unit, current) => current === index ? { ...unit, [key]: value } : unit),
  }))

  const updateQuestion = (index, key, value) => setDraft(prev => ({
    ...prev,
    exam: { ...prev.exam, questions: prev.exam.questions.map((question, current) => current === index ? { ...question, [key]: value } : question) },
  }))

  const updateOption = (questionIndex, optionIndex, value) => setDraft(prev => ({
    ...prev,
    exam: { ...prev.exam, questions: prev.exam.questions.map((question, current) => current === questionIndex
      ? { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) }
      : question) },
  }))
  const addUnit = () => setDraft(current => ({ ...current, units: [...current.units, { title: '', material: '', is_pastor_node: false }] }))
  const removeUnit = (index) => setDraft(current => ({ ...current, units: current.units.filter((_, currentIndex) => currentIndex !== index) }))
  const addQuestion = () => setDraft(current => ({ ...current, exam: { ...current.exam, questions: [...current.exam.questions, emptyQuestion()] } }))
  const removeQuestion = (index) => setDraft(current => ({ ...current, exam: { ...current.exam, questions: current.exam.questions.filter((_, currentIndex) => currentIndex !== index) } }))

  const activeCourse = reviewQueue.find(item => item.id === selectedId) || selected
  const editable = activeCourse?.author_id === user?.id && !['pending_review', 'published', 'archived'].includes(activeCourse?.publication_state)

  if (isMobile) {
    return <CourseAuthoringMobile
      courses={courses} reviewQueue={reviewQueue} selectedId={selectedId} draft={draft}
      isAdmin={canReview} editable={editable} busy={busy} error={error} status={status}
      reviewNote={reviewNote} onReviewNoteChange={setReviewNote} onOpenCourse={openCourse}
      onCloseCourse={() => setSelectedId(null)} onCreate={createCourse}
      materialLicense={materialLicense} onMaterialLicenseChange={setMaterialLicense}
      pendingMaterial={pendingMaterial} onUploadMaterial={uploadMaterial} onConfirmMaterial={confirmMaterial}
      onDraftChange={(key, value) => setDraft(current => ({ ...current, [key]: value }))}
      onUpdateUnit={updateUnit} onUpdateQuestion={updateQuestion} onUpdateOption={updateOption}
      onAddUnit={addUnit} onRemoveUnit={removeUnit}
      onAddQuestion={addQuestion} onRemoveQuestion={removeQuestion}
      onSave={save} onSubmit={submit} onReview={review}
    />
  }

  return (
    <>
      <div className="page-heading-row">
        <div><h1 className="page-title">课程工作台</h1><p className="page-sub">牧者设计课程、阅读材料与结课考试，管理员审核后才会对用户开放。</p></div>
        <button className="btn btn-primary" onClick={createCourse} disabled={busy}>新建课程</button>
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
      {status && <div className="success-msg">{status}</div>}

      <div className="course-authoring-layout">
        <aside className="card course-authoring-list">
          <h2>我的课程</h2>
          {courses.length === 0 && <p className="muted">暂无课程草稿。</p>}
          {courses.map(course => <button key={course.id} className={`course-authoring-item ${selectedId === course.id ? 'active' : ''}`} onClick={() => openCourse(course.id)}><strong>{course.title || '未命名课程'}</strong><span>{statusText(course.publication_state)}</span></button>)}
          {canReview && <><h2 style={{ marginTop: 24 }}>待审核</h2>{reviewQueue.length === 0 && <p className="muted">暂无待审核课程。</p>}{reviewQueue.map(course => <button key={`review-${course.id}`} className={`course-authoring-item ${selectedId === course.id ? 'active' : ''}`} onClick={() => openCourse(course.id)}><strong>{course.title || '未命名课程'}</strong><span>{course.author_name || '牧者'} · 待审核</span></button>)}</>}
        </aside>

        <section className="card course-authoring-editor">
          {!selectedId && <div className="empty-state">从左侧选择课程，或新建一门课程。</div>}
          {selectedId && <>
            <div className="course-authoring-editor-head"><div><h2>{activeCourse?.title || draft.title || '课程编辑'}</h2><span className="badge">{statusText(activeCourse?.publication_state || status)}</span></div>{canReview && activeCourse?.publication_state === 'pending_review' && <div className="editor-actions"><button className="btn btn-primary" onClick={() => review('publish')} disabled={busy}>通过并发布</button></div>}</div>
            {canReview && activeCourse?.publication_state === 'pending_review' && <div className="field"><label>审核意见（退回时必填）</label><textarea rows="3" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button className="btn btn-outline" onClick={() => review('request_changes')} disabled={busy} style={{ marginTop: 8 }}>退回修改</button></div>}
            {editable && <>
              <div className="field"><label>课程标题</label><input value={draft.title} onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))} /></div>
              <div className="field"><label>创作模板</label><select value={draft.template_type} onChange={e => setDraft(prev => ({ ...prev, template_type: e.target.value }))}><option value="system_course">系统课程</option><option value="reading_guide">书籍 / 读书导引</option><option value="short_lesson">专题短课</option></select></div>
              <div className="field"><label>经文依据</label><input value={draft.scripture_references} onChange={e => setDraft(prev => ({ ...prev, scripture_references: e.target.value }))} placeholder="例如：以弗所书 5:22-33" /></div>
              <label className="checkbox-row"><input type="checkbox" checked={draft.ai_eligible} onChange={e => setDraft(prev => ({ ...prev, ai_eligible: e.target.checked }))} /> 发布后允许 AI 将本课程作为教导依据</label>
              <div className="field"><label>上传已授权教材（PDF / EPUB）</label><input value={materialLicense} onChange={e => setMaterialLicense(e.target.value)} placeholder="版权或授权说明（必填）" /><input type="file" accept="application/pdf,application/epub+zip" onChange={e => uploadMaterial(e.target.files?.[0])} disabled={busy} /><small>扫描版 PDF 暂不支持；上传后系统会抽取文字并等待你确认。</small></div>
              {pendingMaterial && <div className="course-authoring-material-preview"><strong>提取结果预览：{pendingMaterial.original_name}</strong><p>请核对以下内容是否属于已授权教材；未确认前，它不会被发布或作为 AI 依据。</p><pre>{pendingMaterial.preview || '未能生成预览'}</pre><button type="button" className="btn btn-primary" disabled={busy} onClick={confirmMaterial}>确认并纳入课程</button></div>}
              <div className="field"><label>课程简介</label><textarea rows="4" value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} /></div>
              <h3>课程单元</h3>
              {draft.units.map((unit, index) => <div className="course-authoring-block" key={unit.id || index}><div className="course-authoring-block-title"><strong>第 {index + 1} 单元</strong><button className="text-button" onClick={() => setDraft(prev => ({ ...prev, units: prev.units.filter((_, current) => current !== index) }))}>删除</button></div><div className="field"><label>单元标题</label><input value={unit.title} onChange={e => updateUnit(index, 'title', e.target.value)} /></div><div className="field"><label>阅读正文</label><textarea rows="7" value={unit.material} onChange={e => updateUnit(index, 'material', e.target.value)} /></div><label className="checkbox-row"><input type="checkbox" checked={Boolean(unit.is_pastor_node)} onChange={e => updateUnit(index, 'is_pastor_node', e.target.checked)} /> 需要牧者确认</label></div>)}
              <button className="btn btn-outline" onClick={() => setDraft(prev => ({ ...prev, units: [...prev.units, { title: '', material: '', is_pastor_node: false }] }))}>添加单元</button>
              <h3>结课考试</h3>
              <div className="field"><label>通过比例（百分制）</label><input type="number" min="1" max="100" value={draft.exam.pass_threshold} onChange={e => setDraft(prev => ({ ...prev, exam: { ...prev.exam, pass_threshold: Number(e.target.value) } }))} /></div>
              {draft.exam.questions.map((question, index) => <div className="course-authoring-block" key={question.id || index}><div className="course-authoring-block-title"><strong>第 {index + 1} 题</strong><button className="text-button" onClick={() => setDraft(prev => ({ ...prev, exam: { ...prev.exam, questions: prev.exam.questions.filter((_, current) => current !== index) } }))}>删除</button></div><div className="field"><label>题目</label><textarea rows="3" value={question.prompt} onChange={e => updateQuestion(index, 'prompt', e.target.value)} /></div>{question.options.map((option, optionIndex) => <div className="field-inline" key={optionIndex}><input type="radio" name={`correct-${index}`} checked={question.correct_option === optionIndex} onChange={() => updateQuestion(index, 'correct_option', optionIndex)} /><input value={option} placeholder={`选项 ${optionIndex + 1}`} onChange={e => updateOption(index, optionIndex, e.target.value)} /></div>)}</div>)}
              <div className="editor-actions"><button className="btn btn-outline" onClick={() => setDraft(prev => ({ ...prev, exam: { ...prev.exam, questions: [...prev.exam.questions, emptyQuestion()] } }))}>添加题目</button><button className="btn btn-outline" onClick={save} disabled={busy}>保存草稿</button><button className="btn btn-primary" onClick={submit} disabled={busy}>提交审核</button></div>
            </>}
            {!editable && !isAdmin && <div className="muted">当前状态：{statusText(activeCourse?.publication_state || status)}。审核意见：{activeCourse?.review_note || '暂无'}</div>}
            {canReview && !editable && <div className="course-authoring-preview"><h3>课程内容预览</h3><p>{draft.description}</p>{draft.units.map((unit, index) => <details key={index}><summary>第 {index + 1} 单元 · {unit.title}</summary><p>{unit.material}</p></details>)}</div>}
          </>}
        </section>
      </div>
    </>
  )
}
