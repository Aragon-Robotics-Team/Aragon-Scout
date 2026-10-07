import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { applyTheme, loadTheme } from './lib/theme'

applyTheme(loadTheme())
// "Follow phone" switches along with the phone's light/dark setting.
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener('change', () => {
  const t = loadTheme()
  if (t.mode === 'system') applyTheme(t)
})

// Precaches the app so it opens with no connection; updates apply on next load.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
