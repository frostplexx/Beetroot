import { formatDuration } from '../../utils/formatters'
import { usePreview } from '../../contexts/PreviewContext'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function TrackTable({ items, currentPage, itemsPerPage, sortField, sortDirection, onSort }) {
  const { previewTrack, setPreviewTrack } = usePreview()

  const handleSort = (field) => {
    if (onSort) {
      onSort(field)
    }
  }

  const SortableHead = ({ field, children, className }) => (
    <TableHead
      className={`${className} ${onSort ? 'cursor-pointer select-none hover:text-rose-400 transition-colors' : ''}`}
      onClick={() => onSort && handleSort(field)}
    >
      <div className="flex items-center gap-2">
        {children}
        {onSort && (
          <i className={`fa-solid ${sortField === field ? (sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort'} text-xs ${sortField === field ? 'text-rose-500' : 'text-neutral-700 opacity-0 group-hover:opacity-50'}`}></i>
        )}
      </div>
    </TableHead>
  )

  return (
    <div>
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No tracks found</p>
        </div>
      ) : (
        <div className="border border-neutral-900 rounded overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-neutral-800">
                <TableHead className="w-16 text-neutral-500">#</TableHead>
                <SortableHead field="title" className="text-neutral-500">Title</SortableHead>
                <SortableHead field="artist" className="text-neutral-500">Artist</SortableHead>
                <SortableHead field="album" className="text-neutral-500">Album</SortableHead>
                <SortableHead field="year" className="w-24 text-neutral-500">Year</SortableHead>
                <SortableHead field="length" className="w-28 text-neutral-500">Duration</SortableHead>
                <SortableHead field="format" className="w-28 text-neutral-500">Format</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow
                  key={item.id}
                  onClick={() => setPreviewTrack(item)}
                  className={`cursor-pointer group transition-colors duration-200 opacity-0 animate-fade-in border-b border-neutral-800 hover:bg-rose-500/5 ${
                    previewTrack?.id === item.id ? 'bg-rose-500/10' : ''
                  }`}
                  style={{
                    animationDelay: `${index * 20}ms`,
                    animationFillMode: 'forwards',
                    boxShadow: previewTrack?.id === item.id ? 'inset 3px 0 0 0 rgb(244 63 94)' : 'none'
                  }}
                >
                  <TableCell className="font-mono">
                    <span className={previewTrack?.id === item.id ? 'text-rose-500' : 'text-neutral-500'}>
                      {currentPage * itemsPerPage + index + 1}
                    </span>
                  </TableCell>
                  <TableCell className="text-neutral-200 group-hover:text-rose-400 transition-colors">
                    {item.title}
                  </TableCell>
                  <TableCell className="text-neutral-400 transition-colors group-hover:text-neutral-300">
                    {item.artist}
                  </TableCell>
                  <TableCell className="text-neutral-500 transition-colors group-hover:text-neutral-400">
                    {item.album}
                  </TableCell>
                  <TableCell className="text-neutral-500 transition-colors group-hover:text-neutral-400">
                    {item.year && item.year.Valid ? item.year.Int64 : '-'}
                  </TableCell>
                  <TableCell className="text-neutral-500 font-mono transition-colors group-hover:text-neutral-400">
                    {item.length ? formatDuration(item.length) : '-'}
                  </TableCell>
                  <TableCell>
                    <span className="text-neutral-500 font-mono text-xs transition-colors group-hover:text-neutral-400">
                      {item.format?.toUpperCase() || 'N/A'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
