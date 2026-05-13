import { formatDuration } from '../../utils/formatters'
import { usePreview } from '../../contexts/PreviewContext'
import { Pagination } from '../common/Pagination'

export function TrackTable({ items, currentPage, totalItems, itemsPerPage, onPageChange }) {
  const { previewTrack, setPreviewTrack } = usePreview()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Tracks (Showing {items.length} of {totalItems})
        </h2>
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
        />
      </div>
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No tracks found</p>
        </div>
      ) : (
        <div className="border border-neutral-900 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-900/50 border-b border-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Artist
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Album
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Format
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    onClick={() => setPreviewTrack(item)}
                    className="hover:bg-neutral-900/30 cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-sm font-mono relative">
                      <i className="fa-solid fa-play text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute left-4 text-rose-500"></i>
                      <span className={`group-hover:opacity-0 transition-opacity ${previewTrack?.id === item.id ? 'text-rose-500' : 'text-neutral-500'}`}>
                        {currentPage * itemsPerPage + index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-200 group-hover:text-rose-400 transition-colors">{item.title}</td>
                    <td className="px-4 py-3 text-sm text-neutral-400">{item.artist}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{item.album}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">
                      {item.year && item.year.Valid ? item.year.Int64 : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500 font-mono">
                      {item.length ? formatDuration(item.length) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-neutral-500 font-mono text-xs">
                        {item.format?.toUpperCase() || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
