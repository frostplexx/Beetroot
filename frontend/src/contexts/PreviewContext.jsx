import { createContext, useContext, useState } from 'react'

export const PreviewContext = createContext(null)

export function PreviewProvider({ children }) {
  const [previewTrack, setPreviewTrack] = useState(null)

  return (
    <PreviewContext.Provider value={{ previewTrack, setPreviewTrack }}>
      {children}
    </PreviewContext.Provider>
  )
}

export function usePreview() {
  const context = useContext(PreviewContext)
  if (!context) {
    throw new Error('usePreview must be used within PreviewProvider')
  }
  return context
}
