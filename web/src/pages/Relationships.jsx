import { useEffect, useState } from 'react'
import { relationships } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function Relationships() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    relationships.list()
      .then(r => setData(r.data))
      .catch(() => setData({ relationship: null }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const stageLabel = (rel) => {
    if (rel.state === 'confirmed') return { text: '恋情确认期', cls: 'badge-green' }
    if (rel.state === 'ended') return { text: '已结束', cls: '' }
    if (rel.state === 'pastoral_review') return { text: '牧者审核中', cls: 'badge-soft' }
    return { text: '了解期', cls: 'badge-soft' }
  }

  return (
    <>
      <h1 className="page-title">我的关系</h1>
      <p className="page-sub">匹配后先了解 → 双方修完必修课并通过考试 → 双方牧者点头 → 确立关系</p>

      {loading && <div style={{color:'var(--muted)',padding:20,fontSize:14}}>加载中…</div>}

      {!loading && !data?.relationship && (
        <div className="card" style={{textAlign:'center',padding:40,color:'var(--muted)'}}>
          <div style={{fontSize:18,marginBottom:8,color:'var(--fg)'}}>还没有进行中的关系</div>
          <div style={{fontSize:14}}>先去匹配页表达意向，双方互相心动后开启了解通道</div>
        </div>
      )}

      {data?.relationship && (() => {
        const rel = data.relationship
        const stage = stageLabel(rel)
        const isA = rel.user_a === user?.id
        const myExam = isA ? rel.user_a_exam_passed : rel.user_b_exam_passed
        const otherExam = isA ? rel.user_b_exam_passed : rel.user_a_exam_passed
        const myPastor = isA ? rel.pastor_a_approved : rel.pastor_b_approved
        const otherPastor = isA ? rel.pastor_b_approved : rel.pastor_a_approved
        return (
          <div className="card" key={rel.id}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontFamily:'var(--font-serif)',fontSize:16}}>与 {rel.other_nickname || '对方'}</div>
              <span className={`badge ${stage.cls}`}>{stage.text}</span>
            </div>

            <div style={{display:'grid',gap:8,fontSize:13}}>
              <Step ok={myExam} label="我已通过婚姻必修课考试" />
              <Step ok={otherExam} label="对方已通过婚姻必修课考试" />
              <Step ok={myPastor} label="我的牧者已确认" />
              <Step ok={otherPastor} label="对方牧者已确认" />
            </div>

            {rel.state !== 'confirmed' && rel.state !== 'ended' && (
              <div style={{marginTop:14,display:'flex',gap:8,flexDirection:'column'}}>
                {!myExam && (
                  <span style={{fontSize:13,color:'var(--muted)'}}>先到课程页修完必修课并通过考试，才能发起关系确认</span>
                )}
                {myExam && rel.state === 'chatting' && (
                  <button className="btn btn-primary" style={{fontSize:13,alignSelf:'flex-start'}}
                    onClick={() => relationships.examConfirm(rel.id).then(load).catch(()=>{})}>
                    确认我已完成课程考试
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </>
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
