import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api.js'
import { formatMoney } from '../lib/formatMoney.js'
import { useSocket } from '../hooks/useSocket.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'

function StatCard({ label, amount, variant = 'neutral' }) {
  const colors = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-600',
    negative: 'text-red-500',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[variant]}`}>{formatMoney(amount ?? 0)}</p>
    </div>
  )
}

function activityLabel(entry) {
  const typeMap = {
    EXPENSE_ADDED: '💸 added an expense',
    EXPENSE_EDITED: '✏️ edited an expense',
    EXPENSE_DELETED: '🗑️ deleted an expense',
    MEMBER_ADDED: '👤 joined a group',
    MEMBER_REMOVED: '👤 left a group',
    SETTLEMENT_RECORDED: '💰 recorded a settlement',
  }
  const actor = entry.actorUserId?.name ?? 'Someone'
  return `${actor} ${typeMap[entry.type] ?? entry.type}`
}

export default function DashboardPage() {
  const socket = useSocket()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDashboard = useCallback(() => {
    api
      .get('/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // ── Live updates ──────────────────────────────────────────────────────────
  // The server emits 'activity:new' to the user's personal room (user:{id})
  // on every group change. Use it to silently refresh the stats.
  useEffect(() => {
    if (!socket) return

    const handleUpdate = () => {
      // Refetch silently (don't reset loading so UI doesn't flash)
      api
        .get('/dashboard')
        .then((res) => setData(res.data))
        .catch(() => {/* best-effort, don't surface errors on background refresh */})
    }

    const handleReconnect = () => {
      // On reconnect get fresh data (loading spinner is acceptable here)
      setLoading(true)
      fetchDashboard()
    }

    socket.on('activity:new', handleUpdate)
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('activity:new', handleUpdate)
      socket.off('connect', handleReconnect)
    }
  }, [socket, fetchDashboard])

  if (loading) return <LoadingSpinner text="Loading dashboard…" />

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Link to="/groups" className="text-sm text-emerald-600 hover:underline">
          View all groups →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="You are owed" amount={data?.totalOwed} variant="positive" />
        <StatCard label="You owe" amount={data?.totalOwing} variant="negative" />
        <StatCard
          label="Net balance"
          amount={data?.netBalance}
          variant={(data?.netBalance ?? 0) >= 0 ? 'positive' : 'negative'}
        />
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Groups</p>
          <p className="text-2xl font-bold mt-1 text-slate-900">{data?.groupCount ?? 0}</p>
        </div>
      </div>

      {/* Group where you owe the most */}
      {data?.groupWithMostDebt && (
        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
              Highest debt group
            </p>
            <p className="text-base font-semibold text-slate-900 mt-0.5 truncate">
              {data.groupWithMostDebt.name}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-red-500">
              {formatMoney(data.groupWithMostDebt.amountInPaisa)}
            </p>
            <Link
              to={`/groups/${data.groupWithMostDebt.id}`}
              className="text-xs text-amber-700 hover:underline"
            >
              View group →
            </Link>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent Activity</h2>
        {!data?.recentActivity?.length ? (
          <EmptyState
            title="No recent activity"
            description="Start by creating a group and adding expenses."
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {data.recentActivity.map((entry) => (
              <div key={entry._id} className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-slate-700">{activityLabel(entry)}</p>
                <span className="text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
