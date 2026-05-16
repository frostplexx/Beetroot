import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreviewProvider } from './contexts/PreviewContext'
import { ConfigErrorProvider } from './contexts/ConfigContext'
import { ConfigErrorToast } from './components/common/ConfigErrorToast'
import { CommandPalette } from './components/common/CommandPalette'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { ToolsPage } from './pages/ToolsPage'
import { SystemPage } from './pages/SystemPage'
import { UploadPage } from './pages/UploadPage'
import { ComponentShowcase } from './pages/ComponentShowcase'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './App.css'

// Create a client with 5-minute cache time
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,    // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <div className="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfigErrorProvider>
            <Router>
              <PreviewProvider>
                <Routes>
                  {/* Shared layout with Header */}
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/album/:id" element={<AlbumDetailPage />} />
                    <Route path="/tools" element={<ToolsPage />} />
                    <Route path="/tools/*" element={<ToolsPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/system" element={<SystemPage />} />
                    <Route path="/showcase" element={<ComponentShowcase />} />
                  </Route>
                </Routes>
                <ConfigErrorToast />
                <CommandPalette />
              </PreviewProvider>
            </Router>
          </ConfigErrorProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App
