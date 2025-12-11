import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'

export const isNativeApp = (): boolean => {
  try {
    return typeof Capacitor !== 'undefined' &&
      typeof Capacitor.isNativePlatform === 'function' &&
      Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export const isPluginAvailable = (name: string): boolean => {
  try {
    return typeof Capacitor !== 'undefined' &&
      typeof Capacitor.isPluginAvailable === 'function' &&
      Capacitor.isPluginAvailable(name)
  } catch {
    return false
  }
}

export const convertFileSrc = (uri: string | null | undefined): string | null => {
  if (!uri) return null
  try {
    return Capacitor.convertFileSrc(uri)
  } catch {
    return uri
  }
}

export const ensureFilesystemPermissions = async (): Promise<void> => {
  if (!isNativeApp()) return
  if (typeof Filesystem.requestPermissions !== 'function') return
  try {
    await Filesystem.requestPermissions()
  } catch (err) {
    console.warn('Filesystem permission request failed', err)
  }
}

