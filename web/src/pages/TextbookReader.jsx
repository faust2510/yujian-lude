import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { textbooks } from '../api/client'

export default function TextbookReader() {
  const { slug, index } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const chapterRequest = useRef(0)
  const loadedChapter = useRef(null)
  const returnTo = new URLSearchParams(location.search).get('returnTo')

  useEffect(() => {
    const requestId = ++chapterRequest.current
    async function loadChapter() {
      loadedChapter.current = null
      setData(null)
      setLoading(true)
      setSaving(false)
      setError('')
      try {
        const res = await textbooks.chapter(slug, index)
        if (requestId !== chapterRequest.current) return
        setData(res.data)
        loadedChapter.current = { slug, index }
      } catch (err) {
        if (requestId !== chapterRequest.current) return
        setError(err.response?.data?.error || '章节加载失败，请稍后重试')
      } finally {
        if (requestId === chapterRequest.current) setLoading(false)
      }
    }
    loadChapter()
    return () => {
      if (requestId === chapterRequest.current) chapterRequest.current += 1
      loadedChapter.current = null
    }
  }, [slug, index, retryKey])

  const retryChapter = () => setRetryKey(key => key + 1)
  const returnToDirectory = () => navigate(returnTo || `/textbooks/${slug}`)

  const markRead = async () => {
    const chapter = loadedChapter.current
    if (!chapter) return
    setSaving(true)
    setError('')
    try {
      await textbooks.markRead(chapter.slug, chapter.index)
      if (loadedChapter.current !== chapter) return
      setData((prev) => prev ? { ...prev, chapter: { ...prev.chapter, completed: true } } : prev)
    } catch (err) {
      if (loadedChapter.current !== chapter) return
      setError(err.response?.data?.error || '阅读进度保存失败')
    } finally {
      if (loadedChapter.current === chapter) setSaving(false)
    }
  }

  if (loading) return <div className="card muted-small">章节加载中...</div>

  return (
    <article className="textbook-reader">
      {error && !data && (
        <div className="card error-msg">
          <p>{error}</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
            <button className="btn btn-primary" onClick={retryChapter}>
              <RefreshCw size={16} aria-hidden="true" />
              重试
            </button>
            <button className="btn btn-outline" onClick={() => navigate(returnTo || `/textbooks/${slug}`)}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回教材目录
            </button>
          </div>
        </div>
      )}
      {error && data && <div className="card error-msg">{error}</div>}
      {data && (
        <>
          <div className="reader-topbar">
            <button className="btn btn-outline" onClick={returnToDirectory}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回
            </button>
            <span className={`badge ${data.chapter.completed ? 'badge-green' : 'badge-yellow'}`}>
              {data.chapter.completed ? '已读' : '未读'}
            </span>
          </div>

          <header className="reader-header">
            <p>{data.textbook.title}</p>
            <h1>{data.chapter.title}</h1>
          </header>

          <div className="reader-body" dangerouslySetInnerHTML={{ __html: data.chapter.body_html }} />

          <nav className="reader-actions">
            {data.chapter.prev
              ? <Link className="btn btn-outline" to={`/textbooks/${slug}/chapters/${data.chapter.prev.index}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>上一章</Link>
              : <span />}
            <button className="btn btn-primary" onClick={markRead} disabled={saving || data.chapter.completed}>
              {data.chapter.completed ? '本章已读' : saving ? '保存中...' : '标记本章已读'}
            </button>
            {data.chapter.next
              ? <Link className="btn btn-outline" to={`/textbooks/${slug}/chapters/${data.chapter.next.index}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>下一章</Link>
              : <span />}
          </nav>
        </>
      )}
    </article>
  )
}
