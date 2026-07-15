import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { auth } from '../api/client'
import { Button } from '../components/ui/button'
import { AuthContext } from './AuthContext'

const PUBLIC_ACCOUNT_ROUTES = new Set(['/login', '/register', '/reset-password', '/verify-email'])

export function AuthProvider({ children }) {
  const location = useLocation()
  const [user, setUser] = useState(undefined) // undefined = loading
  const [recoveryError, setRecoveryError] = useState(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const refreshRequest = useRef(0)
  const recoveryBlocksRoute = !PUBLIC_ACCOUNT_ROUTES.has(location.pathname)

  const refreshMe = useCallback(async () => {
    const requestId = ++refreshRequest.current
    try {
      const r = await auth.me()
      const nextUser = r.data.user
      if (requestId !== refreshRequest.current) return nextUser
      setUser(nextUser)
      setRecoveryError(null)
      return nextUser
    } catch (error) {
      if (requestId !== refreshRequest.current) throw error
      if (error?.response?.status === 401) {
        setUser(null)
        setRecoveryError(null)
        return null
      }

      setRecoveryError('认证状态恢复失败，请检查网络后重新尝试。')
      throw error
    }
  }, [])

  useEffect(() => {
    refreshMe().catch(() => undefined)
    return () => { refreshRequest.current += 1 }
  }, [refreshMe])

  const retryRecovery = async () => {
    setIsRetrying(true)
    try {
      await refreshMe()
    } catch {
      // Keep the recovery state visible until a retry succeeds.
    } finally {
      setIsRetrying(false)
    }
  }

  const login = async (email, password) => {
    refreshRequest.current += 1
    const r = await auth.login({ email, password })
    const nextUser = r.data.user
    setUser(nextUser)
    setRecoveryError(null)
    return nextUser
  }

  const register = async (email, password, nickname) => {
    refreshRequest.current += 1
    const r = await auth.register({ email, password, nickname })
    const nextUser = r.data.user
    setUser(nextUser)
    setRecoveryError(null)
    return nextUser
  }

  const logout = async () => {
    refreshRequest.current += 1
    await auth.logout()
    setUser(null)
    setRecoveryError(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshMe }}>
      {recoveryError && recoveryBlocksRoute ? (
        <div className="loading-screen" role="alert">
          <p>{recoveryError}</p>
          <Button type="button" onClick={retryRecovery} disabled={isRetrying}>
            {isRetrying ? '正在重试…' : '重新尝试'}
          </Button>
        </div>
      ) : children}
    </AuthContext.Provider>
  )
}
