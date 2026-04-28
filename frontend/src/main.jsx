import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Am scos BrowserRouter de aici pentru că îl ai deja în App.jsx */}
    <App />
  </StrictMode>,
)