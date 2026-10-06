import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import '@fortawesome/fontawesome-free/css/all.min.css'
import App from './App.jsx'
import './assets/css/tokens.css'
import './assets/css/style.css'
import './assets/css/chat.css'
import './assets/css/ui.css'
import './assets/css/a11y.css'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)