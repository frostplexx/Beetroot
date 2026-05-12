export function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  if (totalItems <= itemsPerPage) return null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
      >
        Previous
      </button>
      <span className="text-xs text-neutral-500">
        Page {currentPage + 1} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={(currentPage + 1) * itemsPerPage >= totalItems}
        className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
      >
        Next
      </button>
    </div>
  )
}
