import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { textbooks } from '../api/client'

export default function Textbooks() {
  const { slug } = useParams()
  const [list, setList] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const detailRequest = useRef(0)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await textbooks.list()
        if (!alive) return
        setList(res.data.textbooks || [])
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.error || '教材加载失败，请稍后重试')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const requestId = ++detailRequest.current
    async function loadDetail() {
      if (!slug) {
        setDetail(null)
        setDetailLoading(false)
        return
      }
      setDetail(null)
      setDetailLoading(true)
      setError('')
      try {
        const res = await textbooks.detail(slug)
        if (requestId !== detailRequest.current) return
        setDetail(res.data)
      } catch (err) {
        if (requestId !== detailRequest.current) return
        setError(err.response?.data?.error || '教材加载失败，请稍后重试')
      } finally {
        if (requestId === detailRequest.current) setDetailLoading(false)
      }
    }
    loadDetail()
    return () => {
      if (requestId === detailRequest.current) detailRequest.current += 1
    }
  }, [slug])

  return (
    <div className="textbook-page">
      <h1 className="page-title">教材库</h1>
      <p className="page-sub">按章节阅读课程教材，阅读进度会同步到课程单元。</p>

      {error && <div className="card error-msg">{error}</div>}
      {loading && <div className="card muted-small">教材加载中...</div>}

      <div className="textbook-shell">
        <section className="textbook-list">
          {!loading && list.length === 0 && !error && (
            <div className="muted-small">暂无可读教材。</div>
          )}
          {list.map((book) => (
            <Link className="textbook-row" to={`/textbooks/${book.slug}`} key={book.slug}>
              <div>
                <h3>{book.title}</h3>
                <p>{book.author || '作者信息待整理'}</p>
              </div>
              <span className="badge badge-soft">{book.completed_count || 0}/{book.chapter_count || 0}</span>
            </Link>
          ))}
        </section>

        <section className="textbook-toc card">
          {!slug && <div className="muted-small">请选择一本教材查看目录。</div>}
          {detailLoading && <div className="muted-small">目录加载中...</div>}
          {detail && (
            <>
              <div className="textbook-toc-head">
                <div>
                  <h2>{detail.textbook.title}</h2>
                  <p>{detail.textbook.author}</p>
                </div>
                <span className="badge badge-green">
                  {(detail.chapters || []).filter((chapter) => chapter.completed).length}/{detail.chapters?.length || 0}
                </span>
              </div>
              <div className="textbook-chapter-list">
                {(detail.chapters || []).map((chapter) => (
                  <Link
                    className={`textbook-chapter-link ${chapter.completed ? 'is-done' : ''}`}
                    to={`/textbooks/${detail.textbook.slug}/chapters/${chapter.chapter_index}`}
                    key={chapter.chapter_index}
                  >
                    <span>{chapter.completed ? '✓ ' : ''}{chapter.chapter_title}</span>
                    <small>{chapter.word_count || 0} 字</small>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
