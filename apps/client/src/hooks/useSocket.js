import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { connectSocket, disconnectSocket, getSocket } from '../lib/socketClient.js'
import { getAccessToken } from '../contexts/AuthContext.jsx'

export function useSocket() {
  const { user } = useAuth()
  const socketRef = useRef(null)

  // Connect / reconnect with the current access token
  const connect = () => {
    const token = getAccessToken()
    if (!token) return
    const sock = connectSocket(token)
    socketRef.current = sock
    sock.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message)
    })
  }

  useEffect(() => {
    if (!user) {
      disconnectSocket()
      socketRef.current = null
      return
    }

    connect()

    // When the access token silently refreshes, reconnect the socket so it
    // authenticates with the new token (the old token on the existing socket
    // would fail on the next server-side verification after expiry).
    const handleTokenRefreshed = () => {
      connect()
    }

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed)

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed)
      disconnectSocket()
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return socketRef.current || getSocket()
}
