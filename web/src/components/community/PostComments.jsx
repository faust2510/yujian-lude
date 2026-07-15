import { useCallback, useEffect, useRef, useState } from 'react'
import { community } from '../../api/client'

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error || fallback
}

export default function PostComments({ postId, currentUserId, onError, onOpenUser, onTotalChange }) {
  const [comments, setComments] = useState(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const loadRequest = useRef(0)
  const mutationRequest = useRef(0)
  const mounted = useRef(false)

  const loadComments = useCallback(async () => {
    if (!mounted.current) return
    const requestId = ++loadRequest.current
    setLoading(true)
    setLoadError('')
    try {
      const response = await community.getComments(postId)
      if (requestId !== loadRequest.current) return
      setComments(response.data.comments ?? [])
      onTotalChange?.(postId, response.data.total ?? 0)
    } catch (error) {
      if (requestId !== loadRequest.current) return
      const message = errorMessage(error, '评论加载失败')
      setLoadError(message)
      onError?.(message)
    } finally {
      if (requestId === loadRequest.current) setLoading(false)
    }
  }, [onError, onTotalChange, postId])

  useEffect(() => {
    mounted.current = true
    mutationRequest.current += 1
    loadComments()
    return () => {
      mounted.current = false
      loadRequest.current += 1
      mutationRequest.current += 1
    }
  }, [loadComments])

  const submitComment = async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody || submitting) return

    const requestId = mutationRequest.current
    setSubmitting(true)
    try {
      const payload = { body: trimmedBody }
      if (replyTo) payload.parent_id = replyTo.id
      await community.addComment(postId, payload)
      if (!mounted.current || requestId !== mutationRequest.current) return
      setBody('')
      setReplyTo(null)
      await loadComments()
    } catch (error) {
      if (!mounted.current || requestId !== mutationRequest.current) return
      onError?.(errorMessage(error, '评论失败'))
    } finally {
      if (mounted.current && requestId === mutationRequest.current) setSubmitting(false)
    }
  }

  const deleteComment = async (commentId) => {
    const requestId = mutationRequest.current
    try {
      await community.deleteComment(commentId)
      if (!mounted.current || requestId !== mutationRequest.current) return
      await loadComments()
    } catch (error) {
      if (!mounted.current || requestId !== mutationRequest.current) return
      onError?.(errorMessage(error, '删除评论失败'))
    }
  }

  return (
    <div className="com-comments-wrap">
      {loading && comments === null && <div className="com-comment-status">评论加载中…</div>}
      {loadError && (
        <div className="com-comment-error">
          <span>{loadError}</span>
          <button type="button" className="com-comment-retry-btn" onClick={loadComments}>重试</button>
        </div>
      )}
      <div className="com-comments-section">
        {comments?.map(comment => (
          <div key={comment.id} className="com-comment">
            <div className="com-comment-header">
              <button type="button" className="com-comment-author" onClick={() => onOpenUser?.(comment.author_id)}>
                {comment.author_nickname}
              </button>
              <span className="com-comment-time">{timeAgo(comment.created_at)}</span>
            </div>
            <div className="com-comment-body">{comment.body}</div>
            <div className="com-comment-actions">
              <button type="button" className="com-comment-reply-btn" onClick={() => setReplyTo({ id: comment.id, nickname: comment.author_nickname })}>回复</button>
              {comment.author_id === currentUserId && (
                <button type="button" className="com-comment-reply-btn" onClick={() => deleteComment(comment.id)}>删除</button>
              )}
            </div>
            {(comment.replies ?? []).map(reply => (
              <div key={reply.id} className="com-comment com-comment-reply">
                <div className="com-comment-header">
                  <button type="button" className="com-comment-author" onClick={() => onOpenUser?.(reply.author_id)}>
                    {reply.author_nickname}
                  </button>
                  <span className="com-comment-time">{timeAgo(reply.created_at)}</span>
                </div>
                <div className="com-comment-body">{reply.body}</div>
                {reply.author_id === currentUserId && (
                  <div className="com-comment-actions">
                    <button type="button" className="com-comment-reply-btn" onClick={() => deleteComment(reply.id)}>删除</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="com-comment-input-row">
        {replyTo && (
          <div className="com-reply-to">
            回复 @{replyTo.nickname}
            <button type="button" className="com-reply-cancel" onClick={() => setReplyTo(null)}>取消</button>
          </div>
        )}
        <div className="com-comment-compose">
          <input
            value={body}
            onChange={event => setBody(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submitComment()
              }
            }}
            placeholder={replyTo ? `回复 @${replyTo.nickname}` : '写评论…'}
            className="com-comment-input"
          />
          <button type="button" className="com-comment-submit" onClick={submitComment} disabled={submitting || !body.trim()}>
            {submitting ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
