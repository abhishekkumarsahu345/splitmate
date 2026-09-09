import { useState, useEffect } from 'react'

export default function ErrorBanner({ message, onDismiss }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 5000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!visible || !message) return null

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-50 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 shadow-lg max-w-sm"
    >
      <span className="text-red-500 text-lg" aria-hidden>⚠️</span>
      <p className="text-sm text-red-700 flex-1">{message}</p>
      <button
        onClick={() => { setVisible(false); onDismiss?.() }}
        className="text-red-400 hover:text-red-600 text-lg leading-none"
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  )
}
