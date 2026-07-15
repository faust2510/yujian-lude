import { useEffect, useRef, useState } from 'react'
import { chat, pastorLetters, relationships } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function stageLabel(rel) {
  if (rel.state === 'confirmed') return { text: '已确立', cls: 'badge-green' }
  if (rel.state === 'ended') return { text: '已结束', cls: 'badge-gray' }
  if (rel.state === 'pastoral_review') return { text: '属灵审核中', cls: 'badge-soft' }
  if (rel.state === 'mutual_confirmed') return { text: '双方已确认', cls: 'badge-soft' }
  if (rel.state === 'relationship_requested') return { text: '等待对方确认', cls: 'badge-yellow' }
  return { text: '了解期', cls: 'badge-soft' }
}

export default function Relationships() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [channels, setChannels] = useState([])
  const [partnerLetters, setPartnerLetters] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const relationshipLoadRequest = useRef(0)
  const relationshipActionRequest = useRef(0)

  const load = async () => {
    const requestId = ++relationshipLoadRequest.current
    setLoading(true)
    setError('')
    setPartnerLetters({})
    try {
      const [relResult, chatResult] = await Promise.allSettled([relationships.list(), chat.channels()])
      const nextChannels = chatResult.status === 'fulfilled' ? chatResult.value.data.channels || [] : []
      if (relResult.status === 'rejected') {
        if (requestId !== relationshipLoadRequest.current) return
        setData(null)
        setChannels(nextChannels)
        setError(relResult.reason?.response?.data?.error || '关系信息加载失败')
        return
      }
      const rel = relResult.value
      const relationship = rel.data?.relationship
      let loadError = chatResult.status === 'rejected'
        ? chatResult.reason?.response?.data?.error || '私聊对象加载失败，请稍后重试'
        : ''

      const targetIds = [...new Set([
        ...nextChannels.map(channel => channel.other_id),
        relationship?.partner_id,
      ].filter(Boolean))]
      const letterResults = await Promise.allSettled(targetIds.map(async targetId => {
        const letterRes = await pastorLetters.forMatch(targetId)
        return [targetId, letterRes.data.letter || null]
      }))
      const nextLetters = {}
      let letterError = ''
      for (const result of letterResults) {
        if (result.status === 'fulfilled') {
          const [targetId, letter] = result.value
          if (letter) nextLetters[targetId] = letter
          continue
        }
        const status = result.reason?.response?.status
        if (![403, 404].includes(status)) {
          letterError = result.reason?.response?.data?.error || '牧者介绍信加载失败，请稍后重试'
        }
      }
      if (requestId !== relationshipLoadRequest.current) return
      setData(rel.data)
      setChannels(nextChannels)
      setPartnerLetters(nextLetters)
      if (letterError) loadError = letterError
      if (loadError) setError(loadError)
    } catch (err) {
      if (requestId !== relationshipLoadRequest.current) return
      setError(err.response?.data?.error || '关系信息加载失败')
      setData(null)
      setChannels([])
    } finally {
      if (requestId === relationshipLoadRequest.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const runAction = async (key, action, success) => {
    const requestId = ++relationshipActionRequest.current
    setBusy(key)
    setMsg('')
    setError('')
    try {
      await action()
      if (requestId !== relationshipActionRequest.current) return
      setMsg(success)
      await load()
    } catch (err) {
      if (requestId !== relationshipActionRequest.current) return
      setError(err.response?.data?.error || '操作失败，请稍后重试')
    } finally {
      if (requestId === relationshipActionRequest.current) setBusy('')
    }
  }

  const startRelationship = (partnerId) => runAction(
    `start-${partnerId}`,
    () => relationships.initiate(partnerId),
    '关系确认流程已开启'
  )

  const requestConfirm = (id) => runAction(
    `confirm-${id}`,
    () => relationships.requestConfirmation(id),
    '你的确认已提交'
  )

  const endRel = (id) => {
    const reason = window.prompt('请简短说明结束原因（可留空）')
    if (reason === null) return
    return runAction(`end-${id}`, () => relationships.end(id, reason), '关系已结束')
  }

  const activeChannels = channels.filter(channel => channel.other_id)
  const visiblePartnerLetters = Object.entries(partnerLetters).filter(([, letter]) => (
    letter.pastor_name || letter.family_note || letter.faith_note ||
    letter.spiritual_note || letter.church_life_note
  ))
  const partnerNameFor = targetId => {
    const channel = channels.find(item => item.other_id === targetId)
    if (channel?.other_nickname) return channel.other_nickname
    if (data?.relationship?.partner_id === targetId) {
      return data.relationship.partner_nickname || data.relationship.other_nickname || '对方'
    }
    return '对方'
  }

  return (
    <>
      <h1 className="page-title">我的关系</h1>
      <p className="page-sub">互相表达意向后进入了解期；双方确认后，由各自的引荐人或管理员完成属灵审核。</p>

      {loading && <div style={{color:'var(--legacy-muted)',padding:20,fontSize:14}}>加载中…</div>}
      {msg && <div className="success-msg" style={{marginBottom:12}}>{msg}</div>}
      {error && (
        <div className="error-msg" style={{marginBottom:12}}>
          {error} <button className="btn btn-outline" onClick={load}>重试</button>
        </div>
      )}

      {!loading && data && !data.relationship && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:8}}>还没有进行中的关系</h3>
          <p style={{fontSize:14,color:'var(--legacy-muted)',marginBottom:16}}>可以从已经互相表达意向的私聊对象中，开启关系确认流程。</p>
          {activeChannels.length === 0 && <div className="muted-small">暂无互相匹配的私聊对象。</div>}
          <div className="relationship-channel-list">
            {activeChannels.map(channel => (
              <div className="relationship-channel" key={channel.id}>
                <div>
                  <strong>{channel.other_nickname || '对方'}</strong>
                  <span>{channel.last_msg || '尚未开始对话'}</span>
                </div>
                <button className="btn btn-primary" disabled={busy === `start-${channel.other_id}`} onClick={() => startRelationship(channel.other_id)}>
                  {busy === `start-${channel.other_id}` ? '开启中…' : '开启关系确认'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.relationship && (
        <RelationshipCard
          rel={data.relationship}
          user={user}
          busy={busy}
          onConfirm={requestConfirm}
          onEnd={endRel}
        />
      )}

      {visiblePartnerLetters.map(([targetId, letter]) => (
        <div className="card" key={targetId}>
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:12}}>{partnerNameFor(targetId)}的牧者介绍信</h3>
          {letter.pastor_name && <LetterSection label="介绍牧者">{letter.pastor_name}</LetterSection>}
          {letter.family_note && <LetterSection label="家庭情况">{letter.family_note}</LetterSection>}
          {letter.faith_note && <LetterSection label="信仰情况">{letter.faith_note}</LetterSection>}
          {letter.spiritual_note && <LetterSection label="属灵生命">{letter.spiritual_note}</LetterSection>}
          {letter.church_life_note && <LetterSection label="教会生活">{letter.church_life_note}</LetterSection>}
        </div>
      ))}
    </>
  )
}

function RelationshipCard({ rel, user, busy, onConfirm, onEnd }) {
  const stage = stageLabel(rel)
  const isA = rel.user_a === user?.id
  const myConfirmed = isA ? rel.user_a_confirmed : rel.user_b_confirmed
  const otherConfirmed = isA ? rel.user_b_confirmed : rel.user_a_confirmed
  const myPastor = isA ? rel.pastor_a_approved : rel.pastor_b_approved
  const otherPastor = isA ? rel.pastor_b_approved : rel.pastor_a_approved
  const canConfirm = !myConfirmed && !['confirmed', 'ended'].includes(rel.state)
  const partnerName = rel.partner_nickname || rel.other_nickname || '对方'

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
        <div>
          <div style={{fontFamily:'var(--font-serif)',fontSize:16}}>与 {partnerName}</div>
          <div className="muted-small">关系 ID：{rel.id}</div>
        </div>
        <span className={`badge ${stage.cls}`}>{stage.text}</span>
      </div>

      <div className="relationship-steps">
        <Step ok={myConfirmed} label="我已确认愿意进入关系确认" />
        <Step ok={otherConfirmed} label="对方已确认愿意进入关系确认" />
        <Step ok={myPastor} label="我方引荐人 / 管理员已确认" />
        <Step ok={otherPastor} label="对方引荐人 / 管理员已确认" />
      </div>

      <div className="relationship-actions">
        {canConfirm && (
          <button className="btn btn-primary" disabled={busy === `confirm-${rel.id}`} onClick={() => onConfirm(rel.id)}>
            {busy === `confirm-${rel.id}` ? '提交中…' : '确认进入关系流程'}
          </button>
        )}
        {rel.state !== 'ended' && (
          <button className="btn btn-outline" disabled={busy === `end-${rel.id}`} onClick={() => onEnd(rel.id)}>
            结束关系
          </button>
        )}
      </div>
    </div>
  )
}

function LetterSection({ label, children }) {
  return (
    <div style={{marginTop:10}}>
      <div className="muted-small" style={{marginBottom:3}}>{label}</div>
      <div style={{fontSize:14,whiteSpace:'pre-wrap'}}>{children}</div>
    </div>
  )
}

function Step({ ok, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,color:ok?'#1A7A3C':'var(--legacy-muted)'}}>
      <span style={{width:18,height:18,borderRadius:'50%',display:'inline-flex',alignItems:'center',
        justifyContent:'center',fontSize:11,background:ok?'#1A7A3C':'var(--border)',color:'#fff'}}>
        {ok ? '✓' : ''}
      </span>
      {label}
    </div>
  )
}
