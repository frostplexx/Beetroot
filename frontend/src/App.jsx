import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { PreviewProvider } from './contexts/PreviewContext'
import { ConfigErrorProvider } from './contexts/ConfigContext'
import { ConfigErrorToast } from './components/common/ConfigErrorToast'
import { Dashboard } from './pages/Dashboard'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { ToolsPage } from './pages/ToolsPage'
import { LogsPage } from './pages/LogsPage'
import { UploadPage } from './pages/UploadPage'
import './App.css'

function App() {
  return (
    <ConfigErrorProvider>
      <Router>
        <PreviewProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/album/:id" element={<AlbumDetailPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/tools/*" element={<ToolsPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Routes>
          <ConfigErrorToast />
        </PreviewProvider>
      </Router>
    </ConfigErrorProvider>
  )
}

export default App
