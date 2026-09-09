import { createContext, useCallback, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Access token is stored in module-level variable (NOT localStorage/sessionStorage)
let _accessToken = null

export function getAccessToken() {
  return _accessToken
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // { id, email }

  const setAuth = useCallback((token, userData) => {
    _accessToken = token
    setUser(userData)
  }, [])

  const clearAuth = useCallback(() => {
    _accessToken = null
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
