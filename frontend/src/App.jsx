import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('Loading...')
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setError(err.message))
  }, [])

  return (
    <div className="App">
      <h1>Beetroot</h1>
      <div className="card">
        <h2>Go Backend + Vite Frontend</h2>
        {error ? (
          <p style={{ color: 'red' }}>Error: {error}</p>
        ) : (
          <p>{message}</p>
        )}
      </div>
    </div>
  )
}

export default App
