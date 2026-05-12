import { createContext, useContext, useState, useEffect } from 'react'

export const ConfigErrorContext = createContext(null)

export function ConfigErrorProvider({ children }) {
  const [configError, setConfigError] = useState(null)

  return (
    <ConfigErrorContext.Provider value={{ configError, setConfigError }}>
      {children}
    </ConfigErrorContext.Provider>
  )
}

export function useConfigError() {
  const context = useContext(ConfigErrorContext)
  if (!context) {
    throw new Error('useConfigError must be used within ConfigErrorProvider')
  }
  return context
}
