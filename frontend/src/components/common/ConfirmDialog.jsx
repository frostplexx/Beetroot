export function ConfirmDialog({ isOpen, onClose, title, message, buttons }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full mx-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-medium text-neutral-200 mb-3">{title}</h2>
        <p className="text-sm text-neutral-400 mb-6 whitespace-pre-line leading-relaxed">
          {message}
        </p>

        <div className="flex gap-2">
          {buttons.map((button, index) => (
            <button
              key={index}
              onClick={() => {
                button.onClick()
                onClose()
              }}
              className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
                button.variant === 'danger'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : button.variant === 'primary'
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
