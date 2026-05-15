import { Button } from '@/components/ui/button'

export function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  if (totalItems <= itemsPerPage) return null

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        variant="outline"
        size="sm"
      >
        <i className="fa-solid fa-chevron-left mr-1"></i>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground font-mono px-2">
        <span className="text-primary font-semibold">{currentPage + 1}</span>
        <span className="text-muted mx-1">/</span>
        <span>{totalPages}</span>
      </span>
      <Button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={(currentPage + 1) * itemsPerPage >= totalItems}
        variant="outline"
        size="sm"
      >
        Next
        <i className="fa-solid fa-chevron-right ml-1"></i>
      </Button>
    </div>
  )
}
