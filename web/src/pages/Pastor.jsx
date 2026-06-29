import { useEffect, useState } from 'react'
import { pastorCert } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function Pastor() {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({
    church_name: '', presbytery: '', ordination_info: '', contact: '', statement: ''
  })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    pastorCert.status().then(r => setStatus(r.data)).catch(() => setStatus({ certification: null }))
  }, [])

  const submit = async () => {
    if (!form.church_name || !form.contact) return setMsg('教会和联系方式为必填')
    try {
      await pastorCert.apply({
        church_name: form.church_name,
        denomination: form.presbytery,
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
      <h1 className="page-title">牧者台</h1>
      <p className="page-sub">牧者可为他人做中保、受邀背书、写推荐信 · 单身牧者也能参与匹配</p>

      {isPastor && (
        <div className="card" style={{background:'#F0FAF4',border:'1px solid #B8E0C8'}}>
          <span className="badge badge-green">已认证牧者</span>
          <p style={{fontSize:14,marginTop:8,color:'var(--muted)'}}>
            你可以在用户的信仰档案中接收背书请求、为关系确认对接、撰写牧者介绍信。
          </p>
        </div>
      )}

      {!isPastor && certState === 'pending' && (
        <div className="card" style={{background:'#FFF8E8',border:'1px solid #F0D896'}}>
          <span className="badge badge-soft">审核中</span>
          <p style={{fontSize:14,marginTop:8,color:'var(--muted)'}}>你的牧者认证申请正在等待管理员审核。</p>
        </div>
      )}

      {!isPastor && certState !== 'pending' && (
        <div className="card">
          <h3 style={{fontFamily:'var(--font-serif)',fontSize:16,marginBottom:4}}>申请牧者认证</h3>
          <p style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>
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
