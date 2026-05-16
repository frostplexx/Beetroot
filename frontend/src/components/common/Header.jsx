import { useState, useEffect, memo } from 'react'
import { Link, useLocation } from 'react-router-dom'

// Memoized to prevent re-renders on navigation
export const Header = memo(function Header() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const isLibraryActive = location.pathname === '/'
  const isToolsActive = location.pathname.startsWith('/tools')
  const isUploadActive = location.pathname === '/upload'
  const isDownloadActive = location.pathname === '/download'
  const isSystemActive = location.pathname === '/system'

  return (
    <>
      <header className="border-b border-neutral-800/50 bg-neutral-950/95 backdrop-blur-lg sticky top-0 z-50 shadow-lg shadow-black/5">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:shadow-rose-500/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12">
              <span className="text-lg">🫜</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-neutral-300 bg-clip-text text-transparent transition-all duration-300 group-hover:tracking-wider">
              Beetroot
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            <Link
              to="/"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isLibraryActive
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 hover:shadow-md'
              }`}
            >
              <i className={`fa-solid fa-compact-disc transition-transform duration-300 ${isLibraryActive ? 'animate-spin-slow' : 'group-hover:rotate-180'}`}></i>
              <span>Library</span>
            </Link>

            <Link
              to="/upload"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isUploadActive
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 hover:shadow-md'
              }`}
            >
              <i className="fa-solid fa-cloud-arrow-up transition-transform duration-200 hover:-translate-y-1"></i>
              <span>Upload</span>
            </Link>

            <Link
              to="/download"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isDownloadActive
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 hover:shadow-md'
              }`}
            >
              <i className="fa-solid fa-download transition-transform duration-200 hover:translate-y-1"></i>
              <span>Download</span>
            </Link>

            <Link
              to="/tools"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isToolsActive
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 hover:shadow-md'
              }`}
            >
              <i className="fa-solid fa-wrench transition-transform duration-200 hover:rotate-12"></i>
              <span>Tools</span>
            </Link>

            <Link
              to="/system"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isSystemActive
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 hover:shadow-md'
              }`}
            >
              <i className="fa-solid fa-chart-line transition-transform duration-200 hover:scale-110"></i>
              <span>System</span>
            </Link>
          </nav>

          {/* Hamburger button (mobile only) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 transition-all duration-200 hover:scale-110 active:scale-95"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6 transition-transform duration-300 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>

    {/* Mobile Menu Overlay */}
    {mobileMenuOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Mobile Menu */}
        <nav className="fixed top-14 left-0 right-0 bg-neutral-950 border-b border-neutral-800/50 z-50 md:hidden p-4 flex flex-col gap-1 shadow-2xl animate-slide-down">
          <Link
            to="/"
            className={`px-4 py-3 rounded-lg text-base font-medium transition-all flex items-center gap-3 ${
              isLibraryActive
                ? 'bg-rose-500/15 text-rose-400'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <i className="fa-solid fa-compact-disc text-lg"></i>
            <span>Library</span>
          </Link>

          <Link
            to="/upload"
            className={`px-4 py-3 rounded-lg text-base font-medium transition-all flex items-center gap-3 ${
              isUploadActive
                ? 'bg-rose-500/15 text-rose-400'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <i className="fa-solid fa-cloud-arrow-up text-lg"></i>
            <span>Upload</span>
          </Link>

          <Link
            to="/tools"
            className={`px-4 py-3 rounded-lg text-base font-medium transition-all flex items-center gap-3 ${
              isToolsActive
                ? 'bg-rose-500/15 text-rose-400'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <i className="fa-solid fa-wrench text-lg"></i>
            <span>Tools</span>
          </Link>

          <Link
            to="/system"
            className={`px-4 py-3 rounded-lg text-base font-medium transition-all flex items-center gap-3 ${
              isSystemActive
                ? 'bg-rose-500/15 text-rose-400'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <i className="fa-solid fa-chart-line text-lg"></i>
            <span>System</span>
          </Link>
        </nav>
      </>
    )}
  </>
  )
})
