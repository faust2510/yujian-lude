import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { auth } from '../api/client'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMsg, setForgotMsg] = useState('')
  const [resetLink, setResetLink] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || '登录失败，请重试')
    } finally { setLoading(false) }
  }

  const forgot = async (e) => {
    e.preventDefault()
    setForgotLoading(true)
    setForgotMsg('')
    setResetLink('')
    try {
      const r = await auth.forgotPassword(forgotEmail)
      setForgotMsg('如果邮箱已注册，重置链接会发送到该邮箱')
      if (r.data.devToken) setResetLink(`/reset-password?token=${r.data.devToken}`)
    } catch (err) {
      setForgotMsg(err.response?.data?.error || '请求失败，请稍后重试')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 160, height: 160,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,123,107,0.08) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <h1 style={{ position: 'relative', zIndex: 1 }}>遇见路得</h1>
        <p style={{ position: 'relative', zIndex: 1 }}>登录你的账号继续</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>邮箱</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required />
          </div>
          <div className="field">
            <label>密码</label>
            <input type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary btn-block" style={{marginTop:20}} disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
        <p style={{textAlign:'center',marginTop:16,fontSize:13,color:'var(--muted)'}}>
          还没有账号？<Link to="/register" style={{color:'var(--brand)'}}>立即注册</Link>
        </p>
        <p style={{textAlign:'center',marginTop:8,fontSize:13}}>
          <button type="button" className="btn btn-outline" style={{fontSize:12,padding:'4px 12px'}} onClick={()=>setForgotOpen(v=>!v)}>
            忘记密码
          </button>
        </p>
        {forgotOpen && (
          <form onSubmit={forgot} style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div className="field">
              <label>注册邮箱</label>
              <input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} required />
            </div>
            <button className="btn btn-outline btn-block" disabled={forgotLoading}>{forgotLoading ? '发送中…' : '发送重置链接'}</button>
            {forgotMsg && <div className={forgotMsg.includes('失败') ? 'error-msg' : 'success-msg'}>{forgotMsg}</div>}
            {resetLink && <div className="success-msg"><Link to={resetLink}>调试重置链接</Link></div>}
          </form>
        )}
      </div>
    </div>
  )
}
