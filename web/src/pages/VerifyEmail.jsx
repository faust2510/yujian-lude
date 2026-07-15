import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { auth } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const { refreshMe } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', ok: false, notice: '' })
  const startedToken = useRef('')
  const verificationRequest = useRef(0)
  const token = params.get('token') || ''

  useEffect(() => {
    if (!token) {
      verificationRequest.current += 1
      setState({ loading: false, error: '验证链接缺少 token', ok: false, notice: '' })
      return
    }
    if (startedToken.current === token) return
    startedToken.current = token
    const requestId = ++verificationRequest.current

    const verify = async () => {
      try {
        await auth.verifyEmail(token)
        if (requestId !== verificationRequest.current) return
        setState({ loading: false, error: '', ok: true, notice: '' })
        try {
          await refreshMe?.()
        } catch {
          if (requestId !== verificationRequest.current) return
          setState({ loading: false, error: '', ok: true, notice: '邮箱已验证，账户状态稍后刷新' })
        }
      } catch (err) {
        if (requestId !== verificationRequest.current) return
        setState({ loading: false, error: err.response?.data?.error || '邮箱验证失败', ok: false, notice: '' })
      }
    }

    verify()
  }, [refreshMe, token])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>邮箱验证</h1>
        {state.loading && <p>正在验证你的邮箱…</p>}
        {!state.loading && state.ok && <div className="success-msg">邮箱已验证</div>}
        {!state.loading && state.notice && <div className="success-msg">{state.notice}</div>}
        {!state.loading && state.error && <div className="error-msg">{state.error}</div>}
        <p style={{textAlign:'center',marginTop:16,fontSize:13}}>
          <Link to="/" style={{color:'var(--brand)'}}>回到个人中心</Link>
        </p>
      </div>
    </div>
  )
}
