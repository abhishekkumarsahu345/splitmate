export default function LoadingSpinner({ size = 'md', text = 'Loading...' }) {
  const sizeMap = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div
        className={`${sizeMap[size]} animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600`}
        role="status"
        aria-label="Loading"
      />
      {text && <p className="text-sm text-slate-500">{text}</p>}
    </div>
  )
}
