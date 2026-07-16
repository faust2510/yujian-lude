import { useEffect, useMemo, useState } from 'react'
import { courseAuthoring } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const emptyQuestion = () => ({ prompt: '', options: ['', ''], correct_option: 0, explanation: '' })
const emptyDraft = () => ({
  title: '',
  subtitle: '',
  description: '',
  cover_image: '',
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
  const isAdmin = user?.role === 'admin'
  const [courses, setCourses] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewNote, setReviewNote] = useState('')

  const selected = useMemo(() => courses.find(course => course.id === selectedId), [courses, selectedId])

  const load = async () => {
    setError('')
    try {
      const mine = await courseAuthoring.mine()
      setCourses(mine.data.courses || [])
      if (isAdmin) {
        const queue = await courseAuthoring.reviewQueue()
        setReviewQueue(queue.data.courses || [])
      }
    } catch (err) {
      setError(messageFrom(err, '课程工作台加载失败'))
    }
  }

  useEffect(() => { load() }, [isAdmin])

  const openCourse = async (id) => {
    setBusy(true)
    setError('')
    try {
      const response = await courseAuthoring.detail(id)
      setSelectedId(id)
      setDraft(normalizeDraft(response.data.course))
      setStatus(response.data.course.publication_state)
      setReviewNote(response.data.course.review_note || '')
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

  const activeCourse = isAdmin ? (reviewQueue.find(item => item.id === selectedId) || selected) : selected
  const editable = !isAdmin && !['pending_review', 'published', 'archived'].includes(activeCourse?.publication_state)

  return (
    <>
      <div className="page-heading-row">
        <div><h1 className="page-title">课程工作台</h1><p className="page-sub">牧者设计课程、阅读材料与结课考试，管理员审核后才会对用户开放。</p></div>
        {!isAdmin && <button className="btn btn-primary" onClick={createCourse} disabled={busy}>新建课程</button>}
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
      {status && <div className="success-msg">{status}</div>}

      <div className="course-authoring-layout">
        <aside className="card course-authoring-list">
          <h2>我的课程</h2>
          {courses.length === 0 && <p className="muted">暂无课程草稿。</p>}
          {courses.map(course => <button key={course.id} className={`course-authoring-item ${selectedId === course.id ? 'active' : ''}`} onClick={() => openCourse(course.id)}><strong>{course.title || '未命名课程'}</strong><span>{statusText(course.publication_state)}</span></button>)}
          {isAdmin && <><h2 style={{ marginTop: 24 }}>待审核</h2>{reviewQueue.length === 0 && <p className="muted">暂无待审核课程。</p>}{reviewQueue.map(course => <button key={`review-${course.id}`} className={`course-authoring-item ${selectedId === course.id ? 'active' : ''}`} onClick={() => openCourse(course.id)}><strong>{course.title || '未命名课程'}</strong><span>{course.author_name || '牧者'} · 待审核</span></button>)}</>}
        </aside>

        <section className="card course-authoring-editor">
          {!selectedId && <div className="empty-state">从左侧选择课程，或新建一门课程。</div>}
          {selectedId && <>
            <div className="course-authoring-editor-head"><div><h2>{activeCourse?.title || draft.title || '课程编辑'}</h2><span className="badge">{statusText(activeCourse?.publication_state || status)}</span></div>{isAdmin && activeCourse?.publication_state === 'pending_review' && <div className="editor-actions"><button className="btn btn-primary" onClick={() => review('publish')} disabled={busy}>通过并发布</button><button className="btn btn-outline" onClick={() => review('archive')} disabled={busy}>归档</button></div>}</div>
            {isAdmin && activeCourse?.publication_state === 'pending_review' && <div className="field"><label>审核意见（退回时必填）</label><textarea rows="3" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button className="btn btn-outline" onClick={() => review('request_changes')} disabled={busy} style={{ marginTop: 8 }}>退回修改</button></div>}
            {editable && <>
              <div className="field"><label>课程标题</label><input value={draft.title} onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))} /></div>
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
            {isAdmin && <div className="course-authoring-preview"><h3>课程内容预览</h3><p>{draft.description}</p>{draft.units.map((unit, index) => <details key={index}><summary>第 {index + 1} 单元 · {unit.title}</summary><p>{unit.material}</p></details>)}</div>}
          </>}
        </section>
      </div>
    </>
  )
}
