/**
 * React 19 Server Action utilities
 *
 * These helpers make it easy to convert traditional fetch calls
 * into React 19 form actions with automatic loading/error states
 */

/**
 * Create a form action from an async function
 * React 19 automatically handles pending states with useFormStatus
 *
 * @example
 * const updateTrack = createAction(async (formData) => {
 *   const response = await fetch('/api/track', {
 *     method: 'POST',
 *     body: JSON.stringify(Object.fromEntries(formData))
 *   })
 *   if (!response.ok) throw new Error('Failed to update')
 *   return response.json()
 * })
 */
export function createAction(fn) {
  return async (formData) => {
    try {
      return await fn(formData)
    } catch (error) {
      // React 19 will catch this and expose it via useFormState
      throw error
    }
  }
}

/**
 * Helper to convert FormData to JSON object
 */
export function formDataToObject(formData) {
  const obj = {}
  for (const [key, value] of formData.entries()) {
    obj[key] = value
  }
  return obj
}

/**
 * Fetch wrapper that returns a promise React 19 can suspend on
 * Use with React 19's 'use' hook for automatic loading states
 *
 * @example
 * const dataPromise = fetchData('/api/albums')
 * const albums = use(dataPromise) // Automatically suspends during loading
 */
export function fetchData(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }).then(async (response) => {
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Request failed: ${response.status}`)
    }
    return response.json()
  })
}
