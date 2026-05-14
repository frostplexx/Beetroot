export function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  if (totalItems <= itemsPerPage) return null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 hover:bg-neutral-800 hover:shadow-lg hover:shadow-rose-500/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
      >
        <i className="fa-solid fa-chevron-left mr-1"></i>
        Previous
      </button>
      <span className="text-xs text-neutral-500 font-mono px-2">
        <span className="text-rose-500 font-semibold">{currentPage + 1}</span>
        <span className="text-neutral-700 mx-1">/</span>
        <span>{totalPages}</span>
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={(currentPage + 1) * itemsPerPage >= totalItems}
        className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 hover:bg-neutral-800 hover:shadow-lg hover:shadow-rose-500/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
      >
        Next
        <i className="fa-solid fa-chevron-right ml-1"></i>
      </button>
    </div>
  )
}
