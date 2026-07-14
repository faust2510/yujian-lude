import { useEffect, useState } from 'react'
import { coursePastorReviews, pastorCert, relationshipReviews } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function Pastor() {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({
    church_name: '', presbytery: '', ordination_info: '', contact: '', statement: ''
  })
  const [msg, setMsg] = useState('')
  const [reviews, setReviews] = useState([])
  const [reviewMsg, setReviewMsg] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewing, setReviewing] = useState({})
  const [reviewNotes, setReviewNotes] = useState({})
  const [relationshipQueue, setRelationshipQueue] = useState([])
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const [relationshipMsg, setRelationshipMsg] = useState('')
  const [relationshipBusy, setRelationshipBusy] = useState('')

  useEffect(() => {
    pastorCert.status().then(r => setStatus(r.data)).catch(() => setStatus({ certification: null }))
  }, [])

  useEffect(() => {
    setRelationshipLoading(true)
    relationshipReviews.list()
      .then(r => setRelationshipQueue(r.data.reviews || []))
      .catch(err => setRelationshipMsg(err.response?.data?.error || '关系确认待办加载失败'))
      .finally(() => setRelationshipLoading(false))
  }, [])

  const canReview = user?.role === 'pastor' || user?.role === 'admin'

  useEffect(() => {
    setReviewLoading(true)
    coursePastorReviews.list()
      .then(r => setReviews(r.data.reviews || []))
      .catch(err => setReviewMsg(err.response?.data?.error || '课程确认待办加载失败'))
      .finally(() => setReviewLoading(false))
  }, [])

  const reviewCourse = async (id, action) => {
    const note = (reviewNotes[id] || '').trim()
    if (action === 'reject' && !note) {
      setReviewMsg('请先填写退回原因')
      return
    }
    setReviewing(current => ({...current, [id]: true}))
    setReviewMsg('')
    try {
      await coursePastorReviews.review(id, action, note)
      setReviews(items => items.filter(item => item.id !== id))
      setReviewMsg(action === 'approve' ? '课程确认已通过' : '课程确认已退回')
    } catch (error) {
      setReviewMsg(error.response?.data?.error || '课程确认操作失败')
    } finally {
      setReviewing(current => ({...current, [id]: false}))
    }
  }

  const approveRelationship = async (item) => {
    const key = `${item.relationship_id}-${item.side}`
    setRelationshipBusy(key)
    setRelationshipMsg('')
    try {
      await relationshipReviews.approve(item.relationship_id, item.side)
      setRelationshipQueue(current => current.filter(
        review => review.relationship_id !== item.relationship_id
      ))
      setRelationshipMsg('该侧关系确认已通过')
    } catch (error) {
      setRelationshipMsg(error.response?.data?.error || '关系确认操作失败')
    } finally {
      setRelationshipBusy('')
    }
  }

  const submit = async () => {
    if (!form.church_name || !form.contact) return setMsg('教会和联系方式为必填')
    try {
      await pastorCert.apply({
        church_name: form.church_name,
        denomination: form.presbytery,
        ordination_info: form.ordination_info,
        contact_email: form.contact,
        statement: form.statement,
      })
      setMsg('已提交，等待管理员审核')
      pastorCert.status().then(r => setStatus(r.data)).catch(() => {})
    } catch (e) {
      setMsg(e.response?.data?.error || '提交失败，请重试')
    }
  }

  const isPastor = user?.role === 'pastor'
  const certState = status?.certification?.state

  return (
    <>
      <h1 className="page-title">引荐与牧者工作台</h1>
      <p className="page-sub">处理与你有关的课程与关系确认；牧者也可在这里申请认证</p>

      {isPastor && (
        <div className="card" style={{background:'#F0FAF4',border:'1px solid #B8E0C8'}}>
          <span className="badge badge-green">已认证牧者</span>
          <p style={{fontSize:14,marginTop:8,color:'var(--legacy-muted)'}}>
            你可以在用户的信仰档案中接收背书请求、为关系确认对接、撰写牧者介绍信。
          </p>
        </div>
      )}

      {(canReview || relationshipLoading || relationshipQueue.length > 0 || relationshipMsg) && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:4}}>关系确认待办</h3>
          <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>
            只处理由已验证背书分配给你的那一侧；双方关系参与者不能自行审核。
          </p>
          {relationshipLoading && <div style={{fontSize:13,color:'var(--legacy-muted)'}}>待办加载中…</div>}
          {!relationshipLoading && relationshipQueue.length === 0 && <div style={{fontSize:13,color:'var(--legacy-muted)'}}>暂无待确认关系。</div>}
          {relationshipQueue.map(item => {
            const key = `${item.relationship_id}-${item.side}`
            return (
              <div key={key} style={{borderTop:'1px solid var(--border)',padding:'14px 0'}}>
                <div style={{fontWeight:700,fontSize:14}}>
                  {item.subject_nickname || '待审核用户'} · 与 {item.partner_nickname || '对方'} 的关系
                </div>
                <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>
                  审核侧：{item.side === 'user_a' ? '甲方' : '乙方'} · {item.endorsement_name || '管理员核验'}
                  {' · '}{item.endorsement_kind === 'pastor' ? '牧者' : '引荐人'}
                </div>
                {item.endorsement_church && (
                  <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>{item.endorsement_church}</div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={relationshipBusy === key}
                  onClick={() => approveRelationship(item)}
                  style={{marginTop:10}}
                >
                  {relationshipBusy === key ? '确认中…' : '确认该侧'}
                </button>
              </div>
            )
          })}
          {relationshipMsg && (
            <div className={relationshipMsg.includes('失败') || relationshipMsg.includes('不能') ? 'error-msg' : 'success-msg'}>
              {relationshipMsg}
            </div>
          )}
        </div>
      )}

      {(canReview || reviewLoading || reviews.length > 0) && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:4}}>课程引荐确认待办</h3>
          <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>
            核对学员已通过的深度婚姻课程关键节点，并确认是否正式结课。
          </p>
          {reviewLoading && <div style={{fontSize:13,color:'var(--legacy-muted)'}}>待办加载中…</div>}
          {!reviewLoading && reviews.length === 0 && <div style={{fontSize:13,color:'var(--legacy-muted)'}}>暂无待确认课程。</div>}
          {reviews.map(item => (
            <div key={item.id} style={{borderTop:'1px solid var(--border)',padding:'14px 0'}}>
              <div style={{fontWeight:700,fontSize:14}}>{item.nickname || '未命名学员'} · {item.course_title}</div>
              <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>{item.church_name || '未填写教会'}</div>
              <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>
                引荐关系：{item.endorsement_name || '管理员核验'} · {item.endorsement_kind === 'pastor' ? '牧者' : '引荐人'}
              </div>
              <div style={{fontSize:12,color:'var(--legacy-muted)',marginTop:4}}>
                结课考试：{item.exam_passed ? `已通过 ${item.exam_score}` : '未通过或无记录'} · 已读 {item.units_done || 0} 单元
              </div>
              {item.requested_note && <p style={{fontSize:13,lineHeight:1.6,marginTop:8}}>{item.requested_note}</p>}
              <label style={{display:'grid',gap:6,fontSize:13,fontWeight:600,marginTop:10}}>
                审核备注 / 退回原因
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={reviewNotes[item.id] || ''}
                  onChange={event => setReviewNotes(current => ({...current, [item.id]: event.target.value}))}
                  placeholder="退回时必须说明需要补充的内容"
                  style={{width:'100%',border:'1px solid var(--border)',borderRadius:8,padding:10,fontFamily:'inherit',fontSize:14,resize:'vertical'}}
                />
              </label>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button className="btn btn-primary" disabled={!!reviewing[item.id]} onClick={() => reviewCourse(item.id, 'approve')}>确认通过</button>
                <button className="btn btn-outline" disabled={!!reviewing[item.id]} onClick={() => reviewCourse(item.id, 'reject')}>退回补充</button>
              </div>
            </div>
          ))}
          {reviewMsg && <div className={reviewMsg.includes('失败') || reviewMsg.includes('原因') ? 'error-msg' : 'success-msg'}>{reviewMsg}</div>}
        </div>
      )}

      {!canReview && certState === 'pending' && (
        <div className="card" style={{background:'#FFF8E8',border:'1px solid #F0D896'}}>
          <span className="badge badge-soft">审核中</span>
          <p style={{fontSize:14,marginTop:8,color:'var(--legacy-muted)'}}>你的牧者认证申请正在等待管理员审核。</p>
        </div>
      )}

      {!canReview && certState !== 'pending' && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:4}}>申请牧者认证</h3>
          <p style={{fontSize:13,color:'var(--legacy-muted)',marginBottom:16}}>
            提交以下信息，管理员审核通过后账号升级为牧者。
          </p>
          {[
            { k:'church_name', l:'所牧养的教会 / 堂会' },
            { k:'presbytery', l:'所属区会 / 宗派' },
            { k:'ordination_info', l:'按立 / 教牧身份说明' },
            { k:'contact', l:'联系方式' },
          ].map(f => (
            <div className="field" key={f.k}>
              <label>{f.l}</label>
              <input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} />
            </div>
          ))}
          <div className="field">
            <label>简要见证 / 事奉说明</label>
            <textarea rows={3} value={form.statement}
              onChange={e=>setForm(p=>({...p,statement:e.target.value}))}
              style={{width:'100%',border:'1px solid var(--border)',borderRadius:8,padding:10,fontFamily:'inherit',fontSize:14}} />
          </div>
          {msg && <div style={{fontSize:13,color: msg.includes('提交') ? '#17a34a' : 'var(--brand)',marginBottom:8}}>{msg}</div>}
          <button className="btn btn-primary" onClick={submit}>提交认证申请</button>
        </div>
      )}
    </>
  )
}
