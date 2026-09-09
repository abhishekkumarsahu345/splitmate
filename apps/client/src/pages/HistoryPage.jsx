import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api.js'
import { formatMoney } from '../lib/formatMoney.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'

const PAGE_SIZE = 20

// ── Settlement row ─────────────────────────────────────────────────────────────
function SettlementRow({ settlement, currentUserId }) {
  const from = settlement.fromUserId
  const to = settlement.toUserId
  const fromName = from?.name ?? from?._id ?? 'Unknown'
  const toName = to?.name ?? to?._id ?? 'Unknown'

  const isPayer = from?._id === currentUserId || from === currentUserId
  const isPayee = to?._id === currentUserId || to === currentUserId

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl" aria-hidden>💰</span>
        <div className="min-w-0">
          <p className="text-sm text-slate-800 truncate">
            <span className="font-medium">{fromName}</span>
            <span className="text-slate-400 mx-1.5">→</span>
            <span className="font-medium">{toName}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(settlement.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isPayer && (
          <span className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
            You paid
          </span>
        )}
        {isPayee && (
          <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
            You received
          </span>
        )}
        <span className={`text-sm font-semibold ${isPayer ? 'text-red-500' : isPayee ? 'text-emerald-600' : 'text-slate-700'}`}>
          {formatMoney(settlement.amountInPaisa)}
        </span>
      </div>
    </div>
  )
}

// ── Expense row ────────────────────────────────────────────────────────────────
function ExpenseRow({ expense, currentUserId }) {
  const paidBy = expense.paidByUserId
  const paidByName = paidBy?.name ?? paidBy?._id ?? 'Unknown'
  const groupName = expense.groupId?.name ?? 'Unknown group'
  const groupId = expense.groupId?._id ?? expense.groupId

  const isPayer =
    paidBy?._id === currentUserId ||
    paidBy?._id?.toString() === currentUserId ||
    paidBy === currentUserId

  // Find this user's share in the splits
  const myShare = expense.splits?.find(
    (s) => s.userId?.toString() === currentUserId || s.userId === currentUserId,
  )

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl" aria-hidden>🧾</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{expense.description}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {groupId ? (
              <Link
                to={`/groups/${groupId}`}
                className="hover:underline text-emerald-600"
                onClick={(e) => e.stopPropagation()}
              >
                {groupName}
              </Link>
            ) : groupName}
            {' · '}
            Paid by {isPayer ? 'you' : paidByName}
            {' · '}
            {new Date(expense.date).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-slate-900">
          {formatMoney(expense.amountInPaisa)}
        </p>
        {myShare && (
          <p className="text-xs text-slate-400 mt-0.5">
            your share: {formatMoney(myShare.shareInPaisa)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Pagination controls ────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Previous
      </button>
      <span className="text-sm text-slate-500">Page {page} of {Math.max(1, totalPages)}</span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  )
}

// ── Settlements tab ────────────────────────────────────────────────────────────
function SettlementsTab({ currentUserId }) {
  const [settlements, setSettlements] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api
      .get('/settlements/history', { params: { page, pageSize: PAGE_SIZE } })
      .then((res) => { setSettlements(res.data.data); setTotal(res.data.total) })
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load settlements'))
      .finally(() => setLoading(false))
  }, [page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (loading) return <LoadingSpinner text="Loading settlements…" />
  if (error) return <ErrorBanner message={error} onDismiss={() => setError('')} />
  if (settlements.length === 0) return (
    <EmptyState title="No settlements yet" description="Settlements recorded in your groups will appear here." />
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {settlements.map((s) => (
          <SettlementRow key={s._id} settlement={s} currentUserId={currentUserId} />
        ))}
      </div>
      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  )
}

// ── Expenses tab ───────────────────────────────────────────────────────────────
function ExpensesHistoryTab({ currentUserId }) {
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api
      .get('/expenses/history', { params: { page, pageSize: PAGE_SIZE } })
      .then((res) => { setExpenses(res.data.data); setTotal(res.data.total) })
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load expenses'))
      .finally(() => setLoading(false))
  }, [page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (loading) return <LoadingSpinner text="Loading expenses…" />
  if (error) return <ErrorBanner message={error} onDismiss={() => setError('')} />
  if (expenses.length === 0) return (
    <EmptyState title="No expenses yet" description="Expenses you're involved in will appear here." />
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {expenses.map((e) => (
          <ExpenseRow key={e._id} expense={e} currentUserId={currentUserId} />
        ))}
      </div>
      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
const TABS = ['Expenses', 'Settlements']

export default function HistoryPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Expenses')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">History</h1>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Expenses' && <ExpensesHistoryTab currentUserId={user?.id} />}
      {activeTab === 'Settlements' && <SettlementsTab currentUserId={user?.id} />}
    </div>
  )
}
