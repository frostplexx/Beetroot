import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { PreviewProvider } from './contexts/PreviewContext'
import { ConfigErrorProvider } from './contexts/ConfigContext'
import { ConfigErrorToast } from './components/common/ConfigErrorToast'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { ToolsPage } from './pages/ToolsPage'
import { SystemPage } from './pages/SystemPage'
import { UploadPage } from './pages/UploadPage'
import { AuditLogPage } from './pages/AuditLogPage'
import './App.css'

function App() {
  return (
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
              <Route path="/audit" element={<AuditLogPage />} />
            </Route>
          </Routes>
          <ConfigErrorToast />
        </PreviewProvider>
      </Router>
    </ConfigErrorProvider>
  )
}

export default App
