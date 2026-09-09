import { useState } from 'react'
import api from '../../lib/api.js'

export default function AddMemberModal({ groupId, onClose, onSuccess }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)   // null = not searched yet, [] = no results
  const [selectedUser, setSelectedUser] = useState(null)
  const [adding, setAdding] = useState(false)
  const [serverError, setServerError] = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setServerError('')
    setResults(null)
    setSelectedUser(null)
    try {
      const res = await api.get('/users/search', { params: { q: query.trim() } })
      setResults(res.data)
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedUser) return
    setAdding(true)
    setServerError('')
    try {
      await api.post(`/groups/${groupId}/members`, { userId: selectedUser._id })
      onSuccess?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            Add Member
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-500">
            Search by name or email. The person must already have a SplitMate account — ask them to sign up first if they haven't.
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter name or email…"
              autoFocus
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {searching ? '…' : 'Search'}
            </button>
          </form>

          {/* Results */}
          {results !== null && (
            <>
              {results.length === 0 ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium">No account found for "{query}"</p>
                  <p className="text-xs mt-0.5 text-amber-700">
                    They need to create a SplitMate account before you can add them.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {results.map((u) => (
                    <button
                      key={u._id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left ${
                        selectedUser?._id === u._id ? 'bg-emerald-50 border-l-2 border-emerald-500' : ''
                      }`}
                    >
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm shrink-0">
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {u.name || u.email}
                        </p>
                        {u.name && (
                          <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        )}
                      </div>
                      {selectedUser?._id === u._id && (
                        <span className="ml-auto text-emerald-600 text-sm font-medium shrink-0">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {serverError && (
            <p className="text-red-500 text-sm" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 text-slate-700 py-2 text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedUser || adding}
              className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {adding ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
