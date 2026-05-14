import { createContext, use, useState } from 'react'

export const PreviewContext = createContext(null)

export function PreviewProvider({ children }) {
  const [previewTrack, setPreviewTrack] = useState(null)

  return (
    <PreviewContext value={{ previewTrack, setPreviewTrack }}>
      {children}
    </PreviewContext>
  )
}

// React 19: Using the new 'use' hook instead of useContext
export function usePreview() {
  const context = use(PreviewContext)
  if (!context) {
    throw new Error('usePreview must be used within PreviewProvider')
  }
  return context
}
