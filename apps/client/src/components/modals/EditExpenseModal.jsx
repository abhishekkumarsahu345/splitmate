import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateExpenseSchema } from '../../schemas/expense.schema.js'
import api from '../../lib/api.js'
import { formatMoney } from '../../lib/formatMoney.js'

function rupeesToPaisa(str) {
  const n = parseFloat(str)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function paisaToRupees(paisa) {
  return (paisa / 100).toFixed(2)
}

function toDateInput(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toISOString().slice(0, 10)
}

// ── Modal shell (same as AddExpenseModal) ─────────────────────────────────
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

export default function EditExpenseModal({
  groupId,
  expense,
  members,
  currentUserId,
  isOwner,
  onClose,
  onSuccess,
}) {
  const [serverError, setServerError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Derive initial member selection from existing splits
  const initialMemberIds = expense.splits?.map((s) => s.userId?.toString()) ?? []
  const [selectedMembers, setSelectedMembers] = useState(
    initialMemberIds.length > 0 ? initialMemberIds : members.map((m) => m._id?.toString()),
  )

  // Derive initial exact shares from existing splits
  const initialShares = expense.splits?.reduce(
    (acc, s) => ({ ...acc, [s.userId?.toString()]: paisaToRupees(s.shareInPaisa) }),
    {},
  ) ?? {}
  const [shares, setShares] = useState(() =>
    members.reduce(
      (acc, m) => ({ ...acc, [m._id?.toString()]: initialShares[m._id?.toString()] ?? '' }),
      {},
    ),
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(
      updateExpenseSchema.omit({ memberIds: true, shares: true }),
    ),
    defaultValues: {
      description: expense.description ?? '',
      amountInPaisa: paisaToRupees(expense.amountInPaisa),
      paidByUserId: expense.paidByUserId?.toString() ?? '',
      date: toDateInput(expense.date),
      splitType: expense.splitType ?? 'EQUAL',
    },
  })

  const splitType = useWatch({ control, name: 'splitType' })
  const rawAmount = useWatch({ control, name: 'amountInPaisa' })
  const totalShares = Object.values(shares).reduce((s, v) => s + rupeesToPaisa(v), 0)
  // rawAmount is coerced to a number by Zod — convert rupees → paisa for the balance check
  const amountInPaisa = Math.round((rawAmount ?? 0) * 100)
  const sharesBalanced = Math.abs(totalShares - amountInPaisa) <= 1

  const toggleMember = (id) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const canEdit =
    isOwner || expense.createdByUserId?.toString() === currentUserId

  const onSubmit = async (values) => {
    setServerError('')

    // values.amountInPaisa is coerced to a number by Zod (user enters rupees)
    const payload = {
      description: values.description,
      amountInPaisa: Math.round(values.amountInPaisa * 100),
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
      await api.patch(`/groups/${groupId}/expenses/${expense._id}`, payload)
      onSuccess?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to update expense')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete(`/groups/${groupId}/expenses/${expense._id}`)
      onSuccess?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to delete expense')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ModalShell title="Edit Expense" onClose={onClose}>
      {!canEdit && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
          You can only edit expenses you created.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <input
            type="text"
            {...register('description')}
            disabled={!canEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
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
            disabled={!canEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* Paid by */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Paid by
          </label>
          <select
            {...register('paidByUserId')}
            disabled={!canEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {members.map((m) => (
              <option key={m._id} value={m._id?.toString()}>
                {m.name || m.email}
                {m._id?.toString() === currentUserId ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Date
          </label>
          <input
            type="date"
            {...register('date')}
            disabled={!canEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
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
                  disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
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
          {(isOwner || expense.createdByUserId?.toString() === currentUserId) && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 text-red-500 px-3 py-2 text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 text-slate-700 py-2 text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          {canEdit && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  )
}
