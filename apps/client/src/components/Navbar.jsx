import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import api from '../lib/api.js'

export default function Navbar() {
  const { user, clearAuth } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (_) {
      // ignore errors — always clear local state
    }
    clearAuth()
    navigate('/login')
  }

  if (!user) return null

  return (
    <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="font-bold text-emerald-600 text-lg">
          SplitMate
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? 'text-emerald-600 font-medium' : 'text-slate-600 hover:text-slate-900'
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/groups"
            className={({ isActive }) =>
              isActive ? 'text-emerald-600 font-medium' : 'text-slate-600 hover:text-slate-900'
            }
          >
            Groups
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              isActive ? 'text-emerald-600 font-medium' : 'text-slate-600 hover:text-slate-900'
            }
          >
            History
          </NavLink>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-600">{user.email}</span>
        <button
          onClick={handleLogout}
          className="text-slate-500 hover:text-red-500 transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
