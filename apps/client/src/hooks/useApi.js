import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import api from '../lib/api.js'

export function useApi() {
  const { user, setAuth, clearAuth } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handleTokenRefresh = (e) => {
      // Preserve the current user object, just update the token
      setAuth(e.detail, user)
    }

    const handleLogout = () => {
      clearAuth()
      navigate('/login')
    }

    window.addEventListener('auth:token-refreshed', handleTokenRefresh)
    window.addEventListener('auth:logout', handleLogout)

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefresh)
      window.removeEventListener('auth:logout', handleLogout)
    }
  }, [user, setAuth, clearAuth, navigate])

  return api
}
