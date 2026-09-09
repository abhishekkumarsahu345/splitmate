import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { settlementFormSchema } from '../../schemas/settlement.schema.js'
import api from '../../lib/api.js'
import { formatMoney } from '../../lib/formatMoney.js'

function rupeesToPaisa(str) {
  const n = parseFloat(str)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function paisaToRupees(paisa) {
  if (!paisa || paisa === 0) return ''
  return (paisa / 100).toFixed(2)
}

/**
 * RecordSettlementModal
 *
 * Props:
 *   groupId         — the group this settlement belongs to
 *   members         — all group members (used only when payee is not pre-determined)
 *   currentUserId   — the logged-in user's ID (always the payer — cannot be changed)
 *   currentUserName — display name for the locked payer row
 *   prefill         — { payeeId, payeeName, amountInPaisa }
 *                     When payeeId + payeeName are set the payee is LOCKED (no dropdown).
 *                     When payeeId is empty the user picks from a filtered dropdown.
 *   onClose / onSuccess — callbacks
 */
export default function RecordSettlementModal({
  groupId,
  members,
  currentUserId,
  currentUserName,
  prefill = {},
  onClose,
  onSuccess,
}) {
  const [serverError, setServerError] = useState('')

  // Payee is locked when we know exactly who is owed (from simplified debts).
  const payeeLocked = !!(prefill.payeeId && prefill.payeeName)

  // Payee dropdown options — only used when payee is not locked
  const payeeOptions = members.filter((m) => m._id?.toString() !== currentUserId)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      payeeId: prefill.payeeId ?? '',
      amountInPaisa: paisaToRupees(prefill.amountInPaisa),
    },
  })

  const onSubmit = async (values) => {
    setServerError('')
    const paisa = rupeesToPaisa(values.amountInPaisa)
    try {
      await api.post(`/groups/${groupId}/settlements`, {
        payerId: currentUserId,   // always the logged-in user — not user-editable
        payeeId: values.payeeId,
        amountInPaisa: paisa,
      })
      onSuccess?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to record settlement')
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
            Record Settlement
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {prefill.amountInPaisa > 0 && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">
              Suggested amount: {formatMoney(prefill.amountInPaisa)}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            {/* Payer — locked to the logged-in user, not editable */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                You are paying
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold shrink-0">
                  {(currentUserName || 'Y')[0].toUpperCase()}
                </span>
                <span className="font-medium">{currentUserName || 'You'}</span>
                <span className="ml-auto text-xs text-slate-400">locked</span>
              </div>
            </div>

            {/* Payee — locked when creditor is known, open dropdown otherwise */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Paying to
              </label>

              {payeeLocked ? (
                // Creditor is known from simplified debts — lock it, no free choice
                <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                    {(prefill.payeeName || 'R')[0].toUpperCase()}
                  </span>
                  <span className="font-medium">{prefill.payeeName}</span>
                  <span className="ml-auto text-xs text-slate-400">locked</span>
                  {/* hidden input so react-hook-form still has the value */}
                  <input type="hidden" {...register('payeeId')} />
                </div>
              ) : (
                // Creditor not known — let the user pick (rare: e.g. multiple creditors)
                <select
                  {...register('payeeId')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-invalid={!!errors.payeeId}
                >
                  <option value="">Select who you're paying…</option>
                  {payeeOptions.map((m) => (
                    <option key={m._id} value={m._id?.toString()}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              )}

              {errors.payeeId && (
                <p className="text-red-500 text-xs mt-1" role="alert">
                  {errors.payeeId.message}
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                {...register('amountInPaisa')}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {errors.amountInPaisa && (
                <p className="text-red-500 text-xs mt-1" role="alert">
                  {errors.amountInPaisa.message}
                </p>
              )}
            </div>

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
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Recording…' : 'Record Settlement'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
