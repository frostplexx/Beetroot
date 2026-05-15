import { useState, useRef, useEffect } from 'react'

const MIN_WIDTH = 320 // 320px minimum
const MAX_WIDTH = 800 // 800px maximum

export function ResizablePreviewPanel({ children, isOpen, className }) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('preview-panel-width')
    return saved ? parseInt(saved, 10) : 480
  })
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e) => {
        const newWidth = window.innerWidth - e.clientX
        if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
          setWidth(newWidth)
          localStorage.setItem('preview-panel-width', newWidth.toString())
        }
      }

      const handleMouseUp = () => {
        setIsResizing(false)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing])

  const handleMouseDown = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  return (
    <div
      ref={panelRef}
      className={className}
      style={{
        width: `${width}px`,
        transition: isResizing ? 'none' : undefined,
      }}
    >
      {/* Resize handle - only visible on desktop */}
      <div
        data-resize-handle
        className="hidden lg:block absolute left-0 top-0 bottom-0 w-4 cursor-col-resize group hover:bg-rose-500/20 transition-colors z-50"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-1 h-8 bg-rose-500 rounded-full"></div>
        </div>
      </div>

      {/* Resizing overlay */}
      {isResizing && (
        <div className="fixed inset-0 z-[60] cursor-col-resize" />
      )}

      {children}
    </div>
  )
}
