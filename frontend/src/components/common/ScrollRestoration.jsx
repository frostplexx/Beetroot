import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Simple scroll-to-top component for new navigations
 * Individual pages handle their own scroll restoration via useScrollRestoration hook
 */
export function ScrollRestoration() {
  const location = useLocation()

  useEffect(() => {
    // Only scroll to top if explicitly requested via location state
    // Pages with scroll restoration should set scrollRestoration: false
    if (location.state?.scrollRestoration !== false) {
      // This handles new page navigations (forward navigation)
      // Back button navigation is handled by individual pages via useScrollRestoration
      if (!location.state?.fromBackButton) {
        window.scrollTo(0, 0)
      }
    }
  }, [location.pathname, location.state])

  return null
}
