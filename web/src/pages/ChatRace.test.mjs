import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./Chat.jsx', import.meta.url)), 'utf8')

const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end))

test('message responses only update the latest request for the active channel', () => {
  const loadMessages = section('const loadMessages', 'useEffect(() => { loadChannels()')
  const requestStart = loadMessages.indexOf('const requestId = ++messageRequestIdRef.current')
  const request = loadMessages.indexOf('await chat.messages(id)')
  const identityGuard = loadMessages.indexOf(
    'if (requestId !== messageRequestIdRef.current || activeChannelIdRef.current !== id) return',
  )
  const update = loadMessages.indexOf('setMessages(')

  assert.match(source, /const activeChannelIdRef = useRef\(null\)/)
  assert.match(source, /const messageRequestIdRef = useRef\(0\)/)
  assert.ok(requestStart !== -1 && requestStart < request)
  assert.ok(request < identityGuard && identityGuard < update)
})

test('a completed send only refreshes the channel it started in while it remains active', () => {
  const send = section('const send = async', '\n\n  return (')
  const captureChannel = send.indexOf('const channelId = active.id')
  const request = send.indexOf('await chat.send(channelId, text.trim())')
  const identityGuard = send.indexOf('if (activeChannelIdRef.current !== channelId) return')
  const refresh = send.indexOf('await loadMessages(channelId)')

  assert.ok(captureChannel !== -1 && captureChannel < request)
  assert.ok(request < identityGuard && identityGuard < refresh)
})

test('channel changes and polling cleanup invalidate in-flight message requests', () => {
  const selectChannel = section('const selectChannel', '\n\n  const send = async')
  const setIdentity = selectChannel.indexOf('activeChannelIdRef.current = channel.id')
  const invalidate = selectChannel.indexOf('messageRequestIdRef.current += 1')
  const activate = selectChannel.indexOf('setActive(channel)')

  assert.ok(setIdentity !== -1 && setIdentity < invalidate && invalidate < activate)
  assert.match(
    source,
    /return \(\) => \{\s*clearInterval\(pollRef\.current\)\s*messageRequestIdRef\.current \+= 1\s*\}/,
  )
  assert.match(source, /onClick=\{\(\) => selectChannel\(ch\)\}/)
})

test('the first active channel is registered before its initial message request', () => {
  const activeEffect = section('useEffect(() => {\n    if (!active) return', '\n\n  const selectChannel')
  const setIdentity = activeEffect.indexOf('activeChannelIdRef.current = active.id')
  const load = activeEffect.indexOf('loadMessages(active.id)')

  assert.ok(setIdentity !== -1 && setIdentity < load)
})

test('mobile chat switches between channel list and usable conversation while desktop stays split', () => {
  assert.match(source, /className=\{`chat-shell \$\{active \? 'chat-view-conversation' : 'chat-view-list'\}`\}/)
  assert.match(source, /className="chat-channel-list"/)
  assert.match(source, /className="chat-conversation"/)
  assert.match(source, /className="chat-messages"/)
  assert.match(source, /className="chat-back-button"[\s\S]*onClick=\{showChannelList\}/)
  assert.match(source, /aria-label="返回对话列表"/)
})

test('leaving a mobile conversation invalidates message work and returns to the list', () => {
  const showChannelList = section('const showChannelList', '\n\n  const send = async')

  assert.match(showChannelList, /activeChannelIdRef\.current = null/)
  assert.match(showChannelList, /messageRequestIdRef\.current \+= 1/)
  assert.match(showChannelList, /setActive\(null\)/)
})

test('message refresh scrolls only the message pane instead of moving the page header', () => {
  assert.match(source, /const messagesRef = useRef\(null\)/)
  assert.match(source, /messagesRef\.current\?\.scrollTo\(\{ top: messagesRef\.current\.scrollHeight/)
  assert.doesNotMatch(source, /scrollIntoView/)
  assert.match(source, /className="chat-messages"[\s\S]*ref=\{messagesRef\}/)
})

test('channel rows are real keyboard-operable buttons', () => {
  assert.match(source, /<button[^>]*type="button"[^>]*className="chat-channel-item"/)
  assert.match(source, /aria-pressed=\{active\?\.id === ch\.id\}/)
  assert.doesNotMatch(source, /<div key=\{ch\.id\} onClick=/)
})

test('mobile channel-list failures remain visible in list mode', () => {
  const channelList = section('<div className="chat-channel-list">', '\n      <div className="chat-conversation">')

  assert.match(channelList, /error && !active/)
  assert.match(channelList, /role="alert"/)
  assert.match(source, /active && error/)
})
