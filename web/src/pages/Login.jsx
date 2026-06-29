import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      </div>
    </div>
  )
}
