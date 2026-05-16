import { memo, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

export const SearchBar = memo(function SearchBar({
  searchQuery,
  setSearchQuery,
  handleSearchSubmit,
  clearSearch,
  searching
}) {
  const [isMac, setIsMac] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0)

    // Check if mobile on mount and resize
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div className="flex gap-2 w-full">
      <form onSubmit={handleSearchSubmit} className="flex-1">
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <i className="fa-solid fa-search text-muted-foreground text-xs group-focus-within:text-primary transition-colors duration-200"></i>
              </div>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isMobile ? "Search library..." : "artist:name, year:2020..2024, genre:rock, ^exclude..."}
                className="h-11 md:h-10 pl-9 pr-12 md:pr-24 bg-neutral-900 text-neutral-100 border-neutral-800 placeholder:text-neutral-500 text-sm md:text-base"
              />
              <div className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <KbdGroup>
                  <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </div>
              {searchQuery && !searching && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 md:right-20 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 hover:rotate-90 z-10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {searching && (
                <div className="absolute right-3 md:right-20 top-1/2 -translate-y-1/2 z-10">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-r-transparent"></div>
                </div>
              )}
            </div>
          </form>
          <Button variant="outline" size="icon" asChild className="hidden md:inline-flex">
            <a
              href="https://beets.readthedocs.io/en/stable/reference/query.html"
              target="_blank"
              rel="noopener noreferrer"
              title="Beets Query Syntax Documentation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </a>
          </Button>
    </div>
  )
})
