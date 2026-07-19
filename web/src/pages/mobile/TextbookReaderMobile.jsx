import { Link } from 'react-router-dom'
import { XMobileDetailHeader } from '../../components/x-mobile/XMobileDetailHeader'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

export default function TextbookReaderMobile({ data, loading = false, error = '', saving = false, onBack, onMarkRead, onRetry, returnTo = '' }) {
  if (loading) return <XMobileSkeleton lines={8} />
  if (!data) return <XMobileErrorRow message={error || '章节加载失败'} onRetry={onRetry} />
  const suffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
  return (
    <article className="x-mobile-reader">
      <XMobileDetailHeader title={data.chapter.title} subtitle={data.textbook.title} onBack={onBack} />
      {error ? <XMobileErrorRow message={error} /> : null}
      <div className="x-mobile-reader-body" dangerouslySetInnerHTML={{ __html: data.chapter.body_html }} />
      <nav className="x-mobile-reader-actions" aria-label="章节导航">
        {data.chapter.prev ? <Link className="x-mobile-button-secondary x-mobile-touch-target" to={`/textbooks/${data.textbook.slug || ''}/chapters/${data.chapter.prev.index}${suffix}`}>上一章</Link> : <span />}
        <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onMarkRead} disabled={saving || data.chapter.completed}>{data.chapter.completed ? '本章已读' : saving ? '保存中…' : '标记本章已读'}</button>
        {data.chapter.next ? <Link className="x-mobile-button-secondary x-mobile-touch-target" to={`/textbooks/${data.textbook.slug || ''}/chapters/${data.chapter.next.index}${suffix}`}>下一章</Link> : <span />}
      </nav>
    </article>
  )
}
