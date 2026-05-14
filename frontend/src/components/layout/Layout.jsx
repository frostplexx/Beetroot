import { memo } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from '../common/Header'

// Memoized layout to prevent unnecessary re-renders
export const Layout = memo(function Layout() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <Outlet />
    </div>
  )
})
