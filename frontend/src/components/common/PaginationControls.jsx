import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

export function PaginationControls({ currentPage, totalItems, itemsPerPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  if (totalItems <= itemsPerPage) return null

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = []
    const showEllipsis = totalPages > 7

    if (!showEllipsis) {
      // Show all pages if 7 or fewer
      for (let i = 0; i < totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(0)

      if (currentPage <= 3) {
        // Near start: show first 5 pages
        for (let i = 1; i < Math.min(5, totalPages - 1); i++) {
          pages.push(i)
        }
        if (totalPages > 5) pages.push('ellipsis')
      } else if (currentPage >= totalPages - 4) {
        // Near end: show last 5 pages
        pages.push('ellipsis')
        for (let i = Math.max(1, totalPages - 5); i < totalPages - 1; i++) {
          pages.push(i)
        }
      } else {
        // Middle: show current page and neighbors
        pages.push('ellipsis')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('ellipsis')
      }

      // Always show last page
      pages.push(totalPages - 1)
    }

    return pages
  }

  const pageNumbers = getPageNumbers()
  const hasPrevious = currentPage > 0
  const hasNext = currentPage < totalPages - 1

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => hasPrevious && onPageChange(currentPage - 1)}
            className={!hasPrevious ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          />
        </PaginationItem>

        {/* Mobile: Show only current page */}
        <PaginationItem className="md:hidden">
          <PaginationLink isActive className="cursor-default min-w-10">
            {currentPage + 1}
          </PaginationLink>
        </PaginationItem>

        {/* Desktop: Show all page numbers */}
        <div className="hidden md:contents">
          {pageNumbers.map((page, idx) => (
            <PaginationItem key={idx}>
              {page === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page + 1}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
        </div>

        <PaginationItem>
          <PaginationNext
            onClick={() => hasNext && onPageChange(currentPage + 1)}
            className={!hasNext ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
