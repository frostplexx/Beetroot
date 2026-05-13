export function MetadataDiffModal({ diff, isOpen, onClose }) {
  if (!isOpen || !diff) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-neutral-200 mb-4">Metadata Changes</h2>

        {diff.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-400">No changes detected</p>
            <p className="text-sm text-neutral-500 mt-2">The metadata is already up to date</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400 mb-4">
              {diff.length} field{diff.length > 1 ? 's' : ''} updated:
            </p>

            {diff.map((change, index) => (
              <div key={index} className="border border-neutral-800 rounded p-4">
                <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                  {change.field}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Before</div>
                    <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
                      {change.before}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">After</div>
                    <div className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded px-3 py-2">
                      {change.after}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  )
}
