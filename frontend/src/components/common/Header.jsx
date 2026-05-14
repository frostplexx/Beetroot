import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function Header({ activeTab, setActiveTab, searchQuery, setSearchQuery, handleSearchSubmit, clearSearch, searching, showHelp, setShowHelp, handleSearch }) {
  const location = useLocation()
  const isToolsPage = location.pathname.startsWith('/tools')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const isLibraryActive = !isToolsPage && location.pathname !== '/upload' && location.pathname !== '/logs'

  const handleMobileTabClick = (tab) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
  }

  return (
    <header className="border-b border-neutral-800/50 bg-neutral-950/95 backdrop-blur-lg sticky top-0 z-50 shadow-lg shadow-black/5">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:shadow-rose-500/40 transition-shadow">
              <span className="text-lg">🫜</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-neutral-300 bg-clip-text text-transparent">
              Beetroot
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {/* Library section with nested sub-tabs */}
            <div
              className={`flex items-center rounded-lg transition-colors ${
                activeTab !== undefined
                  ? 'bg-neutral-900/30 border border-neutral-800/50 pr-2'
                  : ''
              }`}
              style={{ width: '460px' }}
            >
              <Link
                to="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  isLibraryActive
                    ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
                }`}
              >
                <i className="fa-solid fa-house"></i>
                <span>Library</span>
              </Link>

              {/* Sub-tabs for Library page */}
              <div className={`flex items-center gap-1 ml-2 pl-2 border-l border-neutral-800 transition-opacity duration-200 ${
                activeTab !== undefined ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}>
                <button
                  onClick={() => activeTab !== undefined && setActiveTab('albums')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTab === 'albums'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-compact-disc text-xs"></i>
                  <span className="text-xs">Albums</span>
                </button>
                <button
                  onClick={() => activeTab !== undefined && setActiveTab('tracks')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTab === 'tracks'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-music text-xs"></i>
                  <span className="text-xs">Tracks</span>
                </button>
                <button
                  onClick={() => activeTab !== undefined && setActiveTab('stats')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTab === 'stats'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-chart-simple text-xs"></i>
                  <span className="text-xs">Stats</span>
                </button>
              </div>
            </div>

            <div className="w-px h-6 bg-neutral-800"></div>

            <Link
              to="/upload"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                location.pathname === '/upload'
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>Upload</span>
            </Link>

            <Link
              to="/tools"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isToolsPage
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-wrench"></i>
              <span>Tools</span>
            </Link>

            <Link
              to="/logs"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                location.pathname === '/logs'
                  ? 'bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-file-lines"></i>
              <span>Logs</span>
            </Link>
          </nav>

          {/* Hamburger button (mobile only) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 border-t border-neutral-800/50 pt-3 flex flex-col gap-1">
            <Link
              to="/"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isLibraryActive
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-house"></i>
              <span>Library</span>
            </Link>

            {/* Mobile sub-tabs for Library */}
            {activeTab !== undefined && (
              <div className="ml-6 flex flex-col gap-1 border-l border-neutral-800 pl-3">
                <button
                  onClick={() => handleMobileTabClick('albums')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 w-full text-left ${
                    activeTab === 'albums'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-compact-disc text-xs"></i>
                  <span>Albums</span>
                </button>
                <button
                  onClick={() => handleMobileTabClick('tracks')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 w-full text-left ${
                    activeTab === 'tracks'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-music text-xs"></i>
                  <span>Tracks</span>
                </button>
                <button
                  onClick={() => handleMobileTabClick('stats')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 w-full text-left ${
                    activeTab === 'stats'
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                  }`}
                >
                  <i className="fa-solid fa-chart-simple text-xs"></i>
                  <span>Stats</span>
                </button>
              </div>
            )}

            <Link
              to="/upload"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                location.pathname === '/upload'
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>Upload</span>
            </Link>

            <Link
              to="/tools"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isToolsPage
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-wrench"></i>
              <span>Tools</span>
            </Link>

            <Link
              to="/logs"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                location.pathname === '/logs'
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
              }`}
            >
              <i className="fa-solid fa-file-lines"></i>
              <span>Logs</span>
            </Link>
          </nav>
        )}

        {searchQuery !== undefined && (
          <>
            {/* Search Bar */}
            <div className="mt-4 flex gap-2">
              <form onSubmit={handleSearchSubmit} className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search: artist:name, year:2020..2024, genre:rock, ^exclude..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  {searchQuery && !searching && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
                    </div>
                  )}
                </div>
              </form>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm text-neutral-400 hover:text-neutral-300 hover:border-neutral-700"
                title="Query syntax help"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            {/* Search Help */}
            {showHelp && (
              <div className="mt-4 p-4 bg-neutral-900 border border-neutral-800 rounded text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Field Queries</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">artist:beatles</code> - search artist field</div>
                      <div><code className="text-rose-500">album:thriller</code> - search album field</div>
                      <div><code className="text-rose-500">genre:rock</code> - search genre field</div>
                      <div><code className="text-rose-500">title:love</code> - search title field</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Range Queries</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">year:2020..2024</code> - year range</div>
                      <div><code className="text-rose-500">year:2020..</code> - from 2020 onwards</div>
                      <div><code className="text-rose-500">year:..2000</code> - up to 2000</div>
                      <div><code className="text-rose-500">bitrate:320000..</code> - minimum bitrate</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Boolean Logic</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">foo bar</code> - AND (both required)</div>
                      <div><code className="text-rose-500">foo , bar</code> - OR (either one)</div>
                      <div><code className="text-rose-500">^exclude</code> - NOT (exclude term)</div>
                      <div><code className="text-rose-500">artist:air ^album:moon</code> - complex</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Advanced</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">artist::the.*</code> - regex match</div>
                      <div><code className="text-rose-500">artist:=Beatles</code> - exact match</div>
                      <div><code className="text-rose-500">added:-1w..</code> - added last week</div>
                      <div><code className="text-rose-500">added:-1m..-1w</code> - date range</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search Examples */}
            {!searchQuery && !showHelp && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span>Quick:</span>
                  <button
                    onClick={() => {
                      setSearchQuery('year:2020..2024')
                      handleSearch('year:2020..2024')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    year:2020..2024
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('artist:beatles')
                      handleSearch('artist:beatles')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    artist:beatles
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('genre:rock')
                      handleSearch('genre:rock')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    genre:rock
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('added:-1w..')
                      handleSearch('added:-1w..')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    added:-1w..
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  )
}
