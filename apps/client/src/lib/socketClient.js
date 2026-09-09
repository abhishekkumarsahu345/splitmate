import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  return socket
}

// In dev the Vite proxy forwards /socket.io → localhost:3000.
// In production (Vercel) there is no proxy — connect directly to the Render backend.
const SOCKET_URL = import.meta.env.VITE_API_URL || '/'

export function connectSocket(accessToken) {
  if (socket) {
    socket.disconnect()
  }
  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
