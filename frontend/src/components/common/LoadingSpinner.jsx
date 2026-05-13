export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
        <p className="mt-4 text-neutral-500 text-sm">{message}</p>
      </div>
    </div>
  )
}

export function InlineSpinner() {
  return (
    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
  )
}
