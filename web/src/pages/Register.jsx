import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', nickname: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('密码至少 8 位'); return }
    setLoading(true); setError('')
    try {
      await register(form.email, form.password, form.nickname)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || '注册失败，请重试')
    } finally { setLoading(false) }
  }

  const set = key => e => setForm(p => ({...p, [key]: e.target.value}))

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 160, height: 160,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,123,107,0.08) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <h1 style={{ position: 'relative', zIndex: 1 }}>加入遇见路得</h1>
        <p style={{ position: 'relative', zIndex: 1 }}>用邮箱创建账号，开始你的婚姻装备之旅</p>
        <form onSubmit={submit}>
          <div className="field"><label>昵称（选填）</label>
            <input value={form.nickname} onChange={set('nickname')} placeholder="你希望别人怎么称呼你" />
          </div>
          <div className="field"><label>邮箱</label>
            <input type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field"><label>密码（至少 8 位）</label>
            <input type="password" value={form.password} onChange={set('password')} required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary btn-block" style={{marginTop:20}} disabled={loading}>
            {loading ? '注册中…' : '创建账号'}
          </button>
        </form>
        <p style={{textAlign:'center',marginTop:16,fontSize:13,color:'var(--muted)'}}>
          已有账号？<Link to="/login" style={{color:'var(--brand)'}}>返回登录</Link>
        </p>
      </div>
    </div>
  )
}
