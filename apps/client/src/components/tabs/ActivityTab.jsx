import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../../lib/api.js'
import LoadingSpinner from '../LoadingSpinner.jsx'
import EmptyState from '../EmptyState.jsx'
import ErrorBanner from '../ErrorBanner.jsx'

const ACTION_LABELS = {
  EXPENSE_ADDED: { icon: '💸', label: 'added an expense' },
  EXPENSE_EDITED: { icon: '✏️', label: 'edited an expense' },
  EXPENSE_DELETED: { icon: '🗑️', label: 'deleted an expense' },
  MEMBER_ADDED: { icon: '👤', label: 'joined the group' },
  MEMBER_REMOVED: { icon: '👤', label: 'left the group' },
  SETTLEMENT_RECORDED: { icon: '💰', label: 'recorded a settlement' },
}

function ActivityRow({ entry }) {
  const actor = entry.actorUserId?.name ?? entry.actorUserId?.email ?? 'Someone'
  const { icon, label } = ACTION_LABELS[entry.type] ?? { icon: '📋', label: entry.type }

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <span className="text-lg mt-0.5" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{actor}</span> {label}
        </p>
        {entry.metadata?.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            "{entry.metadata.description}"
          </p>
        )}
      </div>
      <span className="text-xs text-slate-400 shrink-0 mt-0.5">
        {new Date(entry.createdAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </span>
    </div>
  )
}

const PAGE_SIZE = 20

export default function ActivityTab({ groupId, socket }) {
  const [feed, setFeed] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Track IDs we've already seen to avoid duplicates from socket + fetch
  const seenIds = useRef(new Set())

  const fetchActivity = useCallback(
    (targetPage = page) => {
      setLoading(true)
      api
        .get(`/groups/${groupId}/activity`, {
          params: { page: targetPage, pageSize: PAGE_SIZE },
        })
        .then((res) => {
          const { data, total } = res.data
          setFeed(data)
          setTotal(total)
          seenIds.current = new Set(data.map((e) => e._id))
          setError('')
        })
        .catch((err) =>
          setError(err.response?.data?.message?.[0] ?? 'Failed to load activity'),
        )
        .finally(() => setLoading(false))
    },
    [groupId, page],
  )

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const handleNewActivity = (entry) => {
      // Only prepend if we're on page 1 to keep pagination consistent
      if (page !== 1) return
      if (seenIds.current.has(entry._id)) return
      seenIds.current.add(entry._id)
      setFeed((prev) => [entry, ...prev])
      setTotal((t) => t + 1)
    }

    const handleReconnect = () => {
      // On reconnect go back to page 1 and refetch to catch anything missed
      setPage(1)
      fetchActivity(1)
    }

    socket.on('activity:new', handleNewActivity)
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('activity:new', handleNewActivity)
      socket.off('connect', handleReconnect)
    }
  }, [socket, page, fetchActivity])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const goToPage = (p) => {
    setPage(p)
    fetchActivity(p)
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <LoadingSpinner text="Loading activity…" />
      ) : feed.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions like adding expenses or recording settlements will appear here."
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {feed.map((entry) => (
              <ActivityRow key={entry._id} entry={entry} />
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{' '}
                {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
