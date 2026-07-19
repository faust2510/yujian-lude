import { Link } from 'react-router-dom'
import { XMobileDetailHeader } from '../../components/x-mobile/XMobileDetailHeader'
import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'

function formatChatTime(iso) {
  if (!iso) return ''
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return ''
  const today = new Date()
  if (value.toDateString() === today.toDateString()) {
    return value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return value.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function ChatMobile({ user, channels = [], active, messages = [], text = '', sending = false, loadingChannels = false, loadingMessages = false, error = '', bottomRef, onRetry, onTextChange, onSend, onBack }) {
  if (!active) {
    if (loadingChannels) return <XMobileSkeleton lines={7} />
    return <section className="x-mobile-list" aria-label="书信列表">{error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}{channels.length === 0 ? <XMobileEmptyState title="暂无书信" description="双方表达心动后，书信通道会自动开放。" /> : channels.map((channel) => <Link className="x-mobile-list-link x-mobile-touch-target" to={`/chat/${channel.id}`} key={channel.id}><span><strong>{channel.other_nickname || '对方'}</strong><small>{channel.last_msg || '暂无消息'}</small></span><span className="x-mobile-row-meta">{formatChatTime(channel.last_at)}</span></Link>)}</section>
  }
  return (
    <section className="x-mobile-chat-thread">
      <XMobileDetailHeader title={active.other_nickname || '对方'} subtitle="书信" onBack={onBack} />
      {error ? <XMobileErrorRow message={error} onRetry={onRetry} /> : null}
      <div className="x-mobile-message-list">{loadingMessages ? <XMobileSkeleton lines={5} /> : messages.length === 0 ? <XMobileEmptyState title="发送第一封书信" /> : messages.map((message) => { const mine = message.sender_id === user?.id; return <div className={`x-mobile-message ${mine ? 'is-mine' : ''}`} key={message.id}><div>{message.body}</div>{message.created_at ? <small>{formatChatTime(message.created_at)}</small> : null}</div> })}<div ref={bottomRef} /></div>
      <div className="x-mobile-composer"><label className="x-mobile-sr-only" htmlFor="chat-message">输入消息</label><input id="chat-message" value={text} onChange={(event) => onTextChange?.(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) onSend?.() }} placeholder="输入消息…" /><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={onSend} disabled={sending || !text.trim()}>{sending ? '发送中…' : '发送'}</button></div>
    </section>
  )
}
