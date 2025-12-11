type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Listener = (event: BeforeInstallPromptEvent) => void

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<Listener>()

const notify = () => {
  if (!deferred) return
  for (const listener of listeners) {
    try {
      listener(deferred)
    } catch (err) {
      console.warn('beforeinstallprompt listener failed', err)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
  })
}

export const consumeInstallPrompt = () => deferred

export const onInstallPrompt = (listener: Listener) => {
  listeners.add(listener)
  if (deferred) {
    try {
      listener(deferred)
    } catch (err) {
      console.warn('beforeinstallprompt listener failed', err)
    }
  }
  return () => {
    listeners.delete(listener)
  }
}

export const clearInstallPrompt = () => {
  deferred = null
}
