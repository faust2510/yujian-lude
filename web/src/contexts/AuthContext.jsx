import { createContext, useContext, useState, useEffect } from 'react'
import { auth } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    auth.me()
      .then(r => setUser(r.data.user))
      .catch(() => setUser(null))
  }, [])

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
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
