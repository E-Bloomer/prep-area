import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'

if (typeof window !== 'undefined') {
  if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onRegistered(registration) {
        console.info('Service worker registered', registration)
      },
      onRegisterError(error) {
        console.error('Service worker registration failed', error)
      },
      onOfflineReady() {
        console.info('Prep Area is ready to work offline.')
      }
    })
  } else {
    console.info('PWA service worker is only registered in production builds. Run `npm run preview` to test install/offline.')
  }
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
