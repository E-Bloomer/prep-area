import { Directory, Filesystem, Encoding } from '@capacitor/filesystem'
import { uint8ToBase64 } from '../utils/base64'
import { convertFileSrc, ensureFilesystemPermissions, isNativeApp } from './platform'

const IMAGE_ROOT = 'card-images'
const INDEX_FILE = `${IMAGE_ROOT}/index.json`
const INDEX_VERSION = 1

type IndexEntry = {
  path: string
  uri: string | null
  updatedAt: number
}

export type NativeImageIndex = {
  version: number
  files: Record<string, IndexEntry>
}

const EMPTY_INDEX: NativeImageIndex = { version: INDEX_VERSION, files: {} }

const sanitizeRelPath = (relPath: string): string => {
  if (!relPath) return ''
  const trimmed = relPath.replace(/^\/+/, '')
  if (trimmed.startsWith('images/')) {
    return trimmed.slice('images/'.length)
  }
  return trimmed
}

const urlToRelPath = (url: string): string => sanitizeRelPath(url.replace(/^[a-z]+:\/\/[^/]+/i, ''))

const ensureRootDirectory = async () => {
  try {
    await Filesystem.mkdir({
      path: IMAGE_ROOT,
      directory: Directory.Data,
      recursive: true
    })
  } catch (err: any) {
    const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
    if (!message.toLowerCase().includes('already exists')) {
      console.warn('Unable to ensure native image root', err)
    }
  }
}

const ensureDirectoryForFile = async (relPath: string) => {
  const sanitized = sanitizeRelPath(relPath)
  const segments = sanitized.split('/')
  segments.pop()
  if (!segments.length) return
  const dirPath = `${IMAGE_ROOT}/${segments.join('/')}`
  try {
    await Filesystem.mkdir({
      path: dirPath,
      directory: Directory.Data,
      recursive: true
    })
  } catch (err: any) {
    const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
    if (!message.toLowerCase().includes('already exists')) {
      console.warn('Unable to ensure native image directory', err)
    }
  }
}

const readIndex = async (): Promise<NativeImageIndex> => {
  if (!isNativeApp()) return EMPTY_INDEX
  await ensureFilesystemPermissions()
  await ensureRootDirectory()
  try {
    const result = await Filesystem.readFile({
      path: INDEX_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    })
    const raw = typeof result.data === 'string' ? result.data : null
    if (!raw) return { ...EMPTY_INDEX }
    const parsed = JSON.parse(raw) as NativeImageIndex
    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      return { ...EMPTY_INDEX }
    }
    if (!parsed.files || typeof parsed.files !== 'object') {
      parsed.files = {}
    }
    return parsed
  } catch (err: any) {
    const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
    if (!message.toLowerCase().includes('does not exist')) {
      console.warn('Unable to read native image index', err)
    }
    return { ...EMPTY_INDEX }
  }
}

const writeIndex = async (index: NativeImageIndex) => {
  await ensureFilesystemPermissions()
  await ensureRootDirectory()
  const payload = JSON.stringify(index)
  await Filesystem.writeFile({
    path: INDEX_FILE,
    directory: Directory.Data,
    data: payload,
    encoding: Encoding.UTF8,
    recursive: true
  })
}

const ensureEntryUri = async (entry: IndexEntry): Promise<string | null> => {
  if (entry.uri) {
    return convertFileSrc(entry.uri)
  }
  try {
    const result = await Filesystem.getUri({
      path: entry.path,
      directory: Directory.Data
    })
    entry.uri = result.uri ?? null
    return convertFileSrc(entry.uri)
  } catch (err) {
    console.warn('Unable to resolve native image URI', err)
    return null
  }
}

export type NativeImageMap = Map<string, string>

export const loadNativeImageMap = async (): Promise<NativeImageMap> => {
  if (!isNativeApp()) return new Map()
  const index = await readIndex()
  const map: NativeImageMap = new Map()
  for (const [rel, entry] of Object.entries(index.files)) {
    const resolved = await ensureEntryUri(entry)
    if (resolved) {
      map.set(rel, resolved)
    }
  }
  await writeIndex(index)
  return map
}

type DownloadCallbacks = {
  onProgress?: (completed: number, total: number) => void
}

const fetchBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn('Image fetch failed', url, response.status)
      return null
    }
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  } catch (err) {
    console.warn('Image fetch failed', url, err)
    return null
  }
}

export const downloadNativeImages = async (
  urls: string[],
  { onProgress }: DownloadCallbacks = {}
): Promise<NativeImageMap> => {
  if (!isNativeApp()) return new Map()
  await ensureFilesystemPermissions()
  await ensureRootDirectory()
  const index = await readIndex()
  const total = urls.length
  let completed = 0
  const updateProgress = () => {
    onProgress?.(completed, total)
  }
  for (const url of urls) {
    const rel = sanitizeRelPath(urlToRelPath(url))
    if (!rel) {
      completed += 1
      updateProgress()
      continue
    }
    const existing = index.files[rel]
    if (existing) {
      completed += 1
      updateProgress()
      continue
    }
    const bytes = await fetchBytes(url)
    if (!bytes) {
      completed += 1
      updateProgress()
      continue
    }
    await ensureDirectoryForFile(rel)
    const path = `${IMAGE_ROOT}/${rel}`
    let uri: string | null = null
    try {
      const writeResult = await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        data: uint8ToBase64(bytes),
        recursive: true
      })
      uri = writeResult.uri ?? null
    } catch (err) {
      console.warn('Unable to write native image', rel, err)
      completed += 1
      updateProgress()
      continue
    }
    index.files[rel] = {
      path,
      uri,
      updatedAt: Date.now()
    }
    completed += 1
    updateProgress()
  }
  const map: NativeImageMap = new Map()
  for (const [rel, entry] of Object.entries(index.files)) {
    const resolved = await ensureEntryUri(entry)
    if (resolved) {
      map.set(rel, resolved)
    }
  }
  await writeIndex(index)
  return map
}

export const countNativeImages = async (): Promise<number> => {
  if (!isNativeApp()) return 0
  const index = await readIndex()
  return Object.keys(index.files).length
}
