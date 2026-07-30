import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { auth } from '../api/client'
import authHero from '../assets/brand/meet-ruth-auth.webp'

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
      <section className="auth-shell" aria-label="登录遇见路得">
        <div className="auth-visual">
          <img src={authHero} alt="两位成年人傍晚在花园中认真交谈" width="1200" height="1600" />
          <div className="auth-visual-copy">
            <span>遇见路得</span>
            <h2>先真实地成为自己，<br />再认真地遇见彼此。</h2>
            <p>资料审核、匿名匹配、双方确认后开放书信。</p>
          </div>
        </div>
        <div className="auth-card auth-card-elevated">
        <div className="auth-brand-row" aria-label="遇见路得">
          <img className="auth-brand-mark" src="/meet-ruth-butterfly-mark.png" alt="" width="42" height="42" />
          <span><strong>遇见路得</strong><small>在真实中相遇</small></span>
        </div>
        <h1>欢迎回来</h1>
        <p>登录后继续今天的关系预备。</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">邮箱</label>
            <input id="login-email" type="email" autoComplete="email" placeholder="name@example.com" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required />
          </div>
          <div className="field">
            <label htmlFor="login-password">密码</label>
            <input id="login-password" type="password" autoComplete="current-password" placeholder="输入密码" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
        <p className="auth-register-link">
          还没有账号？<Link to="/register">立即注册</Link>
        </p>
        <p className="auth-forgot-link">
          <button type="button" className="auth-text-button" onClick={()=>setForgotOpen(v=>!v)}>
            忘记密码
          </button>
        </p>
        {forgotOpen && (
          <form className="auth-reset-form" onSubmit={forgot}>
            <div className="field">
              <label htmlFor="forgot-email">注册邮箱</label>
              <input id="forgot-email" type="email" autoComplete="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} required />
            </div>
            <button className="btn btn-outline btn-block" disabled={forgotLoading}>{forgotLoading ? '发送中…' : '发送重置链接'}</button>
            {forgotMsg && <div className={forgotMsg.includes('失败') ? 'error-msg' : 'success-msg'}>{forgotMsg}</div>}
            {resetLink && <div className="success-msg"><Link to={resetLink}>调试重置链接</Link></div>}
          </form>
        )}
        <div className="auth-trust-note">敏感信息不会公开展示。匹配与沟通均遵循双方确认。</div>
        </div>
      </section>
    </div>
  )
}
