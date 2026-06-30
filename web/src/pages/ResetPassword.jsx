import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { auth } from '../api/client'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const token = params.get('token') || ''

  const submit = async (e) => {
    e.preventDefault()
    if (!token) return setMsg('重置链接缺少 token')
    if (form.password.length < 8) return setMsg('新密码至少 8 位')
    if (form.password !== form.confirm) return setMsg('两次密码不一致')
    setLoading(true)
    setMsg('')
    try {
      await auth.resetPassword({ token, new_password: form.password })
      setMsg('密码已重置，请重新登录')
      setForm({ password: '', confirm: '' })
    } catch (err) {
      setMsg(err.response?.data?.error || '重置失败，请重新申请链接')
    } finally {
      setLoading(false)
    }
  }

  const isError = /失败|缺少|不一致|至少|无效|过期/.test(msg)

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>重置密码</h1>
        <p>设置一个新的登录密码</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>新密码</label>
            <input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} required />
          </div>
          <div className="field">
            <label>确认新密码</label>
            <input type="password" value={form.confirm} onChange={e=>setForm(p=>({...p,confirm:e.target.value}))} required />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>{loading ? '重置中…' : '重置密码'}</button>
          {msg && <div className={isError ? 'error-msg' : 'success-msg'}>{msg}</div>}
        </form>
        <p style={{textAlign:'center',marginTop:16,fontSize:13}}>
          <Link to="/login" style={{color:'var(--brand)'}}>返回登录</Link>
        </p>
      </div>
    </div>
  )
}
