import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useSocket } from '../hooks/useSocket.js'
import api from '../lib/api.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import ExpensesTab from '../components/tabs/ExpensesTab.jsx'
import BalancesTab from '../components/tabs/BalancesTab.jsx'
import ActivityTab from '../components/tabs/ActivityTab.jsx'
import AddMemberModal from '../components/modals/AddMemberModal.jsx'

const TABS = ['Members', 'Expenses', 'Balances', 'Activity']

// ── Members section ────────────────────────────────────────────────────────────
function MembersTab({ members, ownerId, isOwner, onAddMember, onRemoveMember, onGoToExpenses }) {
  const hasOtherMembers = members.length > 1

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          {members.length} member{members.length !== 1 ? 's' : ''} in this group
        </p>
        {isOwner && (
          <button
            onClick={onAddMember}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span> Add Member
          </button>
        )}
      </div>

      {/* Member list */}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
        {members.map((m) => {
          const memberId = m._id?.toString() ?? m._id
          const ownerIdStr = ownerId?.toString() ?? ownerId
          const isGroupOwner = memberId === ownerIdStr
          return (
            <li key={memberId} className="flex items-center justify-between px-4 py-3">
              {/* Avatar + info */}
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm shrink-0">
                  {(m.name || m.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {m.name || m.email}
                  </p>
                  {m.name && (
                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                  )}
                </div>
              </div>

              {/* Badge + action */}
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {isGroupOwner && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    Owner
                  </span>
                )}
                {isOwner && !isGroupOwner && (
                  <button
                    onClick={() => onRemoveMember(memberId)}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    aria-label={`Remove ${m.name || m.email}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Next-step callout */}
      {isOwner && !hasOtherMembers && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center space-y-1">
          <p className="text-sm font-medium text-slate-700">Add members to get started</p>
          <p className="text-xs text-slate-500">
            Search by name or email above, then head to the Expenses tab to record shared costs.
          </p>
        </div>
      )}

      {isOwner && hasOtherMembers && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-emerald-800">
            Group is ready — start recording shared expenses.
          </p>
          <button
            onClick={onGoToExpenses}
            className="shrink-0 rounded-lg bg-emerald-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Add Expense →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Delete Group Confirmation Modal ────────────────────────────────────────────
function DeleteGroupModal({ groupName, onConfirm, onClose, isDeleting, deleteError }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Delete group?</h2>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-medium text-slate-700">"{groupName}"</span> and all its
              expenses, settlements, and activity will be permanently deleted. This cannot be undone.
            </p>
          </div>
        </div>

        {deleteError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Deleting…
              </>
            ) : (
              'Delete group'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const socket = useSocket()
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('Members')
  const [showAddMember, setShowAddMember] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // ── Fetch group ──────────────────────────────────────────────────────────
  const fetchGroup = () => {
    api
      .get(`/groups/${id}`)
      .then((res) => setGroup(res.data))
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load group'))
  }

  useEffect(() => {
    setLoading(true)
    api
      .get(`/groups/${id}`)
      .then((res) => setGroup(res.data))
      .catch((err) => setError(err.response?.data?.message?.[0] ?? 'Failed to load group'))
      .finally(() => setLoading(false))
  }, [id])

  // ── Socket room ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !id) return
    socket.emit('join:group', { groupId: id })
    return () => socket.emit('leave:group', { groupId: id })
  }, [socket, id])

  // ── Remove member ────────────────────────────────────────────────────────
  const handleRemoveMember = async (memberId) => {
    setRemoveError('')
    try {
      await api.delete(`/groups/${id}/members/${memberId}`)
      fetchGroup()
    } catch (err) {
      const msg = err.response?.data?.message
      setRemoveError(Array.isArray(msg) ? msg[0] : msg || 'Failed to remove member')
    }
  }

  // ── Delete group ─────────────────────────────────────────────────────────
  const handleDeleteGroup = async () => {
    setIsDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/groups/${id}`)
      navigate('/groups')
    } catch (err) {
      const msg = err.response?.data?.message
      setDeleteError(Array.isArray(msg) ? msg[0] : msg || 'Failed to delete group')
      setIsDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading group…" />
  if (error) return <ErrorBanner message={error} />
  if (!group) return null

  const isOwner =
    group.ownerId?.toString() === user?.id || group.ownerId === user?.id
  const members = group.members ?? []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowDeleteModal(true)}
            className="shrink-0 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-1.5"
            aria-label="Delete group"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete group
          </button>
        )}
      </div>

      {removeError && (
        <ErrorBanner message={removeError} onDismiss={() => setRemoveError('')} />
      )}

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
            {tab === 'Members' && (
              <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                {members.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'Members' && (
          <MembersTab
            members={members}
            ownerId={group.ownerId}
            isOwner={isOwner}
            onAddMember={() => setShowAddMember(true)}
            onRemoveMember={handleRemoveMember}
            onGoToExpenses={() => setActiveTab('Expenses')}
          />
        )}
        {activeTab === 'Expenses' && (
          <ExpensesTab
            groupId={id}
            members={members}
            currentUserId={user?.id}
            isOwner={isOwner}
            socket={socket}
          />
        )}
        {activeTab === 'Balances' && (
          <BalancesTab
            groupId={id}
            members={members}
            currentUserId={user?.id}
            currentUserName={user?.name || user?.email}
            socket={socket}
          />
        )}
        {activeTab === 'Activity' && (
          <ActivityTab groupId={id} socket={socket} />
        )}
      </div>

      {/* Add Member modal */}
      {showAddMember && (
        <AddMemberModal
          groupId={id}
          onClose={() => setShowAddMember(false)}
          onSuccess={() => {
            setShowAddMember(false)
            fetchGroup()
          }}
        />
      )}

      {/* Delete Group modal */}
      {showDeleteModal && (
        <DeleteGroupModal
          groupName={group.name}
          onConfirm={handleDeleteGroup}
          onClose={() => {
            setShowDeleteModal(false)
            setDeleteError('')
          }}
          isDeleting={isDeleting}
          deleteError={deleteError}
        />
      )}
    </div>
  )
}
