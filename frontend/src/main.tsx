import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import { OraContextProvider } from './types/oraContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <OraContextProvider>
        <App />
      </OraContextProvider>
    </BrowserRouter>
  </StrictMode>,
)
