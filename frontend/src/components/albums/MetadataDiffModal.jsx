import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

export function MetadataDiffModal({ diff, isOpen, onClose }) {
  if (!diff) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Metadata Changes</DialogTitle>
          {diff.length > 0 && (
            <p className="text-sm text-neutral-400 mt-1">
              {diff.length} field{diff.length > 1 ? 's' : ''} updated
            </p>
          )}
        </DialogHeader>

        {diff.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-400">No changes detected</p>
            <p className="text-sm text-neutral-500 mt-2">The metadata is already up to date</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-4 pr-4">
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
          </ScrollArea>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium"
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  )
}
