import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { chat } from '../api/client'

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Chat() {
  const { user } = useAuth()
  const [channels, setChannels] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true)
    setError('')
    try {
      const r = await chat.channels()
      setChannels(r.data?.channels || [])
    } catch (err) {
      setError(err.response?.data?.error || '对话列表加载失败，请重试')
    } finally {
      setLoadingChannels(false)
    }
  }, [])

  const loadMessages = useCallback(async (id, options = {}) => {
    if (!options.silent) {
      setLoadingMessages(true)
      setError('')
    }
    try {
      const r = await chat.messages(id)
      setMessages(r.data?.messages || [])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      if (!options.silent) setError(err.response?.data?.error || '消息加载失败，请重试')
    } finally {
      if (!options.silent) setLoadingMessages(false)
    }
  }, [])

  useEffect(() => { loadChannels() }, [loadChannels])

  useEffect(() => {
    if (!active) return
    setMessages([])
    loadMessages(active.id)
    pollRef.current = setInterval(() => loadMessages(active.id, { silent: true }), 5000)
    return () => clearInterval(pollRef.current)
  }, [active, loadMessages])

  const send = async () => {
    if (!text.trim() || !active || sending) return
    setSending(true)
    try {
      await chat.send(active.id, text.trim())
      setText('')
      await loadMessages(active.id)
      await loadChannels()
    } catch (err) {
      setError(err.response?.data?.error || '发送失败，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - var(--nav-h, 60px))', background: 'var(--bg)' }}>
      <div style={{ width: 280, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 15, color: 'var(--fg)'
        }}>私信</div>
        {loadingChannels && (
          <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>对话加载中…</div>
        )}
        {!loadingChannels && channels.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>💬</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
              暂无对话。<br />与候选人互相表达意向后，私信通道会自动开通。
            </p>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={loadChannels}>刷新</button>
          </div>
        )}
        {channels.map(ch => (
          <div key={ch.id} onClick={() => setActive(ch)}
            style={{
              padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: active?.id === ch.id ? 'var(--bg)' : 'var(--surface)',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => { if (active?.id !== ch.id) e.currentTarget.style.background = '#FAF0EE' }}
            onMouseLeave={e => { if (active?.id !== ch.id) e.currentTarget.style.background = 'var(--surface)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{ch.other_nickname || '对方'}</div>
            <div style={{
              fontSize: 13, color: 'var(--muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
            }}>
              {ch.last_msg || '暂无消息'}
            </div>
            {ch.last_at && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, opacity: 0.6 }}>{timeAgo(ch.last_at)}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {error && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <span className="error-msg" style={{ marginTop: 0 }}>{error}</span>
          </div>
        )}
        {!active ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', gap: 8
          }}>
            <div style={{ fontSize: 40, opacity: 0.2 }}>✉️</div>
            <span style={{ fontSize: 14 }}>选择一个对话开始聊天</span>
          </div>
        ) : (
          <>
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', fontWeight: 600, fontSize: 15
            }}>
              {active.other_nickname || '对方'}
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', padding: '20px 24px',
              display: 'flex', flexDirection: 'column', gap: 12
            }}>
              {loadingMessages && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                  消息加载中…
                </div>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                  发送第一条消息吧
                </div>
              )}
              {messages.map(m => {
                const mine = m.sender_id === user?.id
                return (
                  <div key={m.id} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '80%', alignSelf: mine ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      padding: '10px 16px', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: mine ? 'var(--brand)' : 'var(--surface)',
                      color: mine ? '#fff' : 'var(--fg)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontSize: 14, lineHeight: 1.6,
                      wordBreak: 'break-word'
                    }}>
                      {m.body}
                    </div>
                    {m.created_at && (
                      <div style={{
                        fontSize: 11, color: 'var(--muted)', marginTop: 4, opacity: 0.6,
                        padding: '0 4px'
                      }}>
                        {timeAgo(m.created_at)}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', gap: 10, alignItems: 'center'
            }}>
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="输入消息…"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', outline: 'none', fontSize: 14,
                  fontFamily: 'inherit', background: 'var(--bg)',
                  transition: 'border-color 0.15s'
                }}
                onFocus={e => e.target.style.borderColor = 'var(--brand)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              <button onClick={send} disabled={sending || !text.trim()}
                style={{
                  padding: '10px 22px', background: sending ? 'var(--brand-dark)' : 'var(--brand)',
                  color: '#fff', border: 'none', borderRadius: 10, cursor: sending ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: 14, transition: 'background 0.15s', whiteSpace: 'nowrap',
                  opacity: text.trim() ? 1 : 0.5
                }}>
                {sending ? '发送中…' : '发送'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
