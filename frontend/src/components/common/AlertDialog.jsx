export function AlertDialog({ isOpen, onClose, title, message, variant = 'info' }) {
  if (!isOpen) return null

  const colors = {
    success: 'text-green-400 border-green-900/50 bg-green-950/20',
    error: 'text-red-400 border-red-900/50 bg-red-950/20',
    info: 'text-blue-400 border-blue-900/50 bg-blue-950/20'
  }

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full mx-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded ${colors[variant]}`}>
            <i className={`fa-solid ${icons[variant]} text-xl`}></i>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-neutral-200 mb-1">{title}</h2>
            <p className="text-sm text-neutral-400 whitespace-pre-line">{message}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  )
}
