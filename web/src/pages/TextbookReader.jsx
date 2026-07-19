import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { textbooks } from '../api/client'
import useMobileViewport from '../hooks/useMobileViewport'
import TextbookReaderMobile from './mobile/TextbookReaderMobile'

export default function TextbookReader() {
  const { slug, index } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const isMobile = useMobileViewport()
  const returnTo = new URLSearchParams(location.search).get('returnTo')

  useEffect(() => {
    let alive = true
    async function loadChapter() {
      setLoading(true)
      setError('')
      try {
        const res = await textbooks.chapter(slug, index)
        if (alive) setData(res.data)
      } catch (err) {
        if (alive) setError(err.response?.data?.error || '章节加载失败，请稍后重试')
      } finally {
        if (alive) setLoading(false)
      }
    }
    loadChapter()
    return () => { alive = false }
  }, [slug, index, reloadKey])

  const markRead = async () => {
    setSaving(true)
    setError('')
    try {
      await textbooks.markRead(slug, index)
      setData((prev) => prev ? { ...prev, chapter: { ...prev.chapter, completed: true } } : prev)
    } catch (err) {
      setError(err.response?.data?.error || '阅读进度保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (isMobile) {
    return <TextbookReaderMobile data={data} loading={loading} error={error} saving={saving} returnTo={returnTo} onBack={() => navigate(returnTo || `/textbooks/${slug}`)} onMarkRead={markRead} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  if (loading) return <div className="card muted-small">章节加载中...</div>

  return (
    <article className="textbook-reader">
      {error && <div className="card error-msg">{error}</div>}
      {data && (
        <>
          <div className="reader-topbar">
            <button className="btn btn-outline" onClick={() => navigate(returnTo || `/textbooks/${slug}`)}>
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
