import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createExpenseSchema } from '../../schemas/expense.schema.js'
import api from '../../lib/api.js'
import { formatMoney } from '../../lib/formatMoney.js'

// ── helpers ────────────────────────────────────────────────────────────────
function rupeesToPaisa(str) {
  const n = parseFloat(str)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── Modal shell ────────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AddExpenseModal({ groupId, members, currentUserId, onClose, onSuccess }) {
  const [serverError, setServerError] = useState('')
  const [selectedMembers, setSelectedMembers] = useState(members.map((m) => m._id?.toString()))
  const [shares, setShares] = useState(() =>
    members.reduce((acc, m) => ({ ...acc, [m._id?.toString()]: '' }), {}),
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(
      createExpenseSchema.omit({ memberIds: true, shares: true }),
    ),
    defaultValues: {
      description: '',
      amountInPaisa: '',
      paidByUserId: currentUserId ?? members[0]?._id?.toString() ?? '',
      date: today(),
      splitType: 'EQUAL',
    },
  })

  const splitType = useWatch({ control, name: 'splitType' })
  const rawAmount = useWatch({ control, name: 'amountInPaisa' })

  // ── EXACT share helpers ────────────────────────────────────────────────
  const totalShares = Object.values(shares).reduce((s, v) => s + rupeesToPaisa(v), 0)
  const amountInPaisa = Math.round((rawAmount ?? 0) * 100)
  const sharesBalanced = Math.abs(totalShares - amountInPaisa) <= 1

  const toggleMember = (id) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const onSubmit = async (values) => {
    setServerError('')

    // values.amountInPaisa is already a number (coerced by Zod).
    // The user enters rupees — convert to integer paisa here.
    const amountPaisa = Math.round(values.amountInPaisa * 100)

    const payload = {
      description: values.description,
      amountInPaisa: amountPaisa,
      paidByUserId: values.paidByUserId,
      date: values.date,
      splitType: values.splitType,
    }

    if (values.splitType === 'EQUAL') {
      if (selectedMembers.length < 1) {
        setServerError('Select at least one member to split with')
        return
      }
      payload.memberIds = selectedMembers
    } else {
      const sharesPayload = Object.entries(shares)
        .filter(([, v]) => rupeesToPaisa(v) > 0)
        .map(([userId, v]) => ({ userId, amount: rupeesToPaisa(v) }))
      if (sharesPayload.length < 1) {
        setServerError('At least one share must be non-zero')
        return
      }
      if (!sharesBalanced) {
        setServerError(
          `Shares total (${formatMoney(totalShares)}) must equal the expense amount (${formatMoney(payload.amountInPaisa)})`,
        )
        return
      }
      payload.shares = sharesPayload
    }

    try {
      await api.post(`/groups/${groupId}/expenses`, payload)
      onSuccess?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to add expense')
    }
  }

  return (
    <ModalShell title="Add Expense" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <input
            type="text"
            {...register('description')}
            placeholder="e.g. Dinner, Uber, Groceries"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-invalid={!!errors.description}
          />
          {errors.description && (
            <p className="text-red-500 text-xs mt-1" role="alert">
              {errors.description.message}
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

        {/* Paid by */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Paid by
          </label>
          <select
            {...register('paidByUserId')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {members.map((m) => (
              <option key={m._id} value={m._id?.toString()}>
                {m.name || m.email}
                {m._id?.toString() === currentUserId ? ' (you)' : ''}
              </option>
            ))}
          </select>
          {errors.paidByUserId && (
            <p className="text-red-500 text-xs mt-1" role="alert">
              {errors.paidByUserId.message}
            </p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Date
          </label>
          <input
            type="date"
            {...register('date')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {errors.date && (
            <p className="text-red-500 text-xs mt-1" role="alert">
              {errors.date.message}
            </p>
          )}
        </div>

        {/* Split type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Split type
          </label>
          <div className="flex gap-3">
            {['EQUAL', 'EXACT'].map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer text-sm text-slate-700"
              >
                <input
                  type="radio"
                  value={type}
                  {...register('splitType')}
                  className="accent-emerald-600"
                />
                {type === 'EQUAL' ? 'Split equally' : 'Exact amounts'}
              </label>
            ))}
          </div>
        </div>

        {/* EQUAL — member checkboxes */}
        {splitType === 'EQUAL' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Split among
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
              {members.map((m) => {
                const id = m._id?.toString()
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(id)}
                      onChange={() => toggleMember(id)}
                      className="accent-emerald-600"
                    />
                    <span className="text-sm text-slate-700">
                      {m.name || m.email}
                      {id === currentUserId ? ' (you)' : ''}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* EXACT — share inputs */}
        {splitType === 'EXACT' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Exact shares (₹)
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {members.map((m) => {
                const id = m._id?.toString()
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-slate-700 truncate">
                      {m.name || m.email}
                      {id === currentUserId ? ' (you)' : ''}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={shares[id] ?? ''}
                      onChange={(e) =>
                        setShares((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )
              })}
            </div>
            <p
              className={`text-xs mt-2 ${sharesBalanced || totalShares === 0 ? 'text-slate-400' : 'text-red-500'}`}
            >
              Total: {formatMoney(totalShares)}
              {amountInPaisa > 0 && ` / ${formatMoney(amountInPaisa)}`}
            </p>
          </div>
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
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Adding…' : 'Add Expense'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
