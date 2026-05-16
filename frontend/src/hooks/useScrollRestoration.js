import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Custom hook for scroll position restoration
 * Based on: https://stackoverflow.com/questions/59100931/maintaining-state-and-scroll-position-in-react
 *
 * Mobile-optimized: Handles touch scrolling, momentum scrolling, and address bar changes
 *
 * @param {Object} options
 * @param {string} options.key - Unique key for this scroll position (e.g., pathname or pathname+search)
 * @param {boolean} options.dataLoaded - Whether the page data has finished loading
 * @param {boolean} options.enabled - Whether scroll restoration is enabled (default: true)
 */
export function useScrollRestoration({ key, dataLoaded = true, enabled = true }) {
  const location = useLocation()
  const restoredRef = useRef(false)
  const scrollKey = `scroll-${key}`

  // Restore scroll position after data loads
  useEffect(() => {
    if (!enabled || !dataLoaded) return

    // Only restore once per navigation
    if (restoredRef.current) return

    const savedPosition = sessionStorage.getItem(scrollKey)

    if (savedPosition) {
      const targetPosition = parseInt(savedPosition, 10)

      // Mobile browsers need extra time for layout to settle
      // Address bar hiding/showing can affect scroll position
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      const delay = isMobile ? 100 : 0

      // Use triple requestAnimationFrame on mobile for better reliability
      const restore = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Use scrollTo with smooth: instant for immediate scroll (no animation)
              window.scrollTo({
                top: targetPosition,
                left: 0,
                behavior: 'instant' // 'instant' prevents scroll animation
              })
              restoredRef.current = true
              // Clean up after successful restoration
              sessionStorage.removeItem(scrollKey)
            })
          })
        })
      }

      if (delay > 0) {
        setTimeout(restore, delay)
      } else {
        restore()
      }
    } else {
      // No saved position, mark as restored to prevent future attempts
      restoredRef.current = true
    }
  }, [dataLoaded, enabled, scrollKey])

  // Reset restored flag when location changes (new navigation)
  useEffect(() => {
    restoredRef.current = false
  }, [location.pathname, location.search])

  // Save scroll position periodically while scrolling (throttled)
  useEffect(() => {
    if (!enabled) return

    let ticking = false
    let scrollEndTimer = null

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Use window.scrollY (modern, better mobile support)
          sessionStorage.setItem(scrollKey, window.scrollY.toString())
          ticking = false
        })
        ticking = true
      }

      // On mobile, also save when scrolling stops (momentum scrolling)
      clearTimeout(scrollEndTimer)
      scrollEndTimer = setTimeout(() => {
        sessionStorage.setItem(scrollKey, window.scrollY.toString())
      }, 150) // Wait for momentum scrolling to settle
    }

    // Listen to both scroll and touchend for mobile
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('touchend', handleScroll, { passive: true })

    return () => {
      clearTimeout(scrollEndTimer)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('touchend', handleScroll)
    }
  }, [scrollKey, enabled])

  // Save scroll position on page unload/refresh
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = () => {
      sessionStorage.setItem(scrollKey, window.scrollY.toString())
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [scrollKey, enabled])
}
