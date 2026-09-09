import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api.js'
import { formatMoney } from '../../lib/formatMoney.js'
import LoadingSpinner from '../LoadingSpinner.jsx'
import EmptyState from '../EmptyState.jsx'
import ErrorBanner from '../ErrorBanner.jsx'
import AddExpenseModal from '../modals/AddExpenseModal.jsx'
import EditExpenseModal from '../modals/EditExpenseModal.jsx'

export default function ExpensesTab({ groupId, members, currentUserId, isOwner, socket }) {
  const [data, setData] = useState({ data: [], total: 0, page: 1, pageSize: 20 })
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)

  const fetchExpenses = useCallback(() => {
    setLoading(true)
    api
      .get(`/groups/${groupId}/expenses`, {
        params: { page, pageSize: 20, sortBy, sortOrder },
      })
      .then((res) => {
        setData(res.data)
        setError('')
      })
      .catch((err) =>
        setError(err.response?.data?.message?.[0] ?? 'Failed to load expenses'),
      )
      .finally(() => setLoading(false))
  }, [groupId, page, sortBy, sortOrder])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // Real-time: refetch when balances update (an expense was added/edited/deleted)
  useEffect(() => {
    if (!socket) return
    socket.on('balances:updated', fetchExpenses)
    return () => socket.off('balances:updated', fetchExpenses)
  }, [socket, fetchExpenses])

  const getMemberName = (userId) => {
    const m = members.find((m) => m._id?.toString() === userId?.toString())
    return m?.name || m?.email || userId
  }

  const totalPages = Math.ceil(data.total / 20)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          + Add Expense
        </button>

        {/* Sort controls */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500 shrink-0">Sort by</label>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
          </select>
          <button
            onClick={() => { setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc')); setPage(1) }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="Toggle sort direction"
            title={sortOrder === 'desc' ? 'Descending — click for ascending' : 'Ascending — click for descending'}
          >
            {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <LoadingSpinner text="Loading expenses…" />
      ) : data.data.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Add the first expense for this group."
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {data.data.map((expense) => (
              <button
                key={expense._id}
                onClick={() => setEditingExpense(expense)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">
                    {expense.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paid by {getMemberName(expense.paidByUserId)} ·{' '}
                    {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-semibold text-slate-900 text-sm ml-4 shrink-0">
                  {formatMoney(expense.amountInPaisa)}
                </p>
              </button>
            ))}
          </div>

          {data.total > 20 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of{' '}
                {data.total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
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

      {showAdd && (
        <AddExpenseModal
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false)
            fetchExpenses()
          }}
        />
      )}

      {editingExpense && (
        <EditExpenseModal
          groupId={groupId}
          expense={editingExpense}
          members={members}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onClose={() => setEditingExpense(null)}
          onSuccess={() => {
            setEditingExpense(null)
            fetchExpenses()
          }}
        />
      )}
    </div>
  )
}
