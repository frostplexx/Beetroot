import { Link } from 'react-router-dom'
import { useConfigError } from '../../contexts/ConfigContext'

export function ConfigErrorToast() {
  const { configError } = useConfigError()

  if (!configError) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
      <div className="bg-rose-950 border border-rose-900 rounded-lg p-4 shadow-2xl max-w-md backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="text-rose-500 mt-0.5">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-rose-200 mb-1">Configuration Error</h3>
            <p className="text-xs text-rose-300/80 leading-relaxed mb-3 line-clamp-2">
              {configError.error}
            </p>
            <div className="flex gap-2">
              <Link
                to="/tools"
                className="text-[10px] font-bold uppercase tracking-wider text-rose-200 hover:text-white bg-rose-900/50 px-2 py-1 rounded"
              >
                View Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
