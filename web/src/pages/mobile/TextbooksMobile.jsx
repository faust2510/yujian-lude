import { Link } from 'react-router-dom'
import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

export default function TextbooksMobile({ slug, list = [], detail, loading = false, detailLoading = false, error = '', onRetry }) {
  if (error) return <XMobileErrorRow message={error} onRetry={onRetry} />
  if (loading) return <XMobileSkeleton lines={5} />

  if (slug) {
    if (detailLoading) return <XMobileSkeleton lines={6} />
    if (!detail) return <XMobileEmptyState title="没有找到这本教材" description="返回教材列表后重试。" />
    return (
      <section className="x-mobile-list" aria-label="教材目录">
        <header className="x-mobile-section-header">
          <h2>{detail.textbook.title}</h2>
          <p>{detail.textbook.author || '作者信息待整理'}</p>
        </header>
        {(detail.chapters || []).map((chapter) => (
          <Link className="x-mobile-list-link x-mobile-touch-target" to={`/textbooks/${detail.textbook.slug}/chapters/${chapter.chapter_index}`} key={chapter.chapter_index}>
            <span><strong>{chapter.completed ? '✓ ' : ''}{chapter.chapter_title}</strong><small>{chapter.word_count || 0} 字</small></span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </section>
    )
  }

  if (list.length === 0) return <XMobileEmptyState title="暂无可读教材" description="教材发布后会出现在这里。" />
  return (
    <section className="x-mobile-list" aria-label="教材列表">
      {list.map((book) => (
        <Link className="x-mobile-list-link x-mobile-touch-target" to={`/textbooks/${book.slug}`} key={book.slug}>
          <span><strong>{book.title}</strong><small>{book.author || '作者信息待整理'}</small></span>
          <span className="x-mobile-row-meta">{book.completed_count || 0}/{book.chapter_count || 0}</span>
        </Link>
      ))}
    </section>
  )
}
