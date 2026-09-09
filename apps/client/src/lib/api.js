import axios from 'axios'
import { getAccessToken } from '../contexts/AuthContext.jsx'

// In development the Vite proxy rewrites /api → http://localhost:3000.
// In production (Vercel) there is no proxy, so we use the env var directly.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}`
  : '/api'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send httpOnly refresh_token cookie
})

// Attach bearer token on every request
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// 401 interceptor — attempt one silent refresh then retry
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers['Authorization'] = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        // Update in-memory token via a custom event (AuthContext listens)
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', { detail: data.accessToken }))
        processQueue(null, data.accessToken)
        original.headers['Authorization'] = `Bearer ${data.accessToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        window.dispatchEvent(new CustomEvent('auth:logout'))
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
