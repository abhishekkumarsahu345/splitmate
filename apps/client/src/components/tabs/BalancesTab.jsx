import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api.js'
import { formatMoney } from '../../lib/formatMoney.js'
import LoadingSpinner from '../LoadingSpinner.jsx'
import EmptyState from '../EmptyState.jsx'
import ErrorBanner from '../ErrorBanner.jsx'
import RecordSettlementModal from '../modals/RecordSettlementModal.jsx'

/**
 * BalancesTab
 *
 * Props:
 *   groupId         — current group ID
 *   members         — all group member objects { _id, name, email }
 *   currentUserId   — the logged-in user's ID
 *   currentUserName — the logged-in user's display name (for modal locked payer row)
 *   socket          — socket.io instance for live updates
 *
 * Security model:
 *   - The "Settle" button is shown ONLY on the current user's own row (when they owe money).
 *   - In simplified view, "Record" is shown ONLY on debts where payment.from === currentUserId.
 *   - The modal locks the payer to currentUserId — it cannot be changed.
 *   - The backend also enforces dto.payerId === req.user.id as a second layer.
 */
export default function BalancesTab({ groupId, members, currentUserId, currentUserName, socket }) {
  const [balances, setBalances] = useState(null)     // Record<userId, { name, email, balance }>
  const [simplified, setSimplified] = useState(null) // Payment[] | null
  const [showSimplified, setShowSimplified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [simplifiedLoading, setSimplifiedLoading] = useState(false)
  const [error, setError] = useState('')
  // settlement pre-fill: { payeeId, payeeName, amountInPaisa } — payerId is always currentUserId
  const [settlement, setSettlement] = useState(null)
  // flag: open the settle modal as soon as simplified finishes loading
  const [pendingSettleAfterFetch, setPendingSettleAfterFetch] = useState(false)

  // ── Fetch per-member balances ──────────────────────────────────────────────
  const fetchBalances = useCallback(() => {
    setLoading(true)
    api
      .get(`/groups/${groupId}/balances`)
      .then((res) => { setBalances(res.data); setError('') })
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load balances'))
      .finally(() => setLoading(false))
  }, [groupId])

  // ── Fetch simplified debts ─────────────────────────────────────────────────
  const fetchSimplified = useCallback(() => {
    setSimplifiedLoading(true)
    api
      .get(`/groups/${groupId}/balances/simplified`)
      .then((res) => { setSimplified(res.data); setError('') })
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load simplified balances'))
      .finally(() => setSimplifiedLoading(false))
  }, [groupId])

  useEffect(() => { fetchBalances() }, [fetchBalances])

  useEffect(() => {
    if (showSimplified && simplified === null) fetchSimplified()
  }, [showSimplified, simplified, fetchSimplified])

  // When simplified finishes loading after the user clicked "Settle" from the
  // per-member view, automatically open the modal with the correct pre-fill.
  useEffect(() => {
    if (!pendingSettleAfterFetch || simplified === null || simplifiedLoading) return
    setPendingSettleAfterFetch(false)
    const myDebt = simplified.find((p) => p.from === currentUserId)
    if (myDebt) {
      setSettlement({
        payeeId: myDebt.to,
        payeeName: getMemberName(myDebt.to),
        amountInPaisa: myDebt.amountInPaisa,
      })
    } else {
      setSettlement({ payeeId: '', payeeName: null })
    }
  }, [pendingSettleAfterFetch, simplified, simplifiedLoading, currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const handleBalancesUpdated = () => {
      // Server sends { groupId } as payload — always refetch fresh data
      fetchBalances()
      setSimplified(null)
      if (showSimplified) fetchSimplified()
    }

    const handleReconnect = () => {
      fetchBalances()
      setSimplified(null)
      if (showSimplified) fetchSimplified()
    }

    socket.on('balances:updated', handleBalancesUpdated)
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('balances:updated', handleBalancesUpdated)
      socket.off('connect', handleReconnect)
    }
  }, [socket, fetchBalances, fetchSimplified, showSimplified])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getMemberName = (userId) => {
    if (balances && balances[userId]) return balances[userId].name || balances[userId].email
    const m = members.find((m) => m._id?.toString() === userId?.toString())
    return m?.name || m?.email || userId
  }

  const balanceEntries = balances ? Object.entries(balances) : []
  const allSettled = balanceEntries.every(([, v]) => v.balance === 0)

  // ── Open modal pre-filled with correct payee ───────────────────────────────
  // Called from the simplified view — payment.from must be currentUserId.
  // Payee is known and locked.
  const handleSettleClickFromSimplified = (payment) => {
    setSettlement({
      payeeId: payment.to,
      payeeName: getMemberName(payment.to),
      amountInPaisa: payment.amountInPaisa,
    })
  }

  // Called from the per-member balances row "Settle" button.
  // Fetch simplified first to get the correct creditor, then open the modal.
  const handleSettleMyDebt = () => {
    if (simplified !== null) {
      // Already loaded — use the first debt for the current user
      const myDebt = simplified.find((p) => p.from === currentUserId)
      if (myDebt) {
        setSettlement({
          payeeId: myDebt.to,
          payeeName: getMemberName(myDebt.to),
          amountInPaisa: myDebt.amountInPaisa,
        })
      } else {
        // Owes money but simplified says otherwise — open with unlocked payee
        setSettlement({ payeeId: '', payeeName: null })
      }
    } else {
      // Simplified not yet loaded — fetch it, then the useEffect below opens modal
      setPendingSettleAfterFetch(true)
      fetchSimplified()
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">
          {showSimplified ? 'Simplified Debts' : 'Member Balances'}
        </h2>
        <button
          onClick={() => setShowSimplified((prev) => !prev)}
          className="text-sm text-emerald-600 hover:underline font-medium"
        >
          {showSimplified ? 'Show all balances' : 'Simplify debts'}
        </button>
      </div>

      {/* ── Per-member balances ────────────────────────────────────────────── */}
      {!showSimplified && (
        <>
          {loading ? (
            <LoadingSpinner text="Loading balances…" />
          ) : balanceEntries.length === 0 ? (
            <EmptyState title="No balances yet" description="Add expenses to see who owes what." />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {balanceEntries.map(([userId, { name, email, balance }]) => {
                const isPositive = balance > 0
                const isNegative = balance < 0
                const isMe = userId === currentUserId

                return (
                  <div key={userId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {name || email}
                        {isMe && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{email}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          isPositive ? 'text-emerald-600'
                          : isNegative ? 'text-red-500'
                          : 'text-slate-400'
                        }`}>
                          {isPositive
                            ? `+${formatMoney(balance)}`
                            : isNegative
                              ? formatMoney(balance)
                              : 'Settled'}
                        </p>
                        {isPositive && <p className="text-xs text-slate-400">is owed</p>}
                        {isNegative && <p className="text-xs text-slate-400">owes</p>}
                      </div>

                      {/* Settle button — only shown on the current user's own row
                          when they have a negative balance (they owe money) */}
                      {isMe && isNegative && (
                        <button
                          onClick={handleSettleMyDebt}
                          className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
                        >
                          Settle
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && allSettled && balanceEntries.length > 0 && (
            <p className="text-center text-sm text-slate-500 py-2">✅ All settled up!</p>
          )}
        </>
      )}

      {/* ── Simplified debts ──────────────────────────────────────────────── */}
      {showSimplified && (
        <>
          {simplifiedLoading ? (
            <LoadingSpinner text="Calculating simplified debts…" />
          ) : simplified !== null && simplified.length === 0 ? (
            <EmptyState
              title="All settled up!"
              description="No payments needed — everyone is square."
            />
          ) : simplified !== null ? (
            <div className="space-y-3">
              {simplified.map((payment, i) => {
                const isMyDebt = payment.from === currentUserId

                return (
                  <div
                    key={i}
                    className={`bg-white rounded-xl border px-4 py-3 flex items-center justify-between ${
                      isMyDebt ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'
                    }`}
                  >
                    <p className="text-sm text-slate-700">
                      <span className={`font-medium ${isMyDebt ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {isMyDebt ? 'You' : getMemberName(payment.from)}
                      </span>{' '}
                      should pay{' '}
                      <span className="font-medium text-slate-900">
                        {getMemberName(payment.to)}
                      </span>{' '}
                      <span className="font-semibold text-emerald-600">
                        {formatMoney(payment.amountInPaisa)}
                      </span>
                    </p>

                    {/* Record button — only on the current user's own debts */}
                    {isMyDebt && (
                      <button
                        onClick={() => handleSettleClickFromSimplified(payment)}
                        className="ml-4 shrink-0 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700 transition-colors"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Contextual note for debts that belong to others */}
              {simplified.some((p) => p.from !== currentUserId) && (
                <p className="text-xs text-slate-400 text-center pt-1">
                  Other members' debts are shown for reference — only they can settle their own.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Settlement modal — payerId is always locked to currentUserId */}
      {settlement !== null && (
        <RecordSettlementModal
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          prefill={settlement}
          onClose={() => setSettlement(null)}
          onSuccess={() => {
            setSettlement(null)
            fetchBalances()
            setSimplified(null)
            if (showSimplified) fetchSimplified()
          }}
        />
      )}
    </div>
  )
}
