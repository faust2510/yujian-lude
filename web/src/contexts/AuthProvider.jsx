import { useCallback, useEffect, useState } from 'react'
import { auth } from '../api/client'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading

  const refreshMe = useCallback(async () => {
    const r = await auth.me()
    setUser(r.data.user)
    return r.data.user
  }, [])

  useEffect(() => {
    refreshMe()
      .catch(() => setUser(null))
  }, [refreshMe])

  const login = async (email, password) => {
    const r = await auth.login({ email, password })
    setUser(r.data.user)
    return r.data.user
  }

  const register = async (email, password, nickname) => {
    const r = await auth.register({ email, password, nickname })
    setUser(r.data.user)
    return r.data.user
  }

  const logout = async () => {
    await auth.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}
