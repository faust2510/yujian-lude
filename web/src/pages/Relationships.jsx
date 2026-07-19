import { useEffect, useState } from 'react'
import { chat, relationships } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import useMobileViewport from '../hooks/useMobileViewport'
import RelationshipsMobile from './mobile/RelationshipsMobile'

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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const isMobile = useMobileViewport()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [rel, ch] = await Promise.all([relationships.list(), chat.channels()])
      setData(rel.data)
      setChannels(ch.data.channels || [])
    } catch (err) {
      setError(err.response?.data?.error || '关系信息加载失败')
      setData({ relationship: null })
      setChannels([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const runAction = async (key, action, success) => {
    setBusy(key)
    setMsg('')
    setError('')
    try {
      await action()
      setMsg(success)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || '操作失败，请稍后重试')
    } finally {
      setBusy('')
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

  const approveSide = (id, side) => runAction(
    `approve-${side}`,
    () => relationships.pastorApprove(id, side),
    '审核确认已保存'
  )

  const endRel = (id) => {
    const reason = window.prompt('请简短说明结束原因（可留空）') || ''
    return runAction(`end-${id}`, () => relationships.end(id, reason), '关系已结束')
  }

  const activeChannels = channels.filter(channel => channel.other_id)

  if (isMobile) {
    return <RelationshipsMobile data={data} channels={activeChannels} user={user} loading={loading} busy={busy} message={msg} error={error} onRetry={load} onStart={startRelationship} onConfirm={requestConfirm} onApprove={approveSide} onEnd={endRel} />
  }

  return (
    <>
      <h1 className="page-title">我的关系</h1>
      <p className="page-sub">互相表达意向后进入了解期；双方确认后，由牧者或管理员完成属灵审核。</p>

      {loading && <div style={{color:'var(--muted)',padding:20,fontSize:14}}>加载中…</div>}
      {msg && <div className="success-msg" style={{marginBottom:12}}>{msg}</div>}
      {error && <div className="error-msg" style={{marginBottom:12}}>{error}</div>}

      {!loading && !data?.relationship && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:8}}>还没有进行中的关系</h3>
          <p style={{fontSize:14,color:'var(--muted)',marginBottom:16}}>可以从已经互相表达意向的私聊对象中，开启关系确认流程。</p>
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
          onApprove={approveSide}
          onEnd={endRel}
        />
      )}
    </>
  )
}

function RelationshipCard({ rel, user, busy, onConfirm, onApprove, onEnd }) {
  const stage = stageLabel(rel)
  const isA = rel.user_a === user?.id
  const myConfirmed = isA ? rel.user_a_confirmed : rel.user_b_confirmed
  const otherConfirmed = isA ? rel.user_b_confirmed : rel.user_a_confirmed
  const myPastor = isA ? rel.pastor_a_approved : rel.pastor_b_approved
  const otherPastor = isA ? rel.pastor_b_approved : rel.pastor_a_approved
  const canReview = ['admin', 'pastor'].includes(user?.role)
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
        <Step ok={myPastor} label="我方牧者 / 管理员已确认" />
        <Step ok={otherPastor} label="对方牧者 / 管理员已确认" />
      </div>

      <div className="relationship-actions">
        {canConfirm && (
          <button className="btn btn-primary" disabled={busy === `confirm-${rel.id}`} onClick={() => onConfirm(rel.id)}>
            {busy === `confirm-${rel.id}` ? '提交中…' : '确认进入关系流程'}
          </button>
        )}
        {canReview && rel.user_a_confirmed && rel.user_b_confirmed && rel.state !== 'confirmed' && (
          <>
            <button className="btn btn-outline" disabled={busy === 'approve-user_a' || rel.pastor_a_approved} onClick={() => onApprove(rel.id, 'user_a')}>
              确认甲方属灵审核
            </button>
            <button className="btn btn-outline" disabled={busy === 'approve-user_b' || rel.pastor_b_approved} onClick={() => onApprove(rel.id, 'user_b')}>
              确认乙方属灵审核
            </button>
          </>
        )}
        {!['confirmed', 'ended'].includes(rel.state) && (
          <button className="btn btn-outline" disabled={busy === `end-${rel.id}`} onClick={() => onEnd(rel.id)}>
            结束关系
          </button>
        )}
      </div>
    </div>
  )
}

function Step({ ok, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,color:ok?'#1A7A3C':'var(--muted)'}}>
      <span style={{width:18,height:18,borderRadius:'50%',display:'inline-flex',alignItems:'center',
        justifyContent:'center',fontSize:11,background:ok?'#1A7A3C':'var(--border)',color:'#fff'}}>
        {ok ? '✓' : ''}
      </span>
      {label}
    </div>
  )
}
