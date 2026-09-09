import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createExpenseSchema } from '../schemas/expense.schema.js'
import api from '../lib/api.js'
import { formatMoney } from '../lib/formatMoney.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function rupeesToPaisa(str) {
  const n = parseFloat(str)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  const steps = ['Create', 'Members', 'Expense']
  return (
    <div className="flex items-center gap-0 px-6 pt-5 pb-4">
      {steps.map((label, i) => {
        const idx = i + 1
        const done = idx < current
        const active = idx === current
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? 'bg-emerald-600 text-white'
                    : active
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-200'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? '✓' : idx}
              </div>
              <span
                className={`text-xs font-medium ${
                  active ? 'text-emerald-700' : done ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${
                  done ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Create Group
// ─────────────────────────────────────────────────────────────────────────────
function StepCreate({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await api.post('/groups', { name: name.trim() })
      onCreated(res.data)
    } catch (err) {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : msg || 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
      <div>
        <label htmlFor="wiz-name" className="block text-sm font-medium text-slate-700 mb-1">
          Group name <span className="text-red-500">*</span>
        </label>
        <input
          id="wiz-name"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Goa Trip, Flatmates, Office Lunch…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 text-slate-700 py-2 text-sm hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : 'Create & add members →'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Add Members
// ─────────────────────────────────────────────────────────────────────────────
function StepMembers({ groupId, onDone, onSkip }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [addedMembers, setAddedMembers] = useState([]) // { _id, name, email }
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError('')
    setResults(null)
    try {
      const res = await api.get('/users/search', { params: { q: query.trim() } })
      setResults(res.data)
    } catch (err) {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : msg || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (user) => {
    if (addedMembers.find((m) => m._id === user._id)) return
    setAdding(true)
    setError('')
    try {
      await api.post(`/groups/${groupId}/members`, { userId: user._id })
      setAddedMembers((prev) => [...prev, user])
      setResults(null)
      setQuery('')
    } catch (err) {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : msg || 'Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="px-6 pb-6 space-y-4">
      <p className="text-sm text-slate-500">
        Search by name or email to add people. They must already have a SplitMate account — share the sign-up link if they haven't joined yet. You can also add more members later from the group page.
      </p>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {searching ? '…' : 'Search'}
        </button>
      </form>

      {/* Search results */}
      {results !== null && (
        results.length === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">No account found for "{query}"</p>
            <p className="text-xs mt-0.5 text-amber-700">
              They need to create a SplitMate account before you can add them.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
            {results.map((u) => {
              const alreadyAdded = !!addedMembers.find((m) => m._id === u._id)
              return (
                <button
                  key={u._id}
                  type="button"
                  disabled={alreadyAdded || adding}
                  onClick={() => handleAdd(u)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                    alreadyAdded
                      ? 'bg-emerald-50 opacity-60 cursor-default'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm shrink-0">
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{u.name || u.email}</p>
                    {u.name && <p className="text-xs text-slate-400 truncate">{u.email}</p>}
                  </div>
                  <span className="text-xs shrink-0 font-medium text-emerald-600">
                    {alreadyAdded ? '✓ Added' : '+ Add'}
                  </span>
                </button>
              )
            })}
          </div>
        )
      )}

      {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}

      {/* Added members chips */}
      {addedMembers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Added so far:</p>
          <div className="flex flex-wrap gap-2">
            {addedMembers.map((m) => (
              <span
                key={m._id}
                className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                <span className="h-4 w-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0">
                  {(m.name || m.email)[0].toUpperCase()}
                </span>
                {m.name || m.email}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 rounded-lg border border-slate-300 text-slate-500 py-2 text-sm hover:bg-slate-50 transition-colors"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => onDone(addedMembers)}
          className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          {addedMembers.length > 0 ? 'Next: Add expense →' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Add First Expense
// ─────────────────────────────────────────────────────────────────────────────
function StepExpense({ groupId, members, currentUserId, onDone, onSkip }) {
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
      date: todayStr(),
      splitType: 'EQUAL',
    },
  })

  const splitType = useWatch({ control, name: 'splitType' })
  const rawAmount = useWatch({ control, name: 'amountInPaisa' })
  const totalShares = Object.values(shares).reduce((s, v) => s + rupeesToPaisa(v), 0)
  const amountInPaisa = Math.round((rawAmount ?? 0) * 100)
  const sharesBalanced = Math.abs(totalShares - amountInPaisa) <= 1

  const toggleMember = (id) =>
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const onSubmit = async (values) => {
    setServerError('')
    const payload = {
      description: values.description,
      amountInPaisa: Math.round(values.amountInPaisa * 100),
      paidByUserId: values.paidByUserId,
      date: values.date,
      splitType: values.splitType,
    }

    if (values.splitType === 'EQUAL') {
      if (selectedMembers.length < 1) { setServerError('Select at least one member'); return }
      payload.memberIds = selectedMembers
    } else {
      const sharesPayload = Object.entries(shares)
        .filter(([, v]) => rupeesToPaisa(v) > 0)
        .map(([userId, v]) => ({ userId, amount: rupeesToPaisa(v) }))
      if (sharesPayload.length < 1) { setServerError('At least one share must be non-zero'); return }
      if (!sharesBalanced) {
        setServerError(`Shares total (${formatMoney(totalShares)}) must equal the expense amount (${formatMoney(payload.amountInPaisa)})`)
        return
      }
      payload.shares = sharesPayload
    }

    try {
      await api.post(`/groups/${groupId}/expenses`, payload)
      onDone()
    } catch (err) {
      const msg = err.response?.data?.message
      setServerError(Array.isArray(msg) ? msg[0] : msg || 'Failed to add expense')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 pb-6 space-y-4">
      <p className="text-sm text-slate-500">
        Add your first expense — you can add more from the group page anytime.
      </p>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <input
          type="text"
          {...register('description')}
          placeholder="e.g. Dinner, Uber, Groceries"
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1" role="alert">{errors.description.message}</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          {...register('amountInPaisa')}
          placeholder="0.00"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {errors.amountInPaisa && (
          <p className="text-red-500 text-xs mt-1" role="alert">{errors.amountInPaisa.message}</p>
        )}
      </div>

      {/* Paid by */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Paid by</label>
        <select
          {...register('paidByUserId')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {members.map((m) => (
            <option key={m._id} value={m._id?.toString()}>
              {m.name || m.email}{m._id?.toString() === currentUserId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
        <input
          type="date"
          {...register('date')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Split type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Split type</label>
        <div className="flex gap-4">
          {['EQUAL', 'EXACT'].map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="radio" value={type} {...register('splitType')} className="accent-emerald-600" />
              {type === 'EQUAL' ? 'Split equally' : 'Exact amounts'}
            </label>
          ))}
        </div>
      </div>

      {/* EQUAL — checkboxes */}
      {splitType === 'EQUAL' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Split among</label>
          <div className="space-y-1 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2">
            {members.map((m) => {
              const id = m._id?.toString()
              return (
                <label key={id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(id)}
                    onChange={() => toggleMember(id)}
                    className="accent-emerald-600"
                  />
                  <span className="text-sm text-slate-700">
                    {m.name || m.email}{id === currentUserId ? ' (you)' : ''}
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
          <label className="block text-sm font-medium text-slate-700 mb-2">Exact shares (₹)</label>
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {members.map((m) => {
              const id = m._id?.toString()
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-700 truncate">
                    {m.name || m.email}{id === currentUserId ? ' (you)' : ''}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shares[id] ?? ''}
                    onChange={(e) => setShares((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder="0.00"
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )
            })}
          </div>
          <p className={`text-xs mt-2 ${sharesBalanced || totalShares === 0 ? 'text-slate-400' : 'text-red-500'}`}>
            Total: {formatMoney(totalShares)}{amountInPaisa > 0 && ` / ${formatMoney(amountInPaisa)}`}
          </p>
        </div>
      )}

      {serverError && <p className="text-red-500 text-sm" role="alert">{serverError}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 rounded-lg border border-slate-300 text-slate-500 py-2 text-sm hover:bg-slate-50 transition-colors"
        >
          Skip for now
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Adding…' : 'Add expense & finish →'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard shell — orchestrates all 3 steps
// ─────────────────────────────────────────────────────────────────────────────
function CreateGroupWizard({ onClose, onFinished }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [group, setGroup] = useState(null)       // { id, name, ownerId }
  const [members, setMembers] = useState([])     // full member objects after step 2

  // After step 2, fetch the group's full member list (includes populated user objects)
  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await api.get(`/groups/${groupId}`)
      return res.data.members ?? []
    } catch {
      return []
    }
  }

  const handleCreated = (newGroup) => {
    setGroup(newGroup)
    setStep(2)
  }

  const handleMembersDone = async (addedMembers) => {
    const allMembers = await fetchGroupMembers(group.id ?? group._id)
    setMembers(allMembers.length > 0 ? allMembers : addedMembers)
    setStep(3)
  }

  const handleMembersSkip = async () => {
    const allMembers = await fetchGroupMembers(group.id ?? group._id)
    setMembers(allMembers)
    setStep(3)
  }

  const handleFinish = () => {
    onFinished(group.id ?? group._id)
  }

  const groupId = group?.id ?? group?._id
  const currentUserId = user?.id

  // For step 3, if no other members were added, still show at least the current user
  const expenseMembers =
    members.length > 0
      ? members
      : user
      ? [{ _id: currentUserId, name: user.name, email: user.email }]
      : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiz-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-y-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b-0">
          <h2 id="wiz-title" className="text-lg font-semibold text-slate-900">
            {step === 1 && 'Create a new group'}
            {step === 2 && `Add members — ${group?.name}`}
            {step === 3 && 'Add first expense'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Divider */}
        <div className="border-t border-slate-100 mb-5" />

        {/* Step content */}
        {step === 1 && (
          <StepCreate onCreated={handleCreated} onCancel={onClose} />
        )}
        {step === 2 && groupId && (
          <StepMembers
            groupId={groupId}
            onDone={handleMembersDone}
            onSkip={handleMembersSkip}
          />
        )}
        {step === 3 && (
          <StepExpense
            groupId={groupId}
            members={expenseMembers}
            currentUserId={currentUserId}
            onDone={handleFinish}
            onSkip={handleFinish}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups Page
// ─────────────────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  const fetchGroups = () => {
    setLoading(true)
    api
      .get('/groups')
      .then((res) => setGroups(res.data))
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load groups'))
      .finally(() => setLoading(false))
  }

  useEffect(fetchGroups, [])

  const handleFinished = (groupId) => {
    setShowWizard(false)
    navigate(`/groups/${groupId}`)
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My Groups</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          + New Group
        </button>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading groups…" />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create your first group to start splitting expenses."
          action={
            <button
              onClick={() => setShowWizard(true)}
              className="mt-4 rounded-lg bg-emerald-600 text-white px-5 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Create a group
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <Link
              key={g._id}
              to={`/groups/${g._id}`}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-slate-900">{g.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Created {new Date(g.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="text-slate-400 text-sm">→</span>
            </Link>
          ))}
        </div>
      )}

      {showWizard && (
        <CreateGroupWizard
          onClose={() => setShowWizard(false)}
          onFinished={handleFinished}
        />
      )}
    </div>
  )
}
