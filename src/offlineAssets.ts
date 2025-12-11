import manifest from './offline-image-manifest.json'

const files = Array.isArray((manifest as any)?.files) ? (manifest as any).files as string[] : []

export const OFFLINE_IMAGE_URLS: string[] = files
  .map((url) => (url.startsWith('/') ? url : `/${url.replace(/^\/*/, '')}`))
  .sort()

export const OFFLINE_IMAGE_COUNT = OFFLINE_IMAGE_URLS.length
