import { createContext, use, useState } from 'react'

export const ConfigErrorContext = createContext(null)

export function ConfigErrorProvider({ children }) {
  const [configError, setConfigError] = useState(null)

  return (
    <ConfigErrorContext value={{ configError, setConfigError }}>
      {children}
    </ConfigErrorContext>
  )
}

// React 19: Using the new 'use' hook instead of useContext
export function useConfigError() {
  const context = use(ConfigErrorContext)
  if (!context) {
    throw new Error('useConfigError must be used within ConfigErrorProvider')
  }
  return context
}
